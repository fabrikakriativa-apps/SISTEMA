import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, FileText, Plus, Search, X } from 'lucide-react'
import { Page } from '../components/Page'
import { useAccess } from '../components/AuthorizedAccess'
import { useToast } from '../components/ToastProvider'
import { money } from '../lib/format'
import { supabase } from '../lib/supabase'
import { itemCostTotal, salePriceFromMargin } from '../lib/budgetItems'
import { extractPdfText } from '../lib/pdfText'
import { parseManufacturerText, type ParsedManufacturerDocument } from '../lib/manufacturerPdf'
import { BudgetPreview } from '../components/BudgetPreview'
import { budgetStatusLabels as labels, budgetStatusOptions, statusNeedsReason, type BudgetStatus } from '../lib/budgetStatus'
import { navigateTo, readRoute } from '../lib/navigation'

type Budget = {
  id:string; number:number; display_number:string; current_revision:number; client_id:string|null
  status:BudgetStatus; valid_until:string|null; payment_terms:string|null; delivery_terms:string|null
  notes:string|null; internal_notes:string|null; subtotal:number; discount:number; total:number
  created_at:string; updated_at:string; client:{name:string}|null
}
type Client = { id:string; name:string; client_type:string }
type Editable = Pick<Budget,'client_id'|'valid_until'|'payment_terms'|'delivery_terms'|'notes'|'internal_notes'|'discount'>
type Family={id:string;name:string;code:string;form_key:string}
type BudgetItem={id:string;family_id:string|null;position:number;presentation:string;environment:string|null;description:string;quantity:number;configuration:Record<string,unknown>;cost_total:number;margin_percent:number|null;sale_total:number;affects_total:boolean;family:{name:string}|null}
type ItemForm={id?:string;family_id:string;environment:string;description:string;quantity:number;presentation:'principal'|'option';manufacturer_cost:number;installation_cost:number;additional_cost:number;margin_percent:number;sale_total:number}
type PdfRow={selected:boolean;environment:string;presentation:'principal'|'option';margin_percent:number;sale_total:number}

const blankEditable:Editable = { client_id:null, valid_until:null, payment_terms:'', delivery_terms:'', notes:'', internal_notes:'', discount:0 }
const blankItem:ItemForm={family_id:'',environment:'',description:'',quantity:1,presentation:'principal',manufacturer_cost:0,installation_cost:0,additional_cost:0,margin_percent:50,sale_total:0}
const columns = 'id,number,display_number,current_revision,client_id,status,valid_until,payment_terms,delivery_terms,notes,internal_notes,subtotal,discount,total,created_at,updated_at,client:clients!budgets_client_id_fkey(name)'

function errorMessage(error:unknown, fallback:string) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  return code === '42501' ? 'Seu perfil não possui permissão para alterar orçamentos.' : fallback
}

export function Budgets() {
  const access = useAccess()
  const { show } = useToast()
  const [items,setItems] = useState<Budget[]>([]), [clients,setClients] = useState<Client[]>([])
  const [loading,setLoading] = useState(true), [creating,setCreating] = useState(false)
  const [error,setError] = useState(''), [search,setSearch] = useState('')
  const [selected,setSelected] = useState<Budget|null>(null), [form,setForm] = useState<Editable>(blankEditable)
  const [saveState,setSaveState] = useState<'idle'|'waiting'|'saving'|'saved'|'error'>('idle')
  const saveTimer = useRef<number>(), initialized = useRef(false), saving = useRef(false), pending = useRef<Editable|null>(null), selectedRef = useRef<Budget|null>(null)

  const load = useCallback(async () => {
    if (!supabase || !access) return
    setLoading(true); setError('')
    try {
      const [budgetResult,clientResult] = await Promise.all([
        supabase.from('budgets').select(columns).eq('organization_id',access.organizationId).order('number',{ascending:false}).abortSignal(AbortSignal.timeout(15000)),
        supabase.from('clients').select('id,name,client_type').eq('organization_id',access.organizationId).is('archived_at',null).order('name').abortSignal(AbortSignal.timeout(15000)),
      ])
      if (budgetResult.error) throw budgetResult.error
      if (clientResult.error) throw clientResult.error
      setItems((budgetResult.data ?? []) as unknown as Budget[]); setClients((clientResult.data ?? []) as Client[])
    } catch (reason) { setError(errorMessage(reason,'Não foi possível carregar os orçamentos. Verifique a conexão e tente novamente.')) }
    finally { setLoading(false) }
  },[access])

  useEffect(() => { void load() },[load])
  useEffect(() => { const id=readRoute(window.location.hash).recordId;if(id&&items.length&&!selected){const budget=items.find(item=>item.id===id);if(budget)openEditor(budget)} },[items])
  useEffect(() => { if(selected)navigateTo('orcamentos',selected.id) },[selected?.id])
  useEffect(() => () => { if(saveTimer.current) window.clearTimeout(saveTimer.current) },[])

  const openEditor = (budget:Budget) => {
    initialized.current = false; selectedRef.current=budget; setSelected(budget)
    setForm({ client_id:budget.client_id, valid_until:budget.valid_until, payment_terms:budget.payment_terms??'', delivery_terms:budget.delivery_terms??'', notes:budget.notes??'', internal_notes:budget.internal_notes??'', discount:Number(budget.discount)||0 })
    setSaveState('saved'); window.setTimeout(() => { initialized.current = true },0)
  }

  const persist = useCallback(async (next:Editable) => {
    const currentBudget=selectedRef.current
    if (!supabase || !currentBudget) return
    if (saving.current) { pending.current = next; return }
    saving.current = true; setSaveState('saving')
    try {
      const total = Math.max(0,Number(currentBudget.subtotal)-Number(next.discount||0))
      const { data,error } = await supabase.from('budgets').update({ ...next, client_id:next.client_id||null, valid_until:next.valid_until||null, total }).eq('id',currentBudget.id).eq('organization_id',access!.organizationId).select(columns).single()
      if (error) throw error
      const saved = data as unknown as Budget
      selectedRef.current=saved; setSelected(saved); setItems(current=>current.map(item=>item.id===saved.id?saved:item)); setSaveState('saved')
    } catch (reason) { setSaveState('error'); show(errorMessage(reason,'Não foi possível salvar o rascunho. Seus dados permanecem na tela.'),'error') }
    finally {
      saving.current=false
      const queued=pending.current; pending.current=null
      if(queued&&JSON.stringify(queued)!==JSON.stringify(next)) void persist(queued)
    }
  },[access,show])

  useEffect(() => {
    if(!selected||!initialized.current) return
    setSaveState('waiting'); if(saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current=window.setTimeout(()=>{void persist(form)},700)
  },[form,persist,selected?.id])

  const create = async () => {
    if(!supabase||!access||creating) return
    setCreating(true)
    try {
      const {data,error}=await supabase.rpc('create_budget_draft',{org_id:access.organizationId})
      if(error) throw error
      const budget={...(data as Omit<Budget,'client'>),client:null} as Budget
      setItems(current=>[budget,...current]); openEditor(budget); show('Rascunho criado e protegido no banco.','success')
    } catch(reason){show(errorMessage(reason,'Não foi possível criar o orçamento.'),'error')}
    finally{setCreating(false)}
  }

  const filtered=useMemo(()=>items.filter(item=>`${item.display_number} ${item.client?.name??''} ${labels[item.status]}`.toLowerCase().includes(search.toLowerCase())),[items,search])
  const counts=useMemo(()=>({draft:items.filter(x=>x.status==='draft').length,sent:items.filter(x=>x.status==='sent').length,approved:items.filter(x=>x.status==='approved').length,rejected:items.filter(x=>x.status==='rejected').length}),[items])
  if(selected) return <BudgetEditor access={access!} budget={selected} setBudget={budget=>{selectedRef.current=budget;setSelected(budget);setItems(current=>current.map(item=>item.id===budget.id?budget:item))}} form={form} setForm={setForm} clients={clients} saveState={saveState} close={()=>{initialized.current=false;selectedRef.current=null;setSelected(null);navigateTo('orcamentos')}}/>

  return <Page title="Orçamentos" description="Rascunhos automáticos, revisões preservadas e uma única versão para tela, PDF e WhatsApp." action={<button className="button primary" disabled={creating} onClick={create}><Plus/>{creating?'Criando…':'Novo orçamento'}</button>}>
    {loading&&<p role="status">Carregando orçamentos…</p>}{error&&<p role="alert">{error} <button className="button secondary" onClick={load}>Tentar novamente</button></p>}
    <section className="status-grid"><article><span>Rascunhos</span><strong>{counts.draft}</strong></article><article><span>Enviados</span><strong>{counts.sent}</strong></article><article><span>Aprovados</span><strong>{counts.approved}</strong></article><article><span>Reprovados</span><strong>{counts.rejected}</strong></article></section>
    <section className="panel"><div className="toolbar"><label className="search"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cliente, número ou status"/></label><span>{filtered.length} orçamento(s)</span></div><div className="table-wrap"><table><thead><tr><th>Número / cliente</th><th>Revisão</th><th>Criação</th><th>Valor</th><th>Status</th></tr></thead><tbody>{filtered.map(item=><tr className="clickable-row" key={item.id} onClick={()=>openEditor(item)}><td><strong>{item.display_number}</strong><small>{item.client?.name??'Cliente não informado'}</small></td><td>v{item.current_revision}</td><td>{new Date(item.created_at).toLocaleDateString('pt-BR')}</td><td><strong>{money.format(Number(item.total))}</strong></td><td><span className={`badge ${item.status==='approved'?'green':''}`}>{labels[item.status]}</span></td></tr>)}</tbody></table>{!loading&&!filtered.length&&<div className="empty-state"><FileText/><strong>Nenhum orçamento encontrado</strong><span>Crie o primeiro rascunho para começar.</span></div>}</div></section>
  </Page>
}

function BudgetEditor({access,budget,setBudget,form,setForm,clients,saveState,close}:{access:NonNullable<ReturnType<typeof useAccess>>;budget:Budget;setBudget:(budget:Budget)=>void;form:Editable;setForm:(value:Editable)=>void;clients:Client[];saveState:string;close:()=>void}) {
  const {show}=useToast()
  const [families,setFamilies]=useState<Family[]>([]),[items,setItems]=useState<BudgetItem[]>([]),[itemOpen,setItemOpen]=useState(false),[itemForm,setItemForm]=useState<ItemForm>(blankItem),[itemSaving,setItemSaving]=useState(false),[itemsLoading,setItemsLoading]=useState(true)
  const [pdfReading,setPdfReading]=useState(false),[pdfResult,setPdfResult]=useState<ParsedManufacturerDocument|null>(null),[pdfName,setPdfName]=useState(''),[pdfCandidate,setPdfCandidate]=useState(0)
  const [pdfRows,setPdfRows]=useState<PdfRow[]>([])
  const [confirmDelete,setConfirmDelete]=useState(false)
  const [previewOpen,setPreviewOpen]=useState(false)
  const [workflowBusy,setWorkflowBusy]=useState(false),[confirmApproval,setConfirmApproval]=useState(false)
  const [pendingStatus,setPendingStatus]=useState<BudgetStatus|null>(null),[statusReason,setStatusReason]=useState('')
  const client=clients.find(item=>item.id===form.client_id)
  const stateLabel=saveState==='saving'?'Salvando…':saveState==='waiting'?'Alterações pendentes':saveState==='error'?'Falha ao salvar':'Rascunho sincronizado'
  const loadItems=useCallback(async()=>{
    if(!supabase)return
    setItemsLoading(true)
    const [familyResult,itemResult]=await Promise.all([
      supabase.from('item_families').select('id,name,code,form_key').eq('organization_id',access.organizationId).eq('active',true).order('name'),
      supabase.from('budget_items').select('id,family_id,position,presentation,environment,description,quantity,configuration,cost_total,margin_percent,sale_total,affects_total,family:item_families!budget_items_family_id_fkey(name)').eq('organization_id',access.organizationId).eq('budget_id',budget.id).order('position')
    ])
    if(familyResult.error||itemResult.error)show(`Não foi possível carregar os itens: ${familyResult.error?.message??itemResult.error?.message}`,'error')
    else {setFamilies((familyResult.data??[]) as Family[]);setItems((itemResult.data??[]) as unknown as BudgetItem[])}
    setItemsLoading(false)
  },[access.organizationId,budget.id,show])
  useEffect(()=>{void loadItems()},[loadItems])
  const costOf=(value:ItemForm)=>itemCostTotal(value)
  const recalculate=(value:ItemForm)=>({...value,sale_total:salePriceFromMargin(value)})
  const openItem=(item?:BudgetItem)=>{
    setPdfResult(null);setPdfName('');setPdfCandidate(0);setPdfRows([]);setConfirmDelete(false)
    if(!item){setItemForm(blankItem);setItemOpen(true);return}
    const c=item.configuration??{}
    setItemForm({id:item.id,family_id:item.family_id??'',environment:item.environment??'',description:item.description,quantity:Number(item.quantity),presentation:item.presentation==='option'?'option':'principal',manufacturer_cost:Number(c.manufacturer_cost??item.cost_total),installation_cost:Number(c.installation_cost??0),additional_cost:Number(c.additional_cost??0),margin_percent:Number(item.margin_percent??0),sale_total:Number(item.sale_total)})
    setItemOpen(true)
  }
  const applyPdfCandidate=(document:ParsedManufacturerDocument,index:number)=>{
    const candidate=document.items[index];if(!candidate)return
    const family=families.find(x=>x.form_key===(/CORTINA|TRILHO/i.test(candidate.description)?'curtain':'blind'))
    const operation=candidate.operation==='motorized'?'motorizado':candidate.operation==='manual'?'manual':''
    const measures=candidate.width&&candidate.height?`, medindo ${candidate.width.toLocaleString('pt-BR')} × ${candidate.height.toLocaleString('pt-BR')} m`:''
    setPdfCandidate(index);setItemForm(current=>({...current,family_id:family?.id??current.family_id,description:`${candidate.description}${measures}${operation?`, acionamento ${operation}`:''}.`,quantity:candidate.quantity,manufacturer_cost:candidate.value,sale_total:0}))
  }
  const pdfFamily=(description:string)=>families.find(x=>x.form_key===(/CORTINA|TRILHO/i.test(description)?'curtain':'blind'))
  const pdfDescription=(candidate:ParsedManufacturerDocument['items'][number])=>{
    const operation=candidate.operation==='motorized'?'motorizado':candidate.operation==='manual'?'manual':''
    const measures=candidate.width&&candidate.height?`, medindo ${candidate.width.toLocaleString('pt-BR')} × ${candidate.height.toLocaleString('pt-BR')} m`:''
    return `${candidate.description}${measures}${operation?`, acionamento ${operation}`:''}.`
  }
  const readPdf=async(file?:File)=>{
    if(!file)return
    if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf')){show('Selecione um arquivo PDF.','error');return}
    setPdfReading(true)
    try{
      const parsed=parseManufacturerText(await extractPdfText(file))
      if(!parsed.items.length)throw new Error('Nenhum item reconhecido')
      setPdfResult(parsed);setPdfName(file.name);setPdfRows(parsed.items.map(item=>({selected:true,environment:'',presentation:'principal',margin_percent:50,sale_total:Number((item.value*1.5).toFixed(2))})));applyPdfCandidate(parsed,0)
      show(`${parsed.items.length} item(ns) identificado(s). Confira antes de salvar.`,'success')
    }catch{setPdfResult(null);show('Não foi possível reconhecer os itens desse PDF. O arquivo não foi incluído.','error')}
    finally{setPdfReading(false)}
  }
  const importSelected=async()=>{
    if(!supabase||!pdfResult||itemSaving)return
    const selected=pdfResult.items.map((item,index)=>({item,row:pdfRows[index]})).filter(({row})=>row?.selected)
    if(!selected.length){show('Selecione ao menos um item para importar.','error');return}
    const missing=selected.find(({item})=>!pdfFamily(item.description))
    if(missing){show('Não foi possível definir o tipo de um dos itens. Importe-o individualmente.','error');return}
    setItemSaving(true)
    const payloads=selected.map(({item,row},index)=>({organization_id:access.organizationId,budget_id:budget.id,family_id:pdfFamily(item.description)!.id,position:items.length+index+1,presentation:row.presentation,environment:row.environment.trim()||null,description:pdfDescription(item),quantity:item.quantity,configuration:{manufacturer_cost:item.value,installation_cost:0,additional_cost:0,source_file:pdfName,source_confidence:item.confidence},cost_total:item.value,margin_percent:row.margin_percent,sale_total:row.sale_total,affects_total:row.presentation==='principal'}))
    const {error}=await supabase.from('budget_items').insert(payloads)
    if(error)show('Não foi possível importar os itens selecionados. Nenhum item foi incluído.','error')
    else {setItemOpen(false);await loadItems();const {data}=await supabase.from('budgets').select(columns).eq('id',budget.id).single();if(data)setBudget(data as unknown as Budget);show(`${payloads.length} item(ns) importado(s) com sucesso.`,'success')}
    setItemSaving(false)
  }
  const saveItem=async(e:FormEvent)=>{
    e.preventDefault();if(!supabase||itemSaving)return
    if(!itemForm.family_id||!itemForm.description.trim()){show('Informe o tipo e a descrição do item.','error');return}
    setItemSaving(true)
    const cost=costOf(itemForm), payload={organization_id:access.organizationId,budget_id:budget.id,family_id:itemForm.family_id,position:itemForm.id?(items.find(x=>x.id===itemForm.id)?.position??1):items.length+1,presentation:itemForm.presentation,environment:itemForm.environment.trim()||null,description:itemForm.description.trim(),quantity:itemForm.quantity,configuration:{manufacturer_cost:itemForm.manufacturer_cost,installation_cost:itemForm.installation_cost,additional_cost:itemForm.additional_cost},cost_total:cost,margin_percent:itemForm.margin_percent,sale_total:itemForm.sale_total,affects_total:itemForm.presentation==='principal'}
    const result=itemForm.id?await supabase.from('budget_items').update(payload).eq('id',itemForm.id).eq('organization_id',access.organizationId):await supabase.from('budget_items').insert(payload)
    if(result.error)show('Não foi possível salvar o item.','error')
    else {setItemOpen(false);await loadItems();const {data}=await supabase.from('budgets').select(columns).eq('id',budget.id).single();if(data)setBudget(data as unknown as Budget);show(itemForm.id?'Item atualizado.':'Item adicionado ao orçamento.','success')}
    setItemSaving(false)
  }
  const deleteItem=async()=>{
    if(!supabase||!itemForm.id||itemSaving)return
    setItemSaving(true)
    const {error}=await supabase.from('budget_items').delete().eq('id',itemForm.id).eq('organization_id',access.organizationId)
    if(error)show('Não foi possível excluir o item.','error')
    else {setItemOpen(false);await loadItems();const {data}=await supabase.from('budgets').select(columns).eq('id',budget.id).single();if(data)setBudget(data as unknown as Budget);show('Item excluído e total atualizado.','success')}
    setItemSaving(false)
  }
  const markSent=async()=>{
    if(!supabase||workflowBusy)return
    if(saveState==='waiting'||saveState==='saving'){show('Aguarde o salvamento do rascunho antes de enviar.','info');return}
    setWorkflowBusy(true)
    const {data,error}=await supabase.rpc('mark_budget_sent',{org_id:access.organizationId,target_budget_id:budget.id})
    if(error)show(error.code==='23514'?'Informe o cliente e inclua ao menos um item principal antes de enviar.':'Não foi possível marcar o orçamento como enviado.','error')
    else {setBudget(data as unknown as Budget);show('Orçamento marcado como enviado e versão preservada.','success')}
    setWorkflowBusy(false)
  }
  const approve=async()=>{
    if(!supabase||workflowBusy)return
    setWorkflowBusy(true)
    const {data,error}=await supabase.rpc('approve_budget_and_create_order',{org_id:access.organizationId,target_budget_id:budget.id})
    if(error)show('Não foi possível aprovar e gerar o pedido.','error')
    else {setBudget({...budget,status:'approved'});setConfirmApproval(false);show(`Orçamento aprovado. Pedido ${(data as {display_number?:string})?.display_number??''} criado com sucesso.`,'success')}
    setWorkflowBusy(false)
  }
  const requestStatus=(next:BudgetStatus)=>{
    if(next===budget.status)return
    if(next==='approved'){setConfirmApproval(true);return}
    if(next==='sent'){void markSent();return}
    setStatusReason('');setPendingStatus(next)
  }
  const changeStatus=async()=>{
    if(!supabase||!pendingStatus||workflowBusy)return
    if(statusNeedsReason(pendingStatus)&&statusReason.trim().length<5){show('Informe o motivo da alteração.','error');return}
    setWorkflowBusy(true)
    const {data,error}=await supabase.rpc('change_budget_status',{org_id:access.organizationId,target_budget_id:budget.id,new_status:pendingStatus,change_reason:statusReason.trim()||null})
    if(error)show('Não foi possível alterar o status do orçamento.','error')
    else {setBudget(data as unknown as Budget);setPendingStatus(null);show(`Status alterado para ${labels[pendingStatus]}.`,'success')}
    setWorkflowBusy(false)
  }
  return <Page title="Construção do orçamento" description="Monte os dados comerciais e os itens que o cliente receberá." action={<div className="page-actions"><button className="button secondary" onClick={()=>setPreviewOpen(true)}>Prévia do cliente</button><button className="button secondary" onClick={close}><ArrowLeft/>Voltar aos orçamentos</button></div>}>
    {previewOpen&&<BudgetPreview budget={{...budget,valid_until:form.valid_until,payment_terms:form.payment_terms,delivery_terms:form.delivery_terms,notes:form.notes,discount:Number(form.discount||0),total:Math.max(0,Number(budget.subtotal)-Number(form.discount||0))}} items={items} clientName={client?.name??'Cliente não informado'} onClose={()=>setPreviewOpen(false)}/>}
    {confirmApproval&&<div className="workflow-confirm"><div><strong>Aprovar este orçamento e gerar o pedido?</strong><span>A versão enviada será preservada e somente os itens principais entrarão no pedido.</span></div><button className="button secondary" onClick={()=>setConfirmApproval(false)}>Voltar</button><button className="button primary" disabled={workflowBusy} onClick={()=>void approve()}>{workflowBusy?'Gerando pedido…':'Confirmar aprovação'}</button></div>}
    {pendingStatus&&<div className="workflow-confirm"><div><strong>Alterar status para {labels[pendingStatus]}?</strong><span>{pendingStatus==='draft'?'Uma nova revisão editável será iniciada.':'Esta alteração ficará registrada no histórico.'}</span>{statusNeedsReason(pendingStatus)&&<input autoFocus value={statusReason} onChange={e=>setStatusReason(e.target.value)} placeholder="Informe o motivo"/>}</div><button className="button secondary" onClick={()=>setPendingStatus(null)}>Voltar</button><button className="button primary" disabled={workflowBusy||statusNeedsReason(pendingStatus)&&statusReason.trim().length<5} onClick={()=>void changeStatus()}>{workflowBusy?'Alterando…':'Confirmar alteração'}</button></div>}
    <div className="budget-layout"><section className="panel budget-form"><header><div><h2>Dados comerciais</h2><p>{budget.display_number} · revisão {budget.current_revision}</p></div><span className={`save-state ${saveState}`}>{stateLabel}</span></header><div className="form-grid">
      <label className="field">Status<select value={budget.status} disabled={workflowBusy} onChange={e=>requestStatus(e.target.value as BudgetStatus)}>{budgetStatusOptions(budget.status).map(status=><option value={status} key={status}>{labels[status]}</option>)}</select></label><label className="field">Cliente final<select disabled={budget.status!=='draft'} value={form.client_id??''} onChange={e=>setForm({...form,client_id:e.target.value||null})}><option value="">Selecione um cliente</option>{clients.filter(x=>x.client_type==='Cliente final').map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field">Validade<input type="date" value={form.valid_until??''} onChange={e=>setForm({...form,valid_until:e.target.value})}/></label><label className="field">Previsão<input value={form.delivery_terms??''} onChange={e=>setForm({...form,delivery_terms:e.target.value})} placeholder="Ex.: 25 dias úteis"/></label>
      <label className="field span-2">Condição de pagamento<input value={form.payment_terms??''} onChange={e=>setForm({...form,payment_terms:e.target.value})}/></label><label className="field span-2">Observações para o cliente<textarea value={form.notes??''} onChange={e=>setForm({...form,notes:e.target.value})}/></label><label className="field span-2">Observações internas<textarea value={form.internal_notes??''} onChange={e=>setForm({...form,internal_notes:e.target.value})}/></label>
    </div></section><aside className="panel budget-summary"><header><h2>Resumo</h2></header><dl><div><dt>Cliente</dt><dd>{client?.name??'Não informado'}</dd></div><div><dt>Subtotal</dt><dd>{money.format(Number(budget.subtotal))}</dd></div><div><dt>Desconto</dt><dd><input type="number" min="0" step="0.01" value={form.discount} onChange={e=>setForm({...form,discount:Number(e.target.value)})}/></dd></div><div className="total"><dt>Total</dt><dd>{money.format(Math.max(0,Number(budget.subtotal)-Number(form.discount||0)))}</dd></div></dl></aside></div>
    <section className="panel budget-items"><header><div><h2>Itens do orçamento</h2><p>Cada item mantém seu ambiente, custo, margem e forma de apresentação.</p></div><button className="button primary" onClick={()=>openItem()}><Plus/>Adicionar item</button></header>{itemsLoading?<p className="panel-message">Carregando itens…</p>:items.length?<div className="table-wrap"><table><thead><tr><th>Tipo / ambiente</th><th>Descrição</th><th>Qtd.</th><th>Custo</th><th>Venda</th><th>Apresentação</th></tr></thead><tbody>{items.map(item=><tr className="clickable-row" key={item.id} onClick={()=>openItem(item)}><td><strong>{item.family?.name??'Item'}</strong><small>{item.environment||'Ambiente a definir'}</small></td><td>{item.description}</td><td>{Number(item.quantity).toLocaleString('pt-BR')}</td><td>{money.format(Number(item.cost_total))}</td><td><strong>{money.format(Number(item.sale_total))}</strong></td><td><span className="badge">{item.affects_total?'Item principal':'Opção'}</span></td></tr>)}</tbody></table></div>:<div className="empty-state compact"><FileText/><strong>Nenhum item adicionado</strong><span>Os dados gerais já são salvos automaticamente como rascunho.</span></div>}</section>
    {itemOpen&&<div className="dialog-backdrop"><form className="dialog item-dialog" onSubmit={saveItem}><header><div><span className="eyebrow">Item do orçamento</span><h2>{itemForm.id?'Editar item':'Adicionar item'}</h2><p>Cortina e Persiana podem ser preenchidas pela leitura do PDF e sempre passam por conferência.</p></div><button type="button" className="icon-button" onClick={()=>setItemOpen(false)}><X/></button></header><div className="pdf-import"><label className={`pdf-drop ${pdfReading?'reading':''}`}><input type="file" accept="application/pdf,.pdf" onChange={e=>void readPdf(e.target.files?.[0])}/><strong>{pdfReading?'Lendo o documento…':'Anexar cotação ou pedido em PDF'}</strong><span>A leitura procura significado e valores, sem depender de coordenadas fixas.</span></label>{pdfResult&&<div className="pdf-result"><strong>{pdfName} · {pdfResult.items.length} item(ns)</strong><div className="pdf-bulk-list">{pdfResult.items.map((item,index)=><div className="pdf-bulk-row" key={`${item.description}-${index}`}><input aria-label={`Importar item ${index+1}`} type="checkbox" checked={pdfRows[index]?.selected??false} onChange={e=>setPdfRows(current=>current.map((row,i)=>i===index?{...row,selected:e.target.checked}:row))}/><button type="button" onClick={()=>applyPdfCandidate(pdfResult,index)}><strong>{index+1}. {item.description}</strong><span>{money.format(item.value)} · confiança {Math.round(item.confidence*100)}%</span></button><input aria-label={`Ambiente do item ${index+1}`} placeholder="Ambiente" value={pdfRows[index]?.environment??''} onChange={e=>setPdfRows(current=>current.map((row,i)=>i===index?{...row,environment:e.target.value}:row))}/><select aria-label={`Apresentação do item ${index+1}`} value={pdfRows[index]?.presentation??'principal'} onChange={e=>setPdfRows(current=>current.map((row,i)=>i===index?{...row,presentation:e.target.value as PdfRow['presentation']}:row))}><option value="principal">Principal</option><option value="option">Opção</option></select></div>)}</div><small>Marque os itens, informe os ambientes e confira valores antes da importação conjunta.</small><button type="button" className="button primary" disabled={itemSaving} onClick={()=>void importSelected()}>{itemSaving?'Importando…':`Importar ${pdfRows.filter(row=>row.selected).length} selecionado(s)`}</button></div>}</div><div className="form-grid"><label className="field">Tipo<select required value={itemForm.family_id} onChange={e=>setItemForm({...itemForm,family_id:e.target.value})}><option value="">Selecione</option>{families.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label className="field">Ambiente<input value={itemForm.environment} onChange={e=>setItemForm({...itemForm,environment:e.target.value})} placeholder="Ex.: Sala"/></label><label className="field span-2">Descrição para o cliente<textarea required value={itemForm.description} onChange={e=>setItemForm({...itemForm,description:e.target.value})} placeholder="Descreva modelo, tecido, medidas e acionamento"/></label><label className="field">Quantidade<input type="number" min="0.001" step="0.001" value={itemForm.quantity} onChange={e=>setItemForm({...itemForm,quantity:Number(e.target.value)})}/></label><label className="field">Apresentação<select value={itemForm.presentation} onChange={e=>setItemForm({...itemForm,presentation:e.target.value as ItemForm['presentation']})}><option value="principal">Item principal</option><option value="option">Opção (não soma)</option></select></label><label className="field">Custo do fabricante<input type="number" min="0" step="0.01" value={itemForm.manufacturer_cost} onChange={e=>setItemForm({...itemForm,manufacturer_cost:Number(e.target.value)})}/></label><label className="field">Instalação<input type="number" min="0" step="0.01" value={itemForm.installation_cost} onChange={e=>setItemForm({...itemForm,installation_cost:Number(e.target.value)})}/></label><label className="field">Custos adicionais<input type="number" min="0" step="0.01" value={itemForm.additional_cost} onChange={e=>setItemForm({...itemForm,additional_cost:Number(e.target.value)})}/></label><label className="field">Custo total<input readOnly value={money.format(costOf(itemForm))}/></label><label className="field">Margem (%)<input type="number" min="0" step="0.1" value={itemForm.margin_percent} onChange={e=>setItemForm({...itemForm,margin_percent:Number(e.target.value)})}/></label><label className="field">Preço de venda<input type="number" min="0" step="0.01" value={itemForm.sale_total} onChange={e=>setItemForm({...itemForm,sale_total:Number(e.target.value)})}/></label><div className="span-2 item-recalculate"><button type="button" className="button secondary" onClick={()=>setItemForm(recalculate(itemForm))}>Recalcular pela margem</button><small>Para inclusão individual. Considera fabricante, instalação e custos adicionais.</small></div></div>{confirmDelete&&<div className="inline-confirm"><div><strong>Excluir este item?</strong><span>O total do orçamento será recalculado automaticamente.</span></div><button type="button" className="button secondary" onClick={()=>setConfirmDelete(false)}>Manter item</button><button type="button" className="button danger" disabled={itemSaving} onClick={()=>void deleteItem()}>Confirmar exclusão</button></div>}<footer>{itemForm.id&&!confirmDelete&&<button type="button" className="button danger footer-left" disabled={itemSaving} onClick={()=>setConfirmDelete(true)}>Excluir item</button>}<button type="button" className="button secondary" onClick={()=>setItemOpen(false)}>Cancelar</button><button className="button primary" disabled={itemSaving||pdfReading}>{itemSaving?'Salvando…':'Salvar apenas este item'}</button></footer></form></div>}
  </Page>
}
