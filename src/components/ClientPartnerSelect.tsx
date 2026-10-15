import {useEffect,useState} from 'react'
import {useAccess} from './AuthorizedAccess'
import {supabase} from '../lib/supabase'
import {loadAllPages} from '../lib/loadAllPages'

type Partner={id:string;name:string;archived_at:string|null}

// This lookup must not depend on a previously loaded/filtered client table.
export function ClientPartnerSelect({value,clientId,onChange}:{value:string;clientId?:string;onChange:(id:string)=>void}){
 const access=useAccess()
 const [partners,setPartners]=useState<Partner[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{
  if(!supabase||!access?.organizationId)return
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000)
  let cancelled=false
  setLoading(true);setError('')
  void (async()=>{
   try{
    const result=await loadAllPages<Partner>((from,to)=>supabase!.from('clients').select('id,name,archived_at',{count:'exact'}).eq('organization_id',access.organizationId).eq('client_type','Parceiro/master').is('archived_at',null).order('name').order('id').range(from,to).abortSignal(controller.signal),200)
    if(result.error)throw result.error
    let rows=result.data??[]
    // Keep an existing inactive link visible, never silently replace it with "none".
    if(value&&!rows.some(row=>row.id===value)){
     const current=await supabase!.from('clients').select('id,name,archived_at').eq('organization_id',access.organizationId).eq('id',value).abortSignal(controller.signal).maybeSingle()
     if(current.error)throw current.error
     if(current.data)rows=[...rows,current.data]
    }
    if(!cancelled)setPartners(rows.filter(row=>row.id!==clientId))
   }catch{if(!cancelled)setError('Não foi possível carregar os parceiros. Tente novamente.')}
   finally{clearTimeout(timer);if(!cancelled)setLoading(false)}
  })()
  return()=>{cancelled=true;clearTimeout(timer);controller.abort()}
 // Selection changes do not need another request; the component remounts per client.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[access?.organizationId,clientId,revision])
 return <div className="field span-2"><label className="field">Parceiro/master vinculado<select value={value} disabled={loading||!!error} onChange={event=>onChange(event.target.value)}>
  <option value="">{loading?'Carregando parceiros…':error?'Parceiros indisponíveis':'Nenhum parceiro vinculado'}</option>
  {value&&!partners.some(row=>row.id===value)&&<option value={value}>Parceiro vinculado (carregando cadastro)</option>}
  {partners.map(partner=><option key={partner.id} value={partner.id}>{partner.name}{partner.archived_at?' (inativo)':''}</option>)}
 </select></label>
 {error?<small role="alert">{error} <button type="button" className="text-button" onClick={()=>setRevision(n=>n+1)}>Tentar novamente</button></small>:!loading&&<small>{partners.length?'Selecione um parceiro ativo para vincular ao cliente.':'Nenhum parceiro ativo cadastrado.'} <button type="button" className="text-button" onClick={()=>setRevision(n=>n+1)}>Atualizar parceiros</button></small>}
 </div>
}
