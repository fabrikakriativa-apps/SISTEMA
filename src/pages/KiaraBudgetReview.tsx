import {useCallback,useEffect,useState} from 'react'
import {CheckCircle2,FileText,RefreshCcw,Send,XCircle} from 'lucide-react'
import {useAccess} from '../components/AuthorizedAccess'
import {supabase} from '../lib/supabase'
import {kiaraBudgetReviewConfigured,reviewKiaraBudget,type KiaraBudgetAction} from '../lib/kiaraBudgetReview'

type Draft={
 id:string;status:'pending_review'|'approved'|'rejected'|'sent'|'cancelled';
 created_at:string;reviewed_at:string|null;sent_at:string|null;
 structured_budget:{
  environment?:string;dimensions?:string;price_brl?:string|null;
  configuration_status?:string;configuration_revision?:number;
  rail_type_for_review?:string;test_only?:boolean;
  items?:Array<{environment?:string;model?:string;width?:number;height?:number;frontCategory?:string;backCategory?:string;quantity?:number}>
 };
}
const formatMoney=(v:string|number|null|undefined)=>v==null?'Valor pendente':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const statusText:Record<Draft['status'],string>={
 pending_review:'Aguardando revisão',approved:'Aprovado — ainda não enviado',
 rejected:'Rejeitado',sent:'Enviado ao WhatsApp',cancelled:'Cancelado'
}
export function KiaraBudgetReview({conversationId}:{conversationId:string|null}){
 const access=useAccess()
 const [drafts,setDrafts]=useState<Draft[]>([])
 const [loading,setLoading]=useState(false)
 const [busy,setBusy]=useState<string|null>(null)
 const [feedback,setFeedback]=useState('')
 const [refresh,setRefresh]=useState(0)
 const [verified,setVerified]=useState<Record<string,boolean>>({})
 const reload=useCallback(()=>setRefresh(v=>v+1),[])
 const canView=Boolean(access&&['admin','comercial'].includes(access.role))
 const canReview=access?.role==='admin'
 useEffect(()=>{
  if(!conversationId||!supabase||!canView||!access){setDrafts([]);return}
  let active=true
  setLoading(true)
  void supabase.from('kiara_budget_drafts')
   .select('id,status,created_at,reviewed_at,sent_at,structured_budget')
   .eq('organization_id',access.organizationId)
   .eq('conversation_id',conversationId)
   .order('created_at',{ascending:false}).limit(10)
   .then(({data,error})=>{
    if(!active)return
    setDrafts((data||[]) as Draft[])
    setFeedback(error?'Não foi possível consultar os pré-orçamentos.':'')
    setLoading(false)
   })
  return ()=>{active=false}
 },[conversationId,access?.organizationId,canView,refresh])
 async function act(draft:Draft,action:KiaraBudgetAction){
  if(!canReview||busy)return
  if(action==='send'&&!window.confirm('Enviar o valor aprovado para o contato autorizado de testes? Esta ação envia uma mensagem real pelo WhatsApp.'))return
  setBusy(draft.id);setFeedback('')
  try{
   const result=await reviewKiaraBudget(draft.id,action)
   setFeedback(action==='approve'?'Pré-orçamento aprovado. Ele ainda não foi enviado.':
    action==='reject'?'Pré-orçamento rejeitado.':
    result.sent?'Estimativa enviada para o contato de testes.':'Envio não confirmado.')
   reload()
  }catch(error){setFeedback(error instanceof Error?error.message:'Não foi possível concluir a ação.')}
  finally{setBusy(null)}
 }
 if(!conversationId||!canView)return null
 return <section className="kiara-budget-review" aria-label="Pré-orçamentos da conversa">
   <div className="kiara-budget-heading">
    <h3><FileText size={18}/> Pré-orçamentos para conferência</h3>
    <button type="button" onClick={reload} disabled={loading} aria-label="Atualizar orçamentos"><RefreshCcw size={16}/></button>
   </div>
   <p className="kiara-budget-help">Valores internos não são enviados pela Kiara automaticamente. A aprovação e o envio exigem ações distintas de um administrador.</p>
   {loading&&<p>Consultando pré-orçamentos...</p>}
   {!loading&&!drafts.length&&<p>Nenhum pré-orçamento preparado para esta conversa.</p>}
   {drafts.map(draft=><article key={draft.id} className="kiara-budget-item">
    <div className="kiara-budget-meta"><strong>{statusText[draft.status]}</strong><small>{new Date(draft.created_at).toLocaleString('pt-BR')}</small></div>
    <p><strong>{draft.structured_budget.environment||'Ambiente não identificado'}</strong> · {draft.structured_budget.dimensions}</p>
    {(draft.structured_budget.items||[]).map((item,i)=><p key={i} className="kiara-budget-line">
      {item.environment}: {item.model}, {item.frontCategory}, {item.width} × {item.height} m,
      {item.backCategory==='Sem forro'?' sem forro':' forro: '+String(item.backCategory)}
    </p>)}
    <p className="kiara-budget-price">{formatMoney(draft.structured_budget.price_brl)}</p>
    <small>Configuração comercial {draft.structured_budget.configuration_status||'não informada'} · Revisão {draft.structured_budget.configuration_revision??'—'}.
      Valor preliminar sujeito à revisão humana e visita técnica. Trilho de referência interno: {draft.structured_budget.rail_type_for_review||'não identificado'} — confirme antes de aprovar.</small>
    {canReview&&kiaraBudgetReviewConfigured&&draft.structured_budget.test_only&&<div className="kiara-budget-actions">
      {draft.status==='pending_review'&&<>
       <label className="kiara-budget-verify"><input type="checkbox" checked={Boolean(verified[draft.id])} onChange={event=>setVerified(v=>({...v,[draft.id]:event.target.checked}))}/> Conferi o tecido, as medidas, o forro e o trilho de referência.</label>
       <button type="button" disabled={busy===draft.id||!draft.structured_budget.price_brl||!verified[draft.id]} onClick={()=>void act(draft,'approve')}><CheckCircle2 size={16}/> Aprovar</button>
       <button type="button" disabled={busy===draft.id} onClick={()=>void act(draft,'reject')}><XCircle size={16}/> Rejeitar</button>
      </>}
      {draft.status==='approved'&&<button type="button" disabled={busy===draft.id} onClick={()=>void act(draft,'send')}><Send size={16}/> Enviar valor aprovado</button>}
    </div>}
   </article>)}
   {feedback&&<p role="status" className="kiara-budget-feedback">{feedback}</p>}
 </section>
}
