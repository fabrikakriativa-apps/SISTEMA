import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowRight, CalendarClock, CircleDollarSign, FileText, PackageCheck, RefreshCw } from 'lucide-react'
import type { ModuleKey } from '../domain'
import { money } from '../lib/format'
import { summarizeDashboard, type DashboardBudget, type DashboardEvent, type DashboardOrder, type DashboardReceivable } from '../lib/dashboard'
import { supabase } from '../lib/supabase'
import { Page } from '../components/Page'
import { useAccess } from '../components/AuthorizedAccess'
import { DashboardPeriodFilter } from '../components/DashboardPeriodFilter'
import { hasDashboardPeriod, inDashboardPeriod, validDashboardPeriod, type DashboardPeriod, type DashboardPreset } from '../lib/dashboardPeriod'
import { priorityHash, type PriorityKind } from '../lib/dashboardFocus'
import { needsCalendarSync } from '../lib/calendarStatus'
import './Dashboard.css'

type DashboardData = { budgets: DashboardBudget[]; orders: DashboardOrder[]; receivables: DashboardReceivable[]; events: DashboardEvent[] }
const empty: DashboardData = { budgets: [], orders: [], receivables: [], events: [] }
type PageResult<T> = { data: T[] | null; error: unknown }
async function loadAll<T>(page:(from:number,to:number)=>PromiseLike<PageResult<T>>) {
  const result:T[] = [], size=1000
  for(let from=0;;from+=size){const current=await page(from,from+size-1);if(current.error)return {data:result,error:current.error};const rows=current.data??[];result.push(...rows);if(rows.length<size)return {data:result,error:null}}
}

export function Dashboard({ navigate }: { navigate: (key: ModuleKey) => void }) {
  const access = useAccess()
  const [data, setData] = useState<DashboardData>(empty)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState('')
  const [period,setPeriod]=useState<DashboardPeriod>({from:'',to:''})
  const [preset,setPreset]=useState<DashboardPreset>('all')
  const load = useCallback(async () => {
    if (!supabase || !access) { setLoading(false); return }
    setLoading(true); setError('')
    const org = access.organizationId, client=supabase
    const { error: overdueError } = await client.rpc('refresh_financial_overdues', { org_id: org })
    const [budgets, orders, receivables, events] = await Promise.all([
      loadAll<DashboardBudget>((from,to)=>client.from('budgets').select('id,created_at,status,total,document_type').eq('organization_id', org).order('id').range(from,to)),
      loadAll<DashboardOrder>((from,to)=>client.from('orders').select('id,status,created_at').eq('organization_id', org).not('status', 'in', '(completed,cancelled)').order('id').range(from,to)),
      loadAll<DashboardReceivable>((from,to)=>client.from('receivables').select('id,status,amount,paid_amount,due_date').eq('organization_id', org).in('status', ['open', 'partial', 'overdue']).order('id').range(from,to)),
      loadAll<DashboardEvent>((from,to)=>client.from('calendar_events').select('id,starts_at,cancelled_at,sync_status').eq('organization_id', org).order('id').range(from,to)),
    ])
    if (overdueError || [budgets.error, orders.error, receivables.error, events.error].some(Boolean)) setError('Não foi possível atualizar todos os indicadores. Tente novamente.')
    else setData({ budgets: (budgets.data ?? []) as DashboardBudget[], orders: (orders.data ?? []) as DashboardOrder[], receivables: (receivables.data ?? []) as DashboardReceivable[], events: (events.data ?? []) as DashboardEvent[] })
    setLoading(false)
  }, [access])
  useEffect(() => { void load() }, [load])
  const filtering=hasDashboardPeriod(period), validPeriod=validDashboardPeriod(period)
  const scoped = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0)
    return {
      budgets:data.budgets.filter(item=>inDashboardPeriod(item.created_at,period)),
      orders:data.orders.filter(item=>inDashboardPeriod(item.created_at,period)),
      receivables:data.receivables.filter(item=>inDashboardPeriod(item.due_date,period)),
      events:data.events.filter(item=>inDashboardPeriod(item.starts_at,period)&&(hasDashboardPeriod(period)||new Date(item.starts_at)>=today)),
    }
  }, [data,period])
  const summary = useMemo(()=>summarizeDashboard(scoped.budgets,scoped.orders,scoped.receivables,scoped.events),[scoped])
  const metrics = [
    { label:'Negociações cadastradas', value:String(summary.totalBudgetCount), helper:`${summary.totalPreBudgetCount} pré-orçamentos · ${summary.totalFormalBudgetCount} orçamentos`, icon:FileText, module:'orcamentos' as ModuleKey },
    { label:'Valor em negociação', value:money.format(summary.negotiatingTotal), helper:`Pré + orçamento · ${summary.negotiationDraftCount} em rascunho · ${summary.negotiationSentCount} enviados`, icon:FileText, module:'orcamentos' as ModuleKey },
    { label:'Conversão de negociações', value:`${summary.budgetConversionRate.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`, helper:`${summary.approvedBudgetCount} aprovadas de ${summary.totalBudgetCount} negociações únicas`, icon:FileText, module:'orcamentos' as ModuleKey },
    { label:'Pedidos ativos', value:String(summary.activeOrderCount), helper:filtering?'Criados no período e ainda não concluídos':'Ainda não concluídos', icon:PackageCheck, module:'pedidos' as ModuleKey },
    { label:'A receber', value:money.format(summary.receivableBalance), helper:filtering?'Saldo em aberto com vencimento no período':'Saldo das parcelas em aberto', icon:CircleDollarSign, module:'financeiro' as ModuleKey },
    { label:filtering?'Compromissos no período':'Próximos compromissos', value:String(filtering?summary.periodEventCount:summary.upcomingEventCount), helper:filtering?'Agenda do intervalo selecionado':'Agenda dos próximos 7 dias', icon:CalendarClock, module:'agenda' as ModuleKey },
  ]
  const ids=(rows:{id?:string}[])=>rows.flatMap(row=>row.id?[row.id]:[])
  const todayKey=new Date().toLocaleDateString('sv-SE')
  const priorities = [
    {kind:'pre-drafts',label:'Pré-orçamentos em rascunho',ids:ids(scoped.budgets.filter(x=>x.document_type==='pre_budget'&&x.status==='draft'))},
    {kind:'budget-drafts',label:'Orçamentos em rascunho',ids:ids(scoped.budgets.filter(x=>x.document_type==='budget'&&x.status==='draft'))},
    {kind:'awaiting-finance',label:'Pedidos aguardando financeiro',ids:ids(scoped.orders.filter(x=>x.status==='awaiting_finance'))},
    {kind:'overdue-receivables',label:'Parcelas a receber vencidas',ids:ids(scoped.receivables.filter(x=>x.status==='overdue'||!!(x.due_date&&x.due_date<todayKey)))},
    {kind:'calendar-sync',label:'Compromissos para sincronizar',ids:ids(scoped.events.filter(x=>!x.cancelled_at&&needsCalendarSync(x.sync_status)))},
  ].filter(item=>item.ids.length>0)
  return <Page title="Visão geral" description={filtering?'Sua operação no período selecionado':'Sua operação hoje'} action={<button className="button secondary" disabled={loading} onClick={() => void load()}><RefreshCw/>{loading ? 'Atualizando…' : 'Atualizar'}</button>}>
    <DashboardPeriodFilter value={period} preset={preset} onChange={(value,selected)=>{setPeriod(value);setPreset(selected)}}/>
    {!validPeriod&&<div className="inline-warning" role="alert"><AlertCircle/><span>A data inicial não pode ser posterior à data final.</span></div>}
    {error && <div className="inline-warning"><AlertCircle/><span>{error}</span></div>}
    <section className="metric-grid dashboard-metrics">{metrics.map(metric => <button type="button" className="metric-card clickable-metric" key={metric.label} disabled={!validPeriod} onClick={()=>navigate(metric.module)}><div><span>{metric.label}</span><strong>{loading||!validPeriod ? '—' : metric.value}</strong><small>{metric.helper}</small></div><metric.icon/></button>)}</section>
    <section className="dashboard-grid dashboard-lower"><article className="panel"><header><div><h2>Prioridades</h2><p>Abra os registros que precisam de atenção.</p></div></header>{loading||!validPeriod ? <p className="panel-message">{validPeriod?'Carregando indicadores…':'Ajuste o período para visualizar as prioridades.'}</p> : priorities.length ? <div className="quick-actions">{priorities.map(item => <button key={item.label} onClick={() => {window.location.hash=priorityHash(item.kind as PriorityKind,item.ids,period)}}><span><AlertCircle/><strong>{item.ids.length}</strong> {item.label}</span><ArrowRight/></button>)}</div> : <div className="empty-state"><PackageCheck/><strong>Nenhuma pendência neste período</strong><span>Os principais fluxos estão em dia.</span></div>}</article>
      <article className="panel quick-actions"><header><h2>Acessos rápidos</h2></header><button onClick={() => navigate('orcamentos')}><span><FileText/>Abrir orçamentos</span><ArrowRight/></button><button onClick={() => navigate('clientes')}><span><FileText/>Cadastrar cliente</span><ArrowRight/></button><button onClick={() => navigate('insumos')}><span><FileText/>Cadastrar insumo</span><ArrowRight/></button></article>
    </section>
  </Page>
}

