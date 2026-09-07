import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Clock3, Plus, Search, X } from 'lucide-react'
import { Page } from '../components/Page'
import { useAccess } from '../components/AuthorizedAccess'
import { useToast } from '../components/ToastProvider'
import { isOpportunityOverdue, opportunityLabels, opportunityPayload, opportunityStages, type OpportunityStage } from '../lib/opportunities'
import { money } from '../lib/format'
import { supabase } from '../lib/supabase'

type Opportunity = { id:string; name:string; phone:string|null; email:string|null; origin:string|null; notes:string|null; stage:OpportunityStage; estimated_value:number|null; next_follow_up_at:string|null; lost_reason:string|null }
type OpportunityForm = Omit<Opportunity,'estimated_value'|'phone'|'email'|'origin'|'notes'|'next_follow_up_at'|'lost_reason'> & { estimated_value:number|''; phone:string; email:string; origin:string; notes:string; next_follow_up_at:string; lost_reason:string }
const blank:OpportunityForm = { id:'', name:'', phone:'', email:'', origin:'', notes:'', stage:'new', estimated_value:'', next_follow_up_at:'', lost_reason:'' }

export function Prospecting(){
  const access=useAccess(), {show}=useToast()
  const [items,setItems]=useState<Opportunity[]>([]), [loading,setLoading]=useState(true), [saving,setSaving]=useState(false)
  const [search,setSearch]=useState(''), [open,setOpen]=useState(false), [form,setForm]=useState<OpportunityForm>(blank)
  const load=useCallback(async()=>{
    if(!supabase||!access){setLoading(false);return}
    setLoading(true)
    const {data,error}=await supabase.from('sales_opportunities').select('id,name,phone,email,origin,notes,stage,estimated_value,next_follow_up_at,lost_reason').eq('organization_id',access.organizationId).is('archived_at',null).order('updated_at',{ascending:false}).limit(500)
    if(error)show('Não foi possível carregar a prospecção.','error'); else setItems((data??[]) as Opportunity[])
    setLoading(false)
  },[access,show])
  useEffect(()=>{void load()},[load])
  const edit=(item?:Opportunity)=>{
    setForm(item?{...item,phone:item.phone??'',email:item.email??'',origin:item.origin??'',notes:item.notes??'',estimated_value:item.estimated_value===null?'':Number(item.estimated_value),next_follow_up_at:item.next_follow_up_at?.slice(0,16)??'',lost_reason:item.lost_reason??''}:blank)
    setOpen(true)
  }
  const save=async(event:FormEvent)=>{
    event.preventDefault(); if(!supabase||!access||saving)return; setSaving(true)
    try{
      const validated=opportunityPayload({name:form.name,stage:form.stage,lost_reason:form.lost_reason})
      const payload={organization_id:access.organizationId,name:validated.name,phone:form.phone.trim()||null,email:form.email.trim()||null,origin:form.origin.trim()||null,notes:form.notes.trim()||null,stage:form.stage,estimated_value:form.estimated_value===''?null:form.estimated_value,next_follow_up_at:form.next_follow_up_at?new Date(form.next_follow_up_at).toISOString():null,lost_reason:validated.lost_reason,created_by:access.userId}
      const query=form.id?supabase.from('sales_opportunities').update(payload).eq('organization_id',access.organizationId).eq('id',form.id):supabase.from('sales_opportunities').insert({...payload,id:crypto.randomUUID()})
      const {error}=await query; if(error)throw error
      show('Oportunidade salva.','success'); setOpen(false); await load()
    }catch(reason){show(reason instanceof Error?reason.message:'Não foi possível salvar.','error')}finally{setSaving(false)}
  }
  const filtered=useMemo(()=>{const term=search.trim().toLocaleLowerCase('pt-BR');return term?items.filter(x=>`${x.name} ${x.phone??''} ${x.origin??''}`.toLocaleLowerCase('pt-BR').includes(term)):items},[items,search])
  return <Page title="Prospecção" description="Contatos e parcerias B2B acompanhados até o orçamento, sem duplicar o cadastro do cliente." action={<button className="button primary" onClick={()=>edit()}><Plus/>Nova oportunidade</button>}>
    <section className="panel"><div className="toolbar"><label className="search"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome, telefone ou origem"/></label><span>{filtered.length} oportunidade(s)</span></div>
      {loading?<p className="panel-message">Carregando prospecção…</p>:<div className="opportunity-board">{opportunityStages.map(stage=><section className="opportunity-column" key={stage}><header><strong>{opportunityLabels[stage]}</strong><span>{filtered.filter(x=>x.stage===stage).length}</span></header>{filtered.filter(x=>x.stage===stage).map(item=><button className="opportunity-card" key={item.id} onClick={()=>edit(item)}><strong>{item.name}</strong><span>{item.phone||item.email||'Contato não informado'}</span>{item.estimated_value!==null&&item.estimated_value>0&&<b>{money.format(item.estimated_value)}</b>}{item.next_follow_up_at&&<small className={isOpportunityOverdue(item.next_follow_up_at)?'overdue':''}><Clock3/>{new Date(item.next_follow_up_at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</small>}</button>)}</section>)}</div>}
    </section>
    {open&&<div className="dialog-backdrop"><form className="dialog" onSubmit={save}><header><div><span className="eyebrow">Funil comercial</span><h2>{form.id?'Editar oportunidade':'Nova oportunidade'}</h2></div><button type="button" className="icon-button" onClick={()=>setOpen(false)}><X/></button></header><div className="form-grid"><label className="field span-2">Nome do contato<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label className="field">Telefone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label className="field">E-mail<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label className="field">Origem<input value={form.origin} onChange={e=>setForm({...form,origin:e.target.value})} placeholder="Indicação, Instagram…"/></label><label className="field">Etapa<select value={form.stage} onChange={e=>setForm({...form,stage:e.target.value as OpportunityStage})}>{opportunityStages.map(x=><option value={x} key={x}>{opportunityLabels[x]}</option>)}</select></label><label className="field">Valor estimado (opcional)<input type="number" min="0" step="0.01" value={form.estimated_value} placeholder="Não informado" onChange={e=>setForm({...form,estimated_value:e.target.value===''?'':Number(e.target.value)})}/></label><label className="field">Próximo retorno<input type="datetime-local" value={form.next_follow_up_at} onChange={e=>setForm({...form,next_follow_up_at:e.target.value})}/></label>{form.stage==='lost'&&<label className="field span-2">Motivo da perda<input required minLength={5} value={form.lost_reason} onChange={e=>setForm({...form,lost_reason:e.target.value})}/></label>}<label className="field span-2">Observações<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label></div><footer><button type="button" className="button secondary" onClick={()=>setOpen(false)}>Cancelar</button><button className="button primary" disabled={saving}>{saving?'Salvando…':'Salvar oportunidade'}</button></footer></form></div>}
  </Page>
}
