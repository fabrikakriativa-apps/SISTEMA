import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react'
import {Plus,Search,X,BarChart3,RefreshCw} from 'lucide-react'
import {Page} from '../components/Page'
import {useAccess} from '../components/AuthorizedAccess'
import {useToast} from '../components/ToastProvider'
import {SearchSelect} from '../components/SearchSelect'
import {supabase} from '../lib/supabase'
import {loadAllPages} from '../lib/loadAllPages'
import {navigateTo} from '../lib/navigation'
import {opportunityPayload,type OpportunityStage} from '../lib/opportunities'
import {linkedBudgetIds,profileLabels,salesDay,validateLeadTracking,type SalesLead,type LeadProfile,type SalesBudget,type SalesOrder} from '../lib/salesResults'
import {SalesResults} from './SalesResults'
import {withOpportunityClient} from '../lib/opportunityClient'
import {cancellationNote} from '../lib/opportunityCancellation'
import './SalesResults.css'
import './SalesProspecting.css'

type Lead=SalesLead&{phone:string|null;email:string|null;notes:string|null;estimated_value:number|null;next_follow_up_at:string|null;lost_reason:string|null;client_id:string|null}
type Client={id:string;name:string;phone:string|null;email:string|null;city:string|null}
type Form=Omit<Lead,'estimated_value'>&{estimated_value:number|''}
const fresh=():Form=>({id:'',name:'',phone:'',email:'',notes:'',origin:'',stage:'new',estimated_value:'',next_follow_up_at:'',lost_reason:'',client_id:null,budget_id:null,related_budget_ids:[],received_on:salesDay(new Date().toISOString()),profile_status:'unassessed',profile_reason:'',capture_source:'',campaign:'',customer_kind:'new_lead',response_status:'active'})
const columns=[['new','Novo contato'],['contacted','Em atendimento'],['qualified','Qualificado (anterior)'],['budgeting','Em orçamento'],['waiting','Aguardando resposta'],['no_response','Encerrado sem retorno'],['won','Ganho'],['lost','Perdido']] as const
export function SalesProspecting(){
 const access=useAccess(),{show}=useToast()
 const [items,setItems]=useState<Lead[]>([]),[clients,setClients]=useState<Client[]>([]),[budgets,setBudgets]=useState<SalesBudget[]>([]),[orders,setOrders]=useState<SalesOrder[]>([])
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[saving,setSaving]=useState(false),[open,setOpen]=useState(false),[form,setForm]=useState<Form>(fresh),[search,setSearch]=useState(''),[clientSearch,setClientSearch]=useState(''),[budgetSearch,setBudgetSearch]=useState(''),[results,setResults]=useState(false)
 const canEdit=Boolean(access&&['admin','comercial'].includes(access.role))
 const [cancelled,setCancelled]=useState(false),[cancelling,setCancelling]=useState(false),[cancelReason,setCancelReason]=useState('')
 const load=useCallback(async()=>{
  if(!supabase||!access){setLoading(false);return}setLoading(true);setError('')
  const org=access.organizationId
  try{
   const [l,c,b,o]=await Promise.all([
    loadAllPages<Lead>((from,to)=>supabase!.from('sales_opportunities').select('*',{count:'exact'}).eq('organization_id',org).order('updated_at',{ascending:false}).order('id').range(from,to)),
    loadAllPages<Client>((from,to)=>supabase!.from('clients').select('id,name,phone,email,city',{count:'exact'}).eq('organization_id',org).is('archived_at',null).order('name').order('id').range(from,to)),
    loadAllPages<SalesBudget>((from,to)=>supabase!.from('budgets').select('id,display_number,client_id,status,created_at,total',{count:'exact'}).eq('organization_id',org).order('created_at',{ascending:false}).order('id').range(from,to)),
    loadAllPages<SalesOrder>((from,to)=>supabase!.from('orders').select('id,display_number,budget_id,status,created_at,total',{count:'exact'}).eq('organization_id',org).order('id').range(from,to))
   ])
   if(l.error||c.error||b.error||o.error)throw new Error('Não foi possível carregar a prospecção e seus vínculos. Tente atualizar.')
   setItems(l.data??[]);setClients(c.data??[]);setBudgets(b.data??[]);setOrders(o.data??[])
  }catch(e){setError(e instanceof Error?e.message:'Falha de carregamento.')}finally{setLoading(false)}
 },[access])
 useEffect(()=>{void load()},[load])
 const won=(lead:SalesLead)=>orders.some(o=>o.status!=='cancelled'&&linkedBudgetIds(lead).includes(o.budget_id))
 const column=(lead:Lead)=>won(lead)?'won':lead.response_status==='no_response'?'no_response':lead.stage==='lost'?'lost':lead.response_status==='waiting'?'waiting':lead.stage
 const edit=(lead?:Lead)=>{setCancelling(false);setCancelReason('');setForm(lead?{...lead,estimated_value:lead.estimated_value??'',next_follow_up_at:lead.next_follow_up_at?.slice(0,16)??''}:fresh());setClientSearch(clients.find(c=>c.id===lead?.client_id)?.name??'');setBudgetSearch('');setOpen(true)}
 const archive=async(restore=false)=>{
  if(!supabase||!access||!canEdit||saving||!form.id)return
  setSaving(true)
  try{
   const original=items.find(l=>l.id===form.id);if(!original)throw new Error('Atualize a lista e tente novamente.')
   const at=new Date().toISOString()
   const data=restore?{archived_at:null}:{archived_at:at,notes:cancellationNote(original.notes,cancelReason,at)}
   let query=supabase.from('sales_opportunities').update(data).eq('organization_id',access.organizationId).eq('id',form.id)
   query=restore?query.eq('archived_at',original.archived_at!):query.is('archived_at',null)
   const {error}=await query.select('id').single();if(error)throw error
   setOpen(false);setCancelling(false);show(restore?'Lançamento restaurado.':'Lançamento cancelado. Cliente, orçamentos e pedidos foram preservados.','success');await load()
  }catch(e){show(e instanceof Error?e.message:'Não foi possível atualizar o lançamento.','error')}finally{setSaving(false)}
 }
 const payload=()=>{
  validateLeadTracking(form)
  const validated=opportunityPayload({name:form.name,stage:form.stage as OpportunityStage,lost_reason:form.response_status==='no_response'?'Encerrado sem retorno':form.lost_reason??''})
  return {name:validated.name,phone:form.phone?.trim()||null,email:form.email?.trim()||null,origin:form.origin?.trim()||null,notes:form.notes?.trim()||null,stage:form.stage,estimated_value:form.estimated_value===''?null:Number(form.estimated_value),next_follow_up_at:form.next_follow_up_at?new Date(form.next_follow_up_at).toISOString():null,lost_reason:validated.lost_reason,client_id:form.client_id||null,budget_id:form.budget_id,related_budget_ids:form.related_budget_ids,received_on:form.received_on||null,profile_status:form.profile_status,profile_reason:form.profile_reason?.trim()||null,capture_source:form.capture_source?.trim()||null,campaign:form.campaign?.trim()||null,customer_kind:form.customer_kind,response_status:form.response_status}
 }
 const persist=async()=>{
  if(!supabase||!access)throw new Error('Sessão indisponível.')
  const id=form.id||crypto.randomUUID(),data=payload()
  const query=form.id?supabase.from('sales_opportunities').update(data).eq('organization_id',access.organizationId).eq('id',id):supabase.from('sales_opportunities').insert({...data,id,organization_id:access.organizationId,created_by:access.userId})
  const {error}=await query.select('id').single();if(error)throw error
  return id
 }
 const save=async(e:FormEvent)=>{e.preventDefault();if(saving||!canEdit||cancelling||form.archived_at)return;setSaving(true);try{await persist();setOpen(false);show('Oportunidade salva.','success');await load()}catch(e){show(e instanceof Error?e.message:'Não foi possível salvar.','error')}finally{setSaving(false)}}
 const createBudget=async()=>{
  if(!supabase||!access||saving||!form.id||!canEdit)return;setSaving(true)
  try{const id=await persist();const {data,error}=await supabase.rpc('convert_opportunity_to_budget',{org_id:access.organizationId,target_opportunity_id:id});if(error)throw error;setOpen(false);await load();navigateTo('orcamentos',(data as {id:string}).id);show('Cliente vinculado e rascunho de orçamento criado.','success')}catch(e){show(e instanceof Error?e.message:'Não foi possível criar o orçamento.','error')}finally{setSaving(false)}
 }
 const filtered=useMemo(()=>items.filter(l=>Boolean(l.archived_at)===cancelled&&`${l.name} ${l.phone??''} ${l.origin??''} ${l.campaign??''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))),[items,search,cancelled])
 const chosen=linkedBudgetIds(form)
 const documentOptions=budgets.filter(b=>!chosen.includes(b.id)&&(!form.client_id||b.client_id===form.client_id)&&!items.some(l=>!l.archived_at&&l.id!==form.id&&linkedBudgetIds(l).includes(b.id)))
 const visibleColumns=columns.filter(([key])=>key!=='qualified'||filtered.some(l=>column(l)==='qualified'))
 const possibleDuplicate=items.find(l=>l.id!==form.id&&!l.archived_at&&((form.phone&&l.phone&&form.phone.replace(/\D/g,'')===l.phone.replace(/\D/g,''))||(form.client_id&&l.client_id===form.client_id)))
 return <Page title="Prospecção" description="Acompanhe o atendimento, avalie o perfil e veja o resultado da captação." action={<div className="sales-actions"><button className="button secondary" onClick={()=>void load()} disabled={loading}><RefreshCw/>Atualizar</button><button className="button primary" disabled={!canEdit} onClick={()=>edit()}><Plus/>Nova oportunidade</button></div>}>
  <div className="sales-view-tabs sales-prospecting-tabs"><button className={`button ${!results?'primary':'secondary'}`} onClick={()=>setResults(false)}>Atendimento</button><button className={`button ${results?'primary':'secondary'}`} onClick={()=>setResults(true)}><BarChart3/>Resultados</button></div>
  {error?<section className="panel panel-message" role="alert">{error}</section>:loading?<p role="status">Carregando prospecção…</p>:results?<SalesResults leads={items} budgets={budgets} orders={orders} onOpenLead={edit}/>:<section className="panel sales-board-panel"><div className="toolbar"><label className="search"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome, telefone, origem ou campanha"/></label><label className="field sales-launch-filter">Exibir lançamentos<select value={cancelled?'cancelled':'active'} onChange={e=>setCancelled(e.target.value==='cancelled')}><option value="active">Ativos</option><option value="cancelled">Cancelados (histórico)</option></select></label><span>{filtered.length} oportunidade(s)</span></div><div className="opportunity-board sales-kanban">{visibleColumns.map(([key,label])=><section className="opportunity-column" key={key}><header><strong>{label}</strong><span>{filtered.filter(l=>column(l)===key).length}</span></header>{filtered.filter(l=>column(l)===key).map(l=><button className="opportunity-card sales-kanban-card" key={l.id} onClick={()=>edit(l)}><strong title={l.name}>{l.name}</strong><span className={`sales-profile ${l.profile_status}`}>{profileLabels[l.profile_status]}</span><small className="sales-card-orders" title={orders.filter(o=>o.status!=='cancelled'&&linkedBudgetIds(l).includes(o.budget_id)).map(o=>o.display_number).join(' · ')}>{orders.filter(o=>o.status!=='cancelled'&&linkedBudgetIds(l).includes(o.budget_id)).map(o=>o.display_number).join(' · ')||'Sem pedido'}</small><small className="sales-card-origin" title={l.origin||l.capture_source||'Origem não informada'}>Origem: {l.origin||l.capture_source||'Não informada'}</small></button>)}</section>)}</div></section>}
  {open&&<div className="dialog-backdrop"><form className="dialog sales-lead-dialog" onSubmit={save}><header><div><span className="eyebrow">Atendimento e perfil</span><h2>{form.id?'Editar oportunidade':'Nova oportunidade'}</h2></div><button type="button" className="icon-button" aria-label="Fechar oportunidade" onClick={()=>setOpen(false)}><X/></button></header>{!cancelling&&<fieldset disabled={!canEdit||saving||Boolean(form.archived_at)} className="sales-fieldset"><div className="form-grid">
   <label className="field span-2">Nome do contato<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
   <label className="field span-2">Cliente já cadastrado (opcional)<SearchSelect ariaLabel="Buscar cliente da oportunidade" value={clientSearch} onChange={v=>{setClientSearch(v);if(!v.trim())setForm({...form,client_id:null})}} onSelect={o=>{const client=clients.find(c=>c.id===o.id);if(!client)return;setClientSearch(client.name);setForm(current=>withOpportunityClient(current,client,clients.find(c=>c.id===current.client_id)))}} options={clients.map(c=>({id:c.id,label:c.name,detail:c.phone||c.city||undefined}))} placeholder="Digite para localizar um cliente"/><small>Ao selecionar, nome, telefone e e-mail disponíveis são preenchidos. Você pode ajustar o contato sem alterar o cadastro do cliente.</small></label>
   <label className="field">Telefone<input value={form.phone??''} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label className="field">E-mail<input type="email" value={form.email??''} onChange={e=>setForm({...form,email:e.target.value})}/></label>
   {possibleDuplicate&&<p className="span-2 inline-warning" role="status">Já existe uma oportunidade para este cliente ou telefone: {possibleDuplicate.name}. Se for o mesmo atendimento, use o registro existente para não duplicar o lead. Para uma nova demanda de cliente antigo, selecione Recompra.</p>}
   <label className="field">Data de entrada do contato<input type="date" max={salesDay(new Date().toISOString())} value={form.received_on??''} onChange={e=>setForm({...form,received_on:e.target.value||null})}/><small>Data real da chegada, não a data do cadastro. Deixe em branco se desconhecida.</small></label>
   <label className="field">Tipo de oportunidade<select value={form.customer_kind} onChange={e=>setForm({...form,customer_kind:e.target.value as Form['customer_kind']})}><option value="new_lead">Novo lead</option><option value="repeat">Cliente existente / recompra</option><option value="unknown">Não informado</option></select></label>
   <label className="field">Origem<input value={form.origin??''} onChange={e=>setForm({...form,origin:e.target.value})} placeholder="Instagram, Google, indicação…"/></label>
   <label className="field">Captação<input list="sales-capture" value={form.capture_source??''} onChange={e=>setForm({...form,capture_source:e.target.value})} placeholder="Agência de marketing, orgânico…"/><datalist id="sales-capture"><option>Agência de marketing</option><option>Orgânico</option><option>Indicação</option><option>Loja</option></datalist></label>
   <label className="field span-2">Campanha (opcional)<input value={form.campaign??''} onChange={e=>setForm({...form,campaign:e.target.value})}/></label>
   <label className="field">Perfil do lead<select value={form.profile_status} onChange={e=>setForm({...form,profile_status:e.target.value as LeadProfile})}>{Object.entries(profileLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><small>Independente da compra: avalie a compatibilidade com sua proposta de valor.</small></label>
   <label className="field">Motivo / observação do perfil<input required={form.profile_status==='out_of_profile'} minLength={form.profile_status==='out_of_profile'?3:undefined} value={form.profile_reason??''} onChange={e=>setForm({...form,profile_reason:e.target.value})} placeholder="Obrigatório para fora de perfil"/></label>
   <label className="field">Etapa do atendimento<select value={form.stage} onChange={e=>setForm({...form,stage:e.target.value})}><option value="new">Novo contato</option><option value="contacted">Em atendimento</option>{form.stage==='qualified'&&<option value="qualified">Qualificado (anterior)</option>}<option value="budgeting">Em orçamento</option>{form.stage==='won'&&<option value="won">Convertido (registro anterior)</option>}<option value="lost">Perdido por decisão</option></select><small>Ganho é identificado pelo pedido vinculado, sem mudar o perfil.</small></label>
   <label className="field">Situação do retorno<select value={form.response_status} onChange={e=>setForm({...form,response_status:e.target.value as Form['response_status']})}><option value="active">Em atendimento</option><option value="waiting">Aguardando resposta</option><option value="no_response">Encerrado sem retorno</option></select></label>
   {form.stage==='lost'&&form.response_status!=='no_response'&&<label className="field span-2">Motivo da perda<input required minLength={5} value={form.lost_reason??''} onChange={e=>setForm({...form,lost_reason:e.target.value})}/></label>}
   <label className="field">Valor estimado<input type="number" min="0" step="0.01" value={form.estimated_value} onChange={e=>setForm({...form,estimated_value:e.target.value===''?'':Number(e.target.value)})}/></label><label className="field">Próximo retorno<input type="datetime-local" value={form.next_follow_up_at??''} onChange={e=>setForm({...form,next_follow_up_at:e.target.value})}/></label>
   <section className="span-2 sales-document-links"><h3>Orçamentos desta oportunidade</h3><small>Vincule os documentos certos para acompanhar propostas e pedidos automaticamente. Não basta ter o mesmo cliente.</small>{chosen.map(id=><div className="sales-linked-document" key={id}><button type="button" className="text-button" onClick={()=>navigateTo('orcamentos',id)}>{budgets.find(b=>b.id===id)?.display_number??'Orçamento vinculado'}</button>{id!==form.budget_id&&<button type="button" className="text-button" onClick={()=>setForm({...form,related_budget_ids:form.related_budget_ids.filter(v=>v!==id)})}>Desvincular</button>}</div>)}<SearchSelect ariaLabel="Vincular orçamento à oportunidade" value={budgetSearch} onChange={setBudgetSearch} onSelect={o=>{setForm({...form,related_budget_ids:[...form.related_budget_ids,o.id]});setBudgetSearch('')}} options={documentOptions.map(b=>({id:b.id,label:b.display_number,detail:clients.find(c=>c.id===b.client_id)?.name}))} placeholder="Busque o número do pré-orçamento ou orçamento"/>{won(form)&&<p className="sales-win-note">Compra confirmada: esta oportunidade aparece como Ganha no quadro e no painel.</p>}</section>
   <label className="field span-2">Observações<textarea value={form.notes??''} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
  </div></fieldset>}{cancelling&&<section className="sales-cancel-confirm" aria-label="Confirmar cancelamento"><h3>Cancelar lançamento</h3><p>Este lançamento sairá do quadro ativo e dos indicadores de leads. Cliente, orçamentos e pedidos não serão cancelados. O histórico será preservado.</p><label className="field">Motivo do cancelamento<input value={cancelReason} onChange={e=>setCancelReason(e.target.value)} placeholder="Erro de cadastro, duplicidade…" disabled={saving}/></label><div className="sales-cancel-actions"><button type="button" className="button secondary" disabled={saving} onClick={()=>setCancelling(false)}>Voltar</button><button type="button" className="button danger" disabled={saving||cancelReason.trim().length<5} onClick={()=>void archive()}>Confirmar cancelamento</button></div></section>}{!cancelling&&<footer><button type="button" className="button secondary" onClick={()=>setOpen(false)}>Fechar</button>{form.id&&canEdit&&!form.archived_at&&<button type="button" className="button secondary" disabled={saving} onClick={()=>setCancelling(true)}>Cancelar lançamento</button>}{form.archived_at&&canEdit&&<button type="button" className="button secondary" disabled={saving} onClick={()=>void archive(true)}>Restaurar lançamento</button>}{form.id&&!form.archived_at&&!form.budget_id&&form.stage!=='lost'&&<button type="button" className="button secondary" disabled={saving||!canEdit||cancelling} onClick={()=>void createBudget()}>Criar cliente e orçamento</button>}<button className="button primary" disabled={saving||!canEdit||Boolean(form.archived_at)||cancelling}>{saving?'Salvando…':'Salvar oportunidade'}</button></footer>}</form></div>}
 </Page>
}

