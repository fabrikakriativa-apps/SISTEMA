import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, FileText, Plus, Search } from 'lucide-react'
import { Page } from '../components/Page'
import { useAccess } from '../components/AuthorizedAccess'
import { useToast } from '../components/ToastProvider'
import { money } from '../lib/format'
import { supabase } from '../lib/supabase'

type BudgetStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'cancelled'
type Budget = {
  id:string; number:number; display_number:string; current_revision:number; client_id:string|null
  status:BudgetStatus; valid_until:string|null; payment_terms:string|null; delivery_terms:string|null
  notes:string|null; internal_notes:string|null; subtotal:number; discount:number; total:number
  created_at:string; updated_at:string; client:{name:string}|null
}
type Client = { id:string; name:string; client_type:string }
type Editable = Pick<Budget,'client_id'|'valid_until'|'payment_terms'|'delivery_terms'|'notes'|'internal_notes'|'discount'>

const labels:Record<BudgetStatus,string> = { draft:'Rascunho', sent:'Enviado', approved:'Aprovado', rejected:'Reprovado', cancelled:'Cancelado' }
const blankEditable:Editable = { client_id:null, valid_until:null, payment_terms:'', delivery_terms:'', notes:'', internal_notes:'', discount:0 }
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
  if(selected) return <BudgetEditor budget={selected} form={form} setForm={setForm} clients={clients} saveState={saveState} close={()=>{initialized.current=false;selectedRef.current=null;setSelected(null)}}/>

  return <Page title="Orçamentos" description="Rascunhos automáticos, revisões preservadas e uma única versão para tela, PDF e WhatsApp." action={<button className="button primary" disabled={creating} onClick={create}><Plus/>{creating?'Criando…':'Novo orçamento'}</button>}>
    {loading&&<p role="status">Carregando orçamentos…</p>}{error&&<p role="alert">{error} <button className="button secondary" onClick={load}>Tentar novamente</button></p>}
    <section className="status-grid"><article><span>Rascunhos</span><strong>{counts.draft}</strong></article><article><span>Enviados</span><strong>{counts.sent}</strong></article><article><span>Aprovados</span><strong>{counts.approved}</strong></article><article><span>Reprovados</span><strong>{counts.rejected}</strong></article></section>
    <section className="panel"><div className="toolbar"><label className="search"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cliente, número ou status"/></label><span>{filtered.length} orçamento(s)</span></div><div className="table-wrap"><table><thead><tr><th>Número / cliente</th><th>Revisão</th><th>Criação</th><th>Valor</th><th>Status</th></tr></thead><tbody>{filtered.map(item=><tr className="clickable-row" key={item.id} onClick={()=>openEditor(item)}><td><strong>{item.display_number}</strong><small>{item.client?.name??'Cliente não informado'}</small></td><td>v{item.current_revision}</td><td>{new Date(item.created_at).toLocaleDateString('pt-BR')}</td><td><strong>{money.format(Number(item.total))}</strong></td><td><span className={`badge ${item.status==='approved'?'green':''}`}>{labels[item.status]}</span></td></tr>)}</tbody></table>{!loading&&!filtered.length&&<div className="empty-state"><FileText/><strong>Nenhum orçamento encontrado</strong><span>Crie o primeiro rascunho para começar.</span></div>}</div></section>
  </Page>
}

function BudgetEditor({budget,form,setForm,clients,saveState,close}:{budget:Budget;form:Editable;setForm:(value:Editable)=>void;clients:Client[];saveState:string;close:()=>void}) {
  const client=clients.find(item=>item.id===form.client_id)
  const stateLabel=saveState==='saving'?'Salvando…':saveState==='waiting'?'Alterações pendentes':saveState==='error'?'Falha ao salvar':'Rascunho sincronizado'
  return <Page title="Construção do orçamento" description="Monte os dados comerciais e os itens que o cliente receberá." action={<button className="button secondary" onClick={close}><ArrowLeft/>Voltar aos orçamentos</button>}>
    <div className="budget-layout"><section className="panel budget-form"><header><div><h2>Dados comerciais</h2><p>{budget.display_number} · revisão {budget.current_revision}</p></div><span className={`save-state ${saveState}`}>{stateLabel}</span></header><div className="form-grid">
      <label className="field span-2">Cliente final<select value={form.client_id??''} onChange={e=>setForm({...form,client_id:e.target.value||null})}><option value="">Selecione um cliente</option>{clients.filter(x=>x.client_type==='Cliente final').map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field">Validade<input type="date" value={form.valid_until??''} onChange={e=>setForm({...form,valid_until:e.target.value})}/></label><label className="field">Previsão<input value={form.delivery_terms??''} onChange={e=>setForm({...form,delivery_terms:e.target.value})} placeholder="Ex.: 25 dias úteis"/></label>
      <label className="field span-2">Condição de pagamento<input value={form.payment_terms??''} onChange={e=>setForm({...form,payment_terms:e.target.value})}/></label><label className="field span-2">Observações para o cliente<textarea value={form.notes??''} onChange={e=>setForm({...form,notes:e.target.value})}/></label><label className="field span-2">Observações internas<textarea value={form.internal_notes??''} onChange={e=>setForm({...form,internal_notes:e.target.value})}/></label>
    </div></section><aside className="panel budget-summary"><header><h2>Resumo</h2></header><dl><div><dt>Cliente</dt><dd>{client?.name??'Não informado'}</dd></div><div><dt>Subtotal</dt><dd>{money.format(Number(budget.subtotal))}</dd></div><div><dt>Desconto</dt><dd><input type="number" min="0" step="0.01" value={form.discount} onChange={e=>setForm({...form,discount:Number(e.target.value)})}/></dd></div><div className="total"><dt>Total</dt><dd>{money.format(Math.max(0,Number(budget.subtotal)-Number(form.discount||0)))}</dd></div></dl></aside></div>
    <section className="panel budget-items"><header><div><h2>Itens do orçamento</h2><p>A inclusão de itens será conectada na próxima etapa.</p></div><button className="button primary" disabled><Plus/>Adicionar item</button></header><div className="empty-state compact"><FileText/><strong>Nenhum item adicionado</strong><span>Os dados gerais já são salvos automaticamente como rascunho.</span></div></section>
  </Page>
}
