import {needsCalendarSync} from './calendarStatus'

export type DashboardBudget = { status: string; total: number | string }
export type DashboardOrder = { status: string }
export type DashboardReceivable = { status: string; amount: number | string; paid_amount: number | string; due_date: string | null }
export type DashboardEvent = { starts_at: string; cancelled_at: string | null; sync_status: string }

export function summarizeDashboard(budgets: DashboardBudget[], orders: DashboardOrder[], receivables: DashboardReceivable[], events: DashboardEvent[], now = new Date()) {
  const activeBudgets = budgets.filter(item => ['draft', 'sent'].includes(item.status))
  const activeOrders = orders.filter(item => !['completed', 'cancelled'].includes(item.status))
  const openReceivables = receivables.filter(item => ['open', 'partial', 'overdue'].includes(item.status))
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const end = new Date(today); end.setDate(end.getDate() + 7)
  const upcomingEvents = events.filter(item => { const start = new Date(item.starts_at); return !item.cancelled_at && start >= today && start < end })
  const approvedBudgets = budgets.filter(item => item.status === 'approved').length
  return {
    negotiatingTotal: activeBudgets.reduce((sum, item) => sum + Number(item.total || 0), 0),
    activeOrderCount: activeOrders.length,
    receivableBalance: openReceivables.reduce((sum, item) => sum + Math.max(0, Number(item.amount || 0) - Number(item.paid_amount || 0)), 0),
    upcomingEventCount: upcomingEvents.length,
    budgetConversionRate: budgets.length ? (approvedBudgets / budgets.length) * 100 : 0,
    approvedBudgetCount: approvedBudgets,
    totalBudgetCount: budgets.length,
    priorities: {
      drafts: activeBudgets.filter(item => item.status === 'draft').length,
      awaitingFinance: activeOrders.filter(item => item.status === 'awaiting_finance').length,
      overdueReceivables: openReceivables.filter(item => item.status === 'overdue' || Boolean(item.due_date && item.due_date < today.toISOString().slice(0, 10))).length,
      calendarSync: events.filter(item => needsCalendarSync(item.sync_status)).length,
    },
  }
}
