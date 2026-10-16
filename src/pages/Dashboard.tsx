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
      loadAll<DashboardOrder>((from,to)=>client.from('orders').select('status,created_at').eq('organization_id', org).not('status', 'in', '(completed,cancelled)').order('id').range(from,to)),
      loadAll<DashboardReceivable>((from,to)=>client.from('receivables').select('status,amount,paid_amount,due_date').eq('organization_id', org).in('status', ['open', 'partial', 'overdue']).order('id').range(from,to)),
      loadAll<DashboardEvent>((from,to)=>client.from('calendar_events').select('starts_at,cancelled_at,sync_status').eq('organization_id', org).order('id').range(from,to)),
    ])
    if (overdueError || [budgets.error, orders.error, receivables.error, events.error].some(Boolean)) setError('Não foi possível atualizar todos os indicadores. Tente novamente.')
    else setData({ budgets: (budgets.data ?? []) as DashboardBudget[], orders: (orders.data ?? []) as DashboardOrder[], receivables: (receivables.data ?? []) as DashboardReceivable[], events: (events.data ?? []) as DashboardEvent[] })
    setLoading(false)
  }, [access])
  useEffect(() => { void load() }, [load])
  const filtering=hasDashboardPeriod(period), validPeriod=validDashboardPeriod(period)
  const summary = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0)
    return summarizeDashboard(
      data.budgets.filter(item=>inDashboardPeriod(item.created_at,period)),
      data.orders.filter(item=>inDashboardPeriod(item.created_at,period)),
      data.receivables.filter(item=>inDashboardPeriod(item.due_date,period)),
      data.events.filter(item=>inDashboardPeriod(item.starts_at,period)&&(hasDashboardPeriod(period)||new Date(item.starts_at)>=today)),
    )
  }, [data,period])
  const metrics = [
    { label:'Negociações cadastradas', value:String(summary.totalBudgetCount), helper:`${summary.totalPreBudgetCount} pré-orçamentos · ${summary.totalFormalBudgetCount} orçamentos`, icon:FileText, module:'orcamentos' as ModuleKey },
    { label:'Valor em negociação', value:money.format(summary.negotiatingTotal), helper:`Pré + orçamento · ${summary.negotiationDraftCount} em rascunho · ${summary.negotiationSentCount} enviados`, icon:FileText, module:'orcamentos' as ModuleKey },
    { label:'Conversão de negociações', value:`${summary.budgetConversionRate.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`, helper:`${summary.approvedBudgetCount} aprovadas de ${summary.totalBudgetCount} negociações únicas`, icon:FileText, module:'orcamentos' as ModuleKey },
    { label:'Pedidos ativos', value:String(summary.activeOrderCount), helper:filtering?'Criados no período e ainda não concluídos':'Ainda não concluídos', icon:PackageCheck, module:'pedidos' as ModuleKey },
    { label:'A receber', value:money.format(summary.receivableBalance), helper:filtering?'Saldo em aberto com vencimento no período':'Saldo das parcelas em aberto', icon:CircleDollarSign, module:'financeiro' as ModuleKey },
    { label:filtering?'Compromissos no período':'Próximos compromissos', value:String(filtering?summary.periodEventCount:summary.upcomingEventCount), helper:filtering?'Agenda do intervalo selecionado':'Agenda dos próximos 7 dias', icon:CalendarClock, module:'agenda' as ModuleKey },
  ]
  const priorities = [
    { label:'Pré-orçamentos em rascunho', value:summary.priorities.preBudgetDrafts, module:'orcamentos' as ModuleKey },
    { label:'Orçamentos em rascunho', value:summary.priorities.budgetDrafts, module:'orcamentos' as ModuleKey },
    { label:'Pedidos aguardando financeiro', value:summary.priorities.awaitingFinance, module:'pedidos' as ModuleKey },
    { label:'Parcelas a receber vencidas', value:summary.priorities.overdueReceivables, module:'financeiro' as ModuleKey },
    { label:'Compromissos para sincronizar', value:summary.priorities.calendarSync, module:'agenda' as ModuleKey },
  ].filter(item => item.value > 0)
  return <Page title="Visão geral" description={filtering?'Sua operação no período selecionado':'Sua operação hoje'} action={<button className="button secondary" disabled={loading} onClick={() => void load()}><RefreshCw/>{loading ? 'Atualizando…' : 'Atualizar'}</button>}>
    <DashboardPeriodFilter value={period} preset={preset} onChange={(value,selected)=>{setPeriod(value);setPreset(selected)}}/>
    {!validPeriod&&<div className="inline-warning" role="alert"><AlertCircle/><span>A data inicial não pode ser posterior à data final.</span></div>}
    {error && <div className="inline-warning"><AlertCircle/><span>{error}</span></div>}
    <section className="metric-grid">{metrics.map(metric => <button type="button" className="metric-card clickable-metric" key={metric.label} disabled={!validPeriod} onClick={()=>navigate(metric.module)}><div><span>{metric.label}</span><strong>{loading||!validPeriod ? '—' : metric.value}</strong><small>{metric.helper}</small></div><metric.icon/></button>)}</section>
    <section className="dashboard-grid"><article className="panel"><header><div><h2>Prioridades</h2><p>O que precisa de atenção agora.</p></div></header>{loading ? <p className="panel-message">Carregando indicadores…</p> : priorities.length ? <div className="quick-actions">{priorities.map(item => <button key={item.label} onClick={() => navigate(item.module)}><span><AlertCircle/><strong>{item.value}</strong> {item.label}</span><ArrowRight/></button>)}</div> : <div className="empty-state"><PackageCheck/><strong>Nenhuma pendência imediata</strong><span>Os principais fluxos estão em dia.</span></div>}</article>
      <article className="panel quick-actions"><header><h2>Acessos rápidos</h2></header><button onClick={() => navigate('orcamentos')}><span><FileText/>Abrir orçamentos</span><ArrowRight/></button><button onClick={() => navigate('clientes')}><span><FileText/>Cadastrar cliente</span><ArrowRight/></button><button onClick={() => navigate('insumos')}><span><FileText/>Cadastrar insumo</span><ArrowRight/></button></article>
    </section>
  </Page>
}

