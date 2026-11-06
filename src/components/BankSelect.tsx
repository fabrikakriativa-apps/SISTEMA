import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from './ToastProvider'

export function BankSelect({ organizationId, value, onChange, direction }: { organizationId: string; value: string; onChange: (id: string) => void; direction: 'in' | 'out' }) {
  const { show } = useToast()
  const [banks, setBanks] = useState<{id:string;name:string}[]>([])
  const [adding, setAdding] = useState(false), [name,setName]=useState(''), [busy,setBusy]=useState(false), [failed,setFailed]=useState(false)
  useEffect(()=>{let active=true;setBusy(true);void supabase?.from('finance_banks').select('id,name').eq('organization_id',organizationId).eq('active',true).order('name').then(({data,error})=>{if(!active)return;setBusy(false);setFailed(Boolean(error));if(!error)setBanks(data??[])});return()=>{active=false}},[organizationId])
  const add=async()=>{
    if(!supabase||busy||!name.trim())return
    setBusy(true)
    try {
      const {data,error}=await supabase.from('finance_banks').insert({organization_id:organizationId,name:name.trim()}).select('id,name').single()
      if(error||!data){show(error?.code==='23505'?'Esse banco já está cadastrado.':'Não foi possível cadastrar o banco. Verifique sua permissão.','error');return}
      setBanks(current=>[...current,data].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')));onChange(data.id);setName('');setAdding(false)
    } catch {show('Não foi possível cadastrar o banco. Tente novamente.','error')} finally {setBusy(false)}
  }
  return <div className="field span-2"><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}><label htmlFor={`bank-${direction}`}>Banco {direction==='in'?'do recebimento':'do pagamento'}</label><button type="button" className="button secondary" style={{padding:'5px 9px',fontSize:12}} onClick={()=>setAdding(current=>!current)}>+ Novo banco</button></div>
    <select id={`bank-${direction}`} required disabled={busy||failed} value={value} onChange={event=>onChange(event.target.value)}><option value="">{busy?'Carregando bancos…':'Selecione o banco'}</option>{banks.map(bank=><option key={bank.id} value={bank.id}>{bank.name}</option>)}</select>
    {failed&&<small role="alert">Não foi possível carregar os bancos. Reabra a tela para tentar novamente.</small>}
    {adding&&<div style={{display:'flex',gap:8}}><input aria-label="Nome do banco" maxLength={100} placeholder="Nome do banco" value={name} onChange={event=>setName(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void add()}}}/><button type="button" className="button secondary" disabled={busy||!name.trim()} onClick={()=>void add()}>Salvar banco</button></div>}
  </div>
}
