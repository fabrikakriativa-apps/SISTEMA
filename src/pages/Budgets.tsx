import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, FileText, Plus, Search, X } from 'lucide-react'
import { Page } from '../components/Page'
import { useAccess } from '../components/AuthorizedAccess'
import { useToast } from '../components/ToastProvider'
import { money } from '../lib/format'
import { supabase } from '../lib/supabase'
import { composedItemCost } from '../lib/budgetItems'
import { extractPdfText } from '../lib/pdfText'
import { parseManufacturerText, type ParsedManufacturerDocument } from '../lib/manufacturerPdf'
import { BudgetPreview } from '../components/BudgetPreview'
import { budgetStatusLabels as labels, budgetStatusOptions, statusNeedsReason, type BudgetStatus } from '../lib/budgetStatus'
import { navigateTo, readRoute } from '../lib/navigation'
import { ItemCostComposition, type SupplyLine, type SupplyOption } from '../components/ItemCostComposition'
import { budgetDocumentPath } from '../lib/documents'
import {blankWallpaper,wallpaperDescription,type WallpaperDetails} from '../lib/wallpaper'

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
type ItemForm={id?:string;family_id:string;environment:string;description:string;quantity:number;presentation:'principal'|'option';manufacturer_cost:number;installation_cost:number;additional_cost:number;margin_percent:number;sale_total:number;wallpaper:WallpaperDetails}
type PdfRow={selected:boolean;environment:string;presentation:'principal'|'option';margin_percent:number;sale_total:number}
type Attachment={id:string;original_name:string;storage_path:string;created_at:string}

const blankEditable:Editable = { client_id:null, valid_until:null, payment_terms:'', delivery_terms:'', notes:'', internal_notes:'', discount:0 }
const newBlankItem=():ItemForm=>({family_id:'',environment:'',description:'',quantity:1,presentation:'principal',manufacturer_cost:0,installation_cost:0,additional_cost:0,margin_percent:50,sale_total:0,wallpaper:{...blankWallpaper}})
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
  const [families,setFamilies]=useState<Family[]>([]),[items,setItems]=useState<BudgetItem[]>([]),[itemOpen,setItemOpen]=useState(false),[itemForm,setItemForm]=useState<ItemForm>(newBlankItem),[itemSaving,setItemSaving]=useState(false),[itemsLoading,setItemsLoading]=useState(true)
  const [supplies,setSupplies]=useState<SupplyOption[]>([]),[supplyLines,setSupplyLines]=useState<SupplyLine[]>([])
  const [pdfReading,setPdfReading]=useState(false),[pdfResult,setPdfResult]=useState<ParsedManufacturerDocument|null>(null),[pdfName,setPdfName]=useState(''),[pdfCandidate,setPdfCandidate]=useState(0)
  const [pdfFile,setPdfFile]=useState<File|null>(null),[attachments,setAttachments]=useState<Attachment[]>([])
  const [pdfRows,setPdfRows]=useState<PdfRow[]>([])
  const [confirmDelete,setConfirmDelete]=useState(false)
  const [previewOpen,setPreviewOpen]=useState(false)
  const [workflowBusy,setWorkflowBusy]=useState(false),[confirmApproval,setConfirmApproval]=useState(false)
  const [pendingStatus,setPendingStatus]=useState<BudgetStatus|null>(null),[statusReason,setStatusReason]=useState('')
  const client=clients.find(item=>item.id===form.client_id)
  const wallpaperSelected=families.find(family=>family.id===itemForm.family_id)?.form_key==='wallpaper'
  const stateLabel=saveState==='saving'?'Salvando…':saveState==='waiting'?'Alterações pendentes':saveState==='error'?'Falha ao salvar':'Rascunho sincronizado'
  const loadItems=useCallback(async()=>{
    if(!supabase)return
    setItemsLoading(true)
    const [familyResult,itemResult,supplyResult,attachmentResult]=await Promise.all([
      supabase.from('item_families').select('id,name,code,form_key').eq('organization_id',access.organizationId).eq('active',true).order('name'),
      supabase.from('budget_items').select('id,family_id,position,presentation,environment,description,quantity,configuration,cost_total,margin_percent,sale_total,affects_total,family:item_families!budget_items_family_id_fkey(name)').eq('organization_id',access.organizationId).eq('budget_id',budget.id).order('position'),
      supabase.from('supplies').select('id,code,name,usage_unit,current_cost').eq('organization_id',access.organizationId).eq('active',true).order('name'),
      supabase.from('attachments').select('id,original_name,storage_path,created_at').eq('organization_id',access.organizationId).eq('entity_type','budget').eq('entity_id',budget.id).order('created_at',{ascending:false})
    ])
    if(familyResult.error||itemResult.error||supplyResult.error)show(`Não foi possível carregar os itens: ${familyResult.error?.message??itemResult.error?.message??supplyResult.error?.message}`,'error')
    else {setFamilies((familyResult.data??[]) as Family[]);setItems((itemResult.data??[]) as unknown as BudgetItem[]);setSupplies((supplyResult.data??[]) as SupplyOption[]);setAttachments((attachmentResult.data??[]) as Attachment[])}
    setItemsLoading(false)
  },[access.organizationId,budget.id,show])
  useEffect(()=>{void loadItems()},[loadItems])
  const costOf=(value:ItemForm)=>composedItemCost(value,supplyLines)
  const recalculate=(value:ItemForm)=>({...value,sale_total:Number((costOf(value)*(1+Math.max(0,value.margin_percent)/100)).toFixed(2))})
  const openItem=async(item?:BudgetItem)=>{
    setPdfResult(null);setPdfName('');setPdfCandidate(0);setPdfRows([]);setConfirmDelete(false)
    setSupplyLines([])
    if(!item){setItemForm(newBlankItem());setItemOpen(true);return}
    const c=item.configuration??{}
    setItemForm({id:item.id,family_id:item.family_id??'',environment:item.environment??'',description:item.description,quantity:Number(item.quantity),presentation:item.presentation==='option'?'option':'principal',manufacturer_cost:Number(c.manufacturer_cost??item.cost_total),installation_cost:Number(c.installation_cost??0),additional_cost:Number(c.additional_cost??0),margin_percent:Number(item.margin_percent??0),sale_total:Number(item.sale_total),wallpaper:{...blankWallpaper,...((c.wallpaper??{}) as Partial<WallpaperDetails>)}})
    setItemOpen(true)
    if(supabase){const {data}=await supabase.from('item_cost_lines').select('supply_id,description,quantity,unit,unit_cost').eq('organization_id',access.organizationId).eq('budget_item_id',item.id).eq('kind','supply');setSupplyLines((data??[]).map(line=>({...line,supply_id:line.supply_id??'',quantity:Number(line.quantity),unit_cost:Number(line.unit_cost)})) as SupplyLine[])}
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
    setPdfReading(true);setPdfFile(file)
    try{
      const parsed=parseManufacturerText(await extractPdfText(file))
      if(!parsed.items.length)throw new Error('Nenhum item reconhecido')
      setPdfResult(parsed);setPdfName(file.name);setPdfRows(parsed.items.map(item=>({selected:true,environment:'',presentation:'principal',margin_percent:50,sale_total:Number((item.value*1.5).toFixed(2))})));applyPdfCandidate(parsed,0)
      show(`${parsed.items.length} item(ns) identificado(s). Confira antes de salvar.`,'success')
    }catch{setPdfResult(null);setPdfFile(null);show('Não foi possível reconhecer os itens desse PDF. O arquivo não foi incluído.','error')}
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
    const {data:created,error}=await supabase.from('budget_items').insert(payloads).select('id,cost_total')
    if(error)show('Não foi possível importar os itens selecionados. Nenhum item foi incluído.','error')
    else {
      const compositions=await Promise.all((created??[]).map((saved,index)=>supabase!.rpc('replace_budget_item_cost_lines',{org_id:access.organizationId,target_budget_item_id:saved.id,new_lines:[{kind:'product',supply_id:null,description:'Custo do fabricante',quantity:1,unit:'un',unit_cost:selected[index].item.value}]})))
      if(compositions.some(result=>result.error))show('Os itens foram importados, mas uma composição de custos precisa ser conferida.','error')
      else {
        if(pdfFile){
          const path=budgetDocumentPath(access.organizationId,budget.id,pdfFile.name)
          const uploaded=await supabase.storage.from('documents').upload(path,pdfFile,{contentType:'application/pdf',upsert:false})
          if(uploaded.error)show('Itens importados, mas o PDF não pôde ser arquivado.','error')
          else {const registered=await supabase.rpc('register_budget_attachment',{org_id:access.organizationId,target_budget_id:budget.id,object_path:path,file_name:pdfFile.name,content_type:'application/pdf',byte_size:pdfFile.size,extracted_data:pdfResult});if(registered.error){await supabase.storage.from('documents').remove([path]);show('Itens importados, mas o vínculo do PDF não pôde ser registrado.','error')}}
        }
        setItemOpen(false);await loadItems();const {data}=await supabase.from('budgets').select(columns).eq('id',budget.id).single();if(data)setBudget(data as unknown as Budget);show(`${payloads.length} item(ns) importado(s) com sucesso.`,'success')
      }
    }
    setItemSaving(false)
  }
  const saveItem=async(e:FormEvent)=>{
    e.preventDefault();if(!supabase||itemSaving)return
    if(!itemForm.family_id||!itemForm.description.trim()){show('Informe o tipo e a descrição do item.','error');return}
    setItemSaving(true)
    const isWallpaper=families.find(family=>family.id===itemForm.family_id)?.form_key==='wallpaper'
    const cost=costOf(itemForm), payload={organization_id:access.organizationId,budget_id:budget.id,family_id:itemForm.family_id,position:itemForm.id?(items.find(x=>x.id===itemForm.id)?.position??1):items.length+1,presentation:itemForm.presentation,environment:itemForm.environment.trim()||null,description:itemForm.description.trim(),quantity:itemForm.quantity,configuration:{manufacturer_cost:itemForm.manufacturer_cost,installation_cost:itemForm.installation_cost,additional_cost:itemForm.additional_cost,...(isWallpaper?{wallpaper:itemForm.wallpaper}:{})},cost_total:cost,margin_percent:itemForm.margin_percent,sale_total:itemForm.sale_total,affects_total:itemForm.presentation==='principal'}
    const result=itemForm.id?await supabase.from('budget_items').update(payload).eq('id',itemForm.id).eq('organization_id',access.organizationId).select('id').single():await supabase.from('budget_items').insert(payload).select('id').single()
    if(result.error)show('Não foi possível salvar o item.','error')
    else {
      const lines=[
        ...(itemForm.manufacturer_cost>0?[{kind:'product',supply_id:null,description:'Custo do fabricante',quantity:1,unit:'un',unit_cost:itemForm.manufacturer_cost}]:[]),
        ...(itemForm.installation_cost>0?[{kind:'installation',supply_id:null,description:'Instalação',quantity:1,unit:'serviço',unit_cost:itemForm.installation_cost}]:[]),
        ...(itemForm.additional_cost>0?[{kind:'other',supply_id:null,description:'Custos adicionais',quantity:1,unit:'un',unit_cost:itemForm.additional_cost}]:[]),
        ...supplyLines.filter(line=>line.supply_id&&line.quantity>0).map(line=>({kind:'supply',...line}))
      ]
      const composition=await supabase.rpc('replace_budget_item_cost_lines',{org_id:access.organizationId,target_budget_item_id:result.data.id,new_lines:lines})
      if(composition.error)show('O item foi salvo, mas não foi possível registrar sua composição de custos.','error')
      else {setItemOpen(false);await loadItems();const {data}=await supabase.from('budgets').select(columns).eq('id',budget.id).single();if(data)setBudget(data as unknown as Budget);show(itemForm.id?'Item e composição atualizados.':'Item adicionado ao orçamento.','success')}
    }
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
  const openAttachment=async(attachment:Attachment)=>{if(!supabase)return;const {data,error}=await supabase.storage.from('documents').createSignedUrl(attachment.storage_path,300);if(error||!data?.signedUrl)show('Não foi possível abrir o documento.','error');else window.open(data.signedUrl,'_blank','noopener,noreferrer')}
  return <Page title="Construção do orçamento" description="Monte os dados comerciais e os itens que o cliente receberá." action={<div className="page-actions"><button className="button secondary" onClick={()=>setPreviewOpen(true)}>Prévia do cliente</button><button className="button secondary" onClick={close}><ArrowLeft/>Voltar aos orçamentos</button></div>}>
    {previewOpen&&<BudgetPreview budget={{...budget,valid_until:form.valid_until,payment_terms:form.payment_terms,delivery_terms:form.delivery_terms,notes:form.notes,discount:Number(form.discount||0),total:Math.max(0,Number(budget.subtotal)-Number(form.discount||0))}} items={items} clientName={client?.name??'Cliente não informado'} onClose={()=>setPreviewOpen(false)}/>}
    {confirmApproval&&<div className="workflow-confirm"><div><strong>Aprovar este orçamento e gerar o pedido?</strong><span>A versão enviada será preservada e somente os itens principais entrarão no pedido.</span></div><button className="button secondary" onClick={()=>setConfirmApproval(false)}>Voltar</button><button className="button primary" disabled={workflowBusy} onClick={()=>void approve()}>{workflowBusy?'Gerando pedido…':'Confirmar aprovação'}</button></div>}
    {pendingStatus&&<div className="workflow-confirm"><div><strong>Alterar status para {labels[pendingStatus]}?</strong><span>{pendingStatus==='draft'?'Uma nova revisão editável será iniciada.':'Esta alteração ficará registrada no histórico.'}</span>{statusNeedsReason(pendingStatus)&&<input autoFocus value={statusReason} onChange={e=>setStatusReason(e.target.value)} placeholder="Informe o motivo"/>}</div><button className="button secondary" onClick={()=>setPendingStatus(null)}>Voltar</button><button className="button primary" disabled={workflowBusy||statusNeedsReason(pendingStatus)&&statusReason.trim().length<5} onClick={()=>void changeStatus()}>{workflowBusy?'Alterando…':'Confirmar alteração'}</button></div>}
    <div className="budget-layout"><section className="panel budget-form"><header><div><h2>Dados comerciais</h2><p>{budget.display_number} · revisão {budget.current_revision}</p></div><span className={`save-state ${saveState}`}>{stateLabel}</span></header><div className="form-grid">
      <label className="field">Status<select value={budget.status} disabled={workflowBusy} onChange={e=>requestStatus(e.target.value as BudgetStatus)}>{budgetStatusOptions(budget.status).map(status=><option value={status} key={status}>{labels[status]}</option>)}</select></label><label className="field">Cliente final<select disabled={budget.status!=='draft'} value={form.client_id??''} onChange={e=>setForm({...form,client_id:e.target.value||null})}><option value="">Selecione um cliente</option>{clients.filter(x=>x.client_type==='Cliente final').map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field">Validade<input type="date" value={form.valid_until??''} onChange={e=>setForm({...form,valid_until:e.target.value})}/></label><label className="field">Previsão<input value={form.delivery_terms??''} onChange={e=>setForm({...form,delivery_terms:e.target.value})} placeholder="Ex.: 25 dias úteis"/></label>
      <label className="field span-2">Condição de pagamento<input value={form.payment_terms??''} onChange={e=>setForm({...form,payment_terms:e.target.value})}/></label><label className="field span-2">Observações para o cliente<textarea value={form.notes??''} onChange={e=>setForm({...form,notes:e.target.value})}/></label><label className="field span-2">Observações internas<textarea value={form.internal_notes??''} onChange={e=>setForm({...form,internal_notes:e.target.value})}/></label>
    </div>{attachments.length>0&&<div className="document-links"><strong>Documentos anexados</strong>{attachments.map(attachment=><button type="button" key={attachment.id} onClick={()=>void openAttachment(attachment)}>{attachment.original_name}</button>)}</div>}</section><aside className="panel budget-summary"><header><h2>Resumo</h2></header><dl><div><dt>Cliente</dt><dd>{client?.name??'Não informado'}</dd></div><div><dt>Subtotal</dt><dd>{money.format(Number(budget.subtotal))}</dd></div><div><dt>Desconto</dt><dd><input type="number" min="0" step="0.01" value={form.discount} onChange={e=>setForm({...form,discount:Number(e.target.value)})}/></dd></div><div className="total"><dt>Total</dt><dd>{money.format(Math.max(0,Number(budget.subtotal)-Number(form.discount||0)))}</dd></div></dl></aside></div>
    <section className="panel budget-items"><header><div><h2>Itens do orçamento</h2><p>Cada item mantém seu ambiente, custo, margem e forma de apresentação.</p></div><button className="button primary" onClick={()=>openItem()}><Plus/>Adicionar item</button></header>{itemsLoading?<p className="panel-message">Carregando itens…</p>:items.length?<div className="table-wrap"><table><thead><tr><th>Tipo / ambiente</th><th>Descrição</th><th>Qtd.</th><th>Custo</th><th>Venda</th><th>Apresentação</th></tr></thead><tbody>{items.map(item=><tr className="clickable-row" key={item.id} onClick={()=>openItem(item)}><td><strong>{item.family?.name??'Item'}</strong><small>{item.environment||'Ambiente a definir'}</small></td><td>{item.description}</td><td>{Number(item.quantity).toLocaleString('pt-BR')}</td><td>{money.format(Number(item.cost_total))}</td><td><strong>{money.format(Number(item.sale_total))}</strong></td><td><span className="badge">{item.affects_total?'Item principal':'Opção'}</span></td></tr>)}</tbody></table></div>:<div className="empty-state compact"><FileText/><strong>Nenhum item adicionado</strong><span>Os dados gerais já são salvos automaticamente como rascunho.</span></div>}</section>
    {itemOpen&&<div className="dialog-backdrop"><form className="dialog item-dialog" onSubmit={saveItem}><header><div><span className="eyebrow">Item do orçamento</span><h2>{itemForm.id?'Editar item':'Adicionar item'}</h2><p>Cortina e Persiana podem ser preenchidas pela leitura do PDF e sempre passam por conferência.</p></div><button type="button" className="icon-button" onClick={()=>setItemOpen(false)}><X/></button></header><div className="pdf-import"><label className={`pdf-drop ${pdfReading?'reading':''}`}><input type="file" accept="application/pdf,.pdf" onChange={e=>void readPdf(e.target.files?.[0])}/><strong>{pdfReading?'Lendo o documento…':'Anexar cotação ou pedido em PDF'}</strong><span>A leitura procura significado e valores, sem depender de coordenadas fixas.</span></label>{pdfResult&&<div className="pdf-result"><strong>{pdfName} · {pdfResult.items.length} item(ns)</strong><div className="pdf-bulk-list">{pdfResult.items.map((item,index)=><div className="pdf-bulk-row" key={`${item.description}-${index}`}><input aria-label={`Importar item ${index+1}`} type="checkbox" checked={pdfRows[index]?.selected??false} onChange={e=>setPdfRows(current=>current.map((row,i)=>i===index?{...row,selected:e.target.checked}:row))}/><button type="button" onClick={()=>applyPdfCandidate(pdfResult,index)}><strong>{index+1}. {item.description}</strong><span>{money.format(item.value)} · confiança {Math.round(item.confidence*100)}%</span></button><input aria-label={`Ambiente do item ${index+1}`} placeholder="Ambiente" value={pdfRows[index]?.environment??''} onChange={e=>setPdfRows(current=>current.map((row,i)=>i===index?{...row,environment:e.target.value}:row))}/><select aria-label={`Apresentação do item ${index+1}`} value={pdfRows[index]?.presentation??'principal'} onChange={e=>setPdfRows(current=>current.map((row,i)=>i===index?{...row,presentation:e.target.value as PdfRow['presentation']}:row))}><option value="principal">Principal</option><option value="option">Opção</option></select></div>)}</div><small>Marque os itens, informe os ambientes e confira valores antes da importação conjunta.</small><button type="button" className="button primary" disabled={itemSaving} onClick={()=>void importSelected()}>{itemSaving?'Importando…':`Importar ${pdfRows.filter(row=>row.selected).length} selecionado(s)`}</button></div>}</div><div className="form-grid"><label className="field">Tipo<select required value={itemForm.family_id} onChange={e=>setItemForm({...itemForm,family_id:e.target.value})}><option value="">Selecione</option>{families.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label className="field">Ambiente<input value={itemForm.environment} onChange={e=>setItemForm({...itemForm,environment:e.target.value})} placeholder="Ex.: Sala"/></label>{wallpaperSelected&&<><div className="span-2 item-specific-heading"><strong>Dados do papel de parede</strong><small>Preencha somente dados confirmados. O sistema não calcula consumo automaticamente.</small></div><label className="field">Fabricante<input value={itemForm.wallpaper.brand} onChange={e=>setItemForm({...itemForm,wallpaper:{...itemForm.wallpaper,brand:e.target.value}})}/></label><label className="field">Coleção<input value={itemForm.wallpaper.collection} onChange={e=>setItemForm({...itemForm,wallpaper:{...itemForm.wallpaper,collection:e.target.value}})}/></label><label className="field">Referência<input value={itemForm.wallpaper.reference} onChange={e=>setItemForm({...itemForm,wallpaper:{...itemForm.wallpaper,reference:e.target.value}})}/></label><label className="field">Cor<input value={itemForm.wallpaper.color} onChange={e=>setItemForm({...itemForm,wallpaper:{...itemForm.wallpaper,color:e.target.value}})}/></label><label className="field">Largura da parede (m)<input type="number" min="0" step="0.001" value={itemForm.wallpaper.wall_width||''} onChange={e=>setItemForm({...itemForm,wallpaper:{...itemForm.wallpaper,wall_width:Number(e.target.value)}})}/></label><label className="field">Altura da parede (m)<input type="number" min="0" step="0.001" value={itemForm.wallpaper.wall_height||''} onChange={e=>setItemForm({...itemForm,wallpaper:{...itemForm.wallpaper,wall_height:Number(e.target.value)}})}/></label><label className="field">Largura do rolo (m)<input type="number" min="0" step="0.001" value={itemForm.wallpaper.roll_width||''} onChange={e=>setItemForm({...itemForm,wallpaper:{...itemForm.wallpaper,roll_width:Number(e.target.value)}})}/></label><label className="field">Comprimento do rolo (m)<input type="number" min="0" step="0.001" value={itemForm.wallpaper.roll_length||''} onChange={e=>setItemForm({...itemForm,wallpaper:{...itemForm.wallpaper,roll_length:Number(e.target.value)}})}/></label><label className="field">Quantidade confirmada de rolos<input type="number" min="1" step="1" value={itemForm.wallpaper.rolls} onChange={e=>{const rolls=Math.max(1,Number(e.target.value));setItemForm({...itemForm,quantity:rolls,wallpaper:{...itemForm.wallpaper,rolls}})}}/></label><div className="field"><span>Descrição sugerida</span><button type="button" className="button secondary" onClick={()=>setItemForm({...itemForm,description:wallpaperDescription(itemForm.wallpaper)})}>Gerar descrição</button></div></>}<label className="field span-2">Descrição para o cliente<textarea required value={itemForm.description} onChange={e=>setItemForm({...itemForm,description:e.target.value})} placeholder="Descreva modelo, material, medidas e acabamento"/></label><label className="field">Quantidade<input type="number" min="0.001" step="0.001" value={itemForm.quantity} onChange={e=>setItemForm({...itemForm,quantity:Number(e.target.value)})}/></label><label className="field">Apresentação<select value={itemForm.presentation} onChange={e=>setItemForm({...itemForm,presentation:e.target.value as ItemForm['presentation']})}><option value="principal">Item principal</option><option value="option">Opção (não soma)</option></select></label><label className="field">Custo do fabricante<input type="number" min="0" step="0.01" value={itemForm.manufacturer_cost} onChange={e=>setItemForm({...itemForm,manufacturer_cost:Number(e.target.value)})}/></label><label className="field">Instalação<input type="number" min="0" step="0.01" value={itemForm.installation_cost} onChange={e=>setItemForm({...itemForm,installation_cost:Number(e.target.value)})}/></label><label className="field">Custos adicionais<input type="number" min="0" step="0.01" value={itemForm.additional_cost} onChange={e=>setItemForm({...itemForm,additional_cost:Number(e.target.value)})}/></label>
<ItemCostComposition supplies={supplies} lines={supplyLines} onChange={setSupplyLines}/><label className="field">Custo total<input readOnly value={money.format(costOf(itemForm))}/></label><label className="field">Margem (%)<input type="number" min="0" step="0.1" value={itemForm.margin_percent} onChange={e=>setItemForm({...itemForm,margin_percent:Number(e.target.value)})}/></label><label className="field">Preço de venda<input type="number" min="0" step="0.01" value={itemForm.sale_total} onChange={e=>setItemForm({...itemForm,sale_total:Number(e.target.value)})}/></label><div className="span-2 item-recalculate"><button type="button" className="button secondary" onClick={()=>setItemForm(recalculate(itemForm))}>Recalcular pela margem</button><small>Considera fabricante, instalação, custos adicionais e insumos cadastrados.</small></div></div>{confirmDelete&&<div className="inline-confirm"><div><strong>Excluir este item?</strong><span>O total do orçamento será recalculado automaticamente.</span></div><button type="button" className="button secondary" onClick={()=>setConfirmDelete(false)}>Manter item</button><button type="button" className="button danger" disabled={itemSaving} onClick={()=>void deleteItem()}>Confirmar exclusão</button></div>}<footer>{itemForm.id&&!confirmDelete&&<button type="button" className="button danger footer-left" disabled={itemSaving} onClick={()=>setConfirmDelete(true)}>Excluir item</button>}<button type="button" className="button secondary" onClick={()=>setItemOpen(false)}>Cancelar</button><button className="button primary" disabled={itemSaving||pdfReading}>{itemSaving?'Salvando…':'Salvar apenas este item'}</button></footer></form></div>}
  </Page>
}
