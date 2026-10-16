import {needsCalendarSync} from './calendarStatus'

export type DashboardBudget = { id: string; created_at?: string; status: string; total: number | string; document_type: 'pre_budget' | 'budget' }
export type DashboardOrder = { id?: string; status: string; created_at?: string }
export type DashboardReceivable = { id?: string; status: string; amount: number | string; paid_amount: number | string; due_date: string | null }
export type DashboardEvent = { id?: string; starts_at: string; cancelled_at: string | null; sync_status: string }

export function summarizeDashboard(budgets: DashboardBudget[], orders: DashboardOrder[], receivables: DashboardReceivable[], events: DashboardEvent[], now = new Date()) {
  // Conversion changes document_type on the same budget ID; a duplicated quote
  // has a new ID and represents an independent negotiation.
  const negotiations = [...new Map(budgets.map(item => [item.id, item])).values()]
  const formalBudgets = negotiations.filter(item => item.document_type === 'budget')
  const preBudgets = negotiations.filter(item => item.document_type === 'pre_budget')
  const activeBudgets = negotiations.filter(item => ['draft', 'sent'].includes(item.status))
  const activeOrders = orders.filter(item => !['completed', 'cancelled'].includes(item.status))
  const openReceivables = receivables.filter(item => ['open', 'partial', 'overdue'].includes(item.status))
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const end = new Date(today); end.setDate(end.getDate() + 7)
  const upcomingEvents = events.filter(item => { const start = new Date(item.starts_at); return !item.cancelled_at && start >= today && start < end })
  const approvedBudgets = formalBudgets.filter(item => item.status === 'approved').length
  return {
    negotiatingTotal: activeBudgets.reduce((sum, item) => sum + Number(item.total || 0), 0),
    preBudgetDraftCount: preBudgets.filter(item => item.status === 'draft').length,
    formalBudgetDraftCount: formalBudgets.filter(item => item.status === 'draft').length,
    formalBudgetSentCount: formalBudgets.filter(item => item.status === 'sent').length,
    totalPreBudgetCount: preBudgets.length,
    totalFormalBudgetCount: formalBudgets.length,
    negotiationDraftCount: activeBudgets.filter(item => item.status === 'draft').length,
    negotiationSentCount: activeBudgets.filter(item => item.status === 'sent').length,
    activeOrderCount: activeOrders.length,
    receivableBalance: openReceivables.reduce((sum, item) => sum + Math.max(0, Number(item.amount || 0) - Number(item.paid_amount || 0)), 0),
    upcomingEventCount: upcomingEvents.length,
    periodEventCount: events.filter(item=>!item.cancelled_at).length,
    budgetConversionRate: negotiations.length ? (approvedBudgets / negotiations.length) * 100 : 0,
    approvedBudgetCount: approvedBudgets,
    totalBudgetCount: negotiations.length,
    priorities: {
      preBudgetDrafts: preBudgets.filter(item => item.status === 'draft').length,
      budgetDrafts: formalBudgets.filter(item => item.status === 'draft').length,
      awaitingFinance: activeOrders.filter(item => item.status === 'awaiting_finance').length,
      overdueReceivables: openReceivables.filter(item => item.status === 'overdue' || Boolean(item.due_date && item.due_date < today.toISOString().slice(0, 10))).length,
      calendarSync: events.filter(item => !item.cancelled_at && needsCalendarSync(item.sync_status)).length,
    },
  }
}

