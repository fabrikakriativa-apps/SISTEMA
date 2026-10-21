import {useRef,useState} from 'react'
import {supabase} from '../lib/supabase'
import {useAccess} from './AuthorizedAccess'
import {useToast} from './ToastProvider'
import {channelLabels,outcomeLabels,contactSummary,commercialLabels,type ContactActivity,type CommercialPhase} from '../lib/salesFollowUp'
const localNow=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
type Props={opportunityId:string;activities:ContactActivity[];closed:boolean;canEdit:boolean;assignees:{user_id:string;full_name:string}[];onRecorded:()=>Promise<void>}
export function SalesContactHistory({opportunityId,activities,closed,canEdit,assignees,onRecorded}:Props){
 const access=useAccess(),{show}=useToast(),summary=contactSummary(activities)
 const [when,setWhen]=useState(localNow),[channel,setChannel]=useState('whatsapp'),[direction,setDirection]=useState('outbound'),[outcome,setOutcome]=useState('no_response'),[notes,setNotes]=useState(''),[next,setNext]=useState(''),[busy,setBusy]=useState(false)
 const pending=useRef(crypto.randomUUID()),lock=useRef(false)
 const register=async()=>{
  if(!supabase||!access||!canEdit||lock.current)return
  if(!when||new Date(when)>new Date()){show('Informe a data real do contato, não futura.','error');return}
  lock.current=true;setBusy(true)
  try{
   const {error}=await supabase.rpc('register_sales_contact',{org_id:access.organizationId,target_opportunity_id:opportunityId,activity_id:pending.current,contact_at:new Date(when).toISOString(),contact_channel:channel,contact_direction:direction,contact_outcome:outcome,contact_notes:notes,next_return_at:!closed&&next?new Date(next).toISOString():null})
   if(error)throw error
   await onRecorded();pending.current=crypto.randomUUID();setNotes('');setNext('');setWhen(localNow());show('Contato registrado e retorno atualizado.','success')
  }catch(e){show(e instanceof Error?e.message:(e as {message?:string})?.message||'Não foi possível registrar o contato.','error')}finally{lock.current=false;setBusy(false)}
 }
 return <details className="sales-contact-history span-2"><summary>Contatos e follow-up · {summary.attempts} tentativa(s) · {summary.responses} resposta(s)</summary>
  <p>Tentativas contam contatos de saída. Respostas recebidas são separadas. Registre apenas contatos que realmente aconteceram; nenhuma mensagem será enviada por este formulário.</p>
  <div className="sales-contact-form">
   <label className="field">Data do contato<input type="datetime-local" value={when} onChange={e=>setWhen(e.target.value)} disabled={!canEdit||busy}/></label>
   <label className="field">Canal<select value={channel} onChange={e=>setChannel(e.target.value)} disabled={!canEdit||busy}>{Object.entries(channelLabels).filter(([v])=>v!=='system').map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   <label className="field">Direção<select value={direction} onChange={e=>{setDirection(e.target.value);if(e.target.value==='inbound')setOutcome('answered')}} disabled={!canEdit||busy}><option value="outbound">Nós fizemos contato</option><option value="inbound">Contato recebido do lead</option></select></label>
   <label className="field">Resultado<select value={outcome} onChange={e=>setOutcome(e.target.value)} disabled={!canEdit||busy}>{Object.entries(outcomeLabels).filter(([v])=>v!=='stage'&&(direction!=='inbound'||v!=='no_response')).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   <label className="field span-2">Observação do contato<textarea maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)} disabled={!canEdit||busy}/></label>
   {!closed&&<label className="field span-2">Próximo retorno deste contato<input type="datetime-local" value={next} onChange={e=>setNext(e.target.value)} disabled={!canEdit||busy}/><small>Em branco: aplica o prazo automático configurado. Este registro atualiza o retorno da oportunidade.</small></label>}
  </div><button type="button" className="button secondary" onClick={()=>void register()} disabled={!canEdit||busy}>{busy?'Registrando…':'Registrar contato'}</button>
  <ol className="sales-contact-timeline">{[...activities].sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at)||b.id.localeCompare(a.id)).map(a=><li key={a.id} className={a.kind}><strong>{a.kind==='system'?'Sistema':`${channelLabels[a.channel]??a.channel} · ${a.direction==='outbound'?'Saída':'Recebido'} · ${outcomeLabels[a.outcome]??a.outcome}`}</strong><small>{new Date(a.occurred_at).toLocaleString('pt-BR')} · {a.created_by===access?.userId?'Você':assignees.find(u=>u.user_id===a.created_by)?.full_name||'Sistema / responsável do registro'}</small>{a.notes&&<p>{a.kind==='system'&&a.notes.startsWith('Etapa: ')?`Etapa: ${commercialLabels[a.notes.slice(7) as CommercialPhase]??a.notes.slice(7)}`:a.notes}</p>}{a.next_follow_up_at&&<small>Retorno agendado: {new Date(a.next_follow_up_at).toLocaleString('pt-BR')}</small>}</li>)}</ol>{!activities.length&&<p>Nenhum contato registrado. Contatos antigos não foram inventados nem contados automaticamente.</p>}
 </details>
}

