import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowRight, CalendarClock, CircleDollarSign, FileText, PackageCheck, RefreshCw } from 'lucide-react'
import type { ModuleKey } from '../domain'
import { money } from '../lib/format'
import { summarizeDashboard, type DashboardBudget, type DashboardEvent, type DashboardOrder, type DashboardReceivable } from '../lib/dashboard'
import { supabase } from '../lib/supabase'
import { Page } from '../components/Page'
import { useAccess } from '../components/AuthorizedAccess'

type DashboardData = { budgets: DashboardBudget[]; orders: DashboardOrder[]; receivables: DashboardReceivable[]; events: DashboardEvent[] }
const empty: DashboardData = { budgets: [], orders: [], receivables: [], events: [] }

export function Dashboard({ navigate }: { navigate: (key: ModuleKey) => void }) {
  const access = useAccess()
  const [data, setData] = useState<DashboardData>(empty)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!supabase || !access) { setLoading(false); return }
    setLoading(true); setError('')
    const org = access.organizationId
    const [budgets, orders, receivables, events] = await Promise.all([
      supabase.from('budgets').select('status,total').eq('organization_id', org).in('status', ['draft', 'sent']).limit(1000),
      supabase.from('orders').select('status').eq('organization_id', org).not('status', 'in', '(completed,cancelled)').limit(1000),
      supabase.from('receivables').select('status,amount,paid_amount,due_date').eq('organization_id', org).in('status', ['open', 'partial', 'overdue']).limit(1000),
      supabase.from('calendar_events').select('starts_at,cancelled_at,sync_status').eq('organization_id', org).gte('starts_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()).limit(1000),
    ])
    if ([budgets.error, orders.error, receivables.error, events.error].some(Boolean)) setError('Não foi possível atualizar todos os indicadores. Tente novamente.')
    else setData({ budgets: (budgets.data ?? []) as DashboardBudget[], orders: (orders.data ?? []) as DashboardOrder[], receivables: (receivables.data ?? []) as DashboardReceivable[], events: (events.data ?? []) as DashboardEvent[] })
    setLoading(false)
  }, [access])
  useEffect(() => { void load() }, [load])
  const summary = useMemo(() => summarizeDashboard(data.budgets, data.orders, data.receivables, data.events), [data])
  const metrics = [
    { label:'Em negociação', value:money.format(summary.negotiatingTotal), helper:'Orçamentos em rascunho ou enviados', icon:FileText },
    { label:'Pedidos ativos', value:String(summary.activeOrderCount), helper:'Ainda não concluídos', icon:PackageCheck },
    { label:'A receber', value:money.format(summary.receivableBalance), helper:'Saldo das parcelas em aberto', icon:CircleDollarSign },
    { label:'Próximos compromissos', value:String(summary.upcomingEventCount), helper:'Agenda dos próximos 7 dias', icon:CalendarClock },
  ]
  const priorities = [
    { label:'Orçamentos em rascunho', value:summary.priorities.drafts, module:'orcamentos' as ModuleKey },
    { label:'Pedidos aguardando financeiro', value:summary.priorities.awaitingFinance, module:'pedidos' as ModuleKey },
    { label:'Parcelas vencidas', value:summary.priorities.overdueReceivables, module:'financeiro' as ModuleKey },
    { label:'Compromissos para sincronizar', value:summary.priorities.calendarSync, module:'agenda' as ModuleKey },
  ].filter(item => item.value > 0)
  return <Page title="Visão geral" description="Um retrato atualizado da operação, sem dados duplicados ou cálculos ocultos." action={<button className="button secondary" disabled={loading} onClick={() => void load()}><RefreshCw/>{loading ? 'Atualizando…' : 'Atualizar'}</button>}>
    {error && <div className="inline-warning"><AlertCircle/><span>{error}</span></div>}
    <section className="metric-grid">{metrics.map(metric => <article className="metric-card" key={metric.label}><div><span>{metric.label}</span><strong>{loading ? '—' : metric.value}</strong><small>{metric.helper}</small></div><metric.icon/></article>)}</section>
    <section className="dashboard-grid"><article className="panel"><header><div><h2>Prioridades</h2><p>O que precisa de atenção agora.</p></div></header>{loading ? <p className="panel-message">Carregando indicadores…</p> : priorities.length ? <div className="quick-actions">{priorities.map(item => <button key={item.label} onClick={() => navigate(item.module)}><span><AlertCircle/><strong>{item.value}</strong> {item.label}</span><ArrowRight/></button>)}</div> : <div className="empty-state"><PackageCheck/><strong>Nenhuma pendência imediata</strong><span>Os principais fluxos estão em dia.</span></div>}</article>
      <article className="panel quick-actions"><header><h2>Acessos rápidos</h2></header><button onClick={() => navigate('orcamentos')}><span><FileText/>Abrir orçamentos</span><ArrowRight/></button><button onClick={() => navigate('clientes')}><span><FileText/>Cadastrar cliente</span><ArrowRight/></button><button onClick={() => navigate('insumos')}><span><FileText/>Cadastrar insumo</span><ArrowRight/></button></article>
    </section>
  </Page>
}
