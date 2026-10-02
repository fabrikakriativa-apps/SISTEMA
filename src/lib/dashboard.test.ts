import { describe, expect, it } from 'vitest'
import { summarizeDashboard } from './dashboard'

describe('summarizeDashboard', () => {
  it('calcula saldos e considera somente registros ativos', () => {
    const result = summarizeDashboard(
      [{ status: 'draft', total: 100, document_type: 'pre_budget' }, { status: 'sent', total: '250', document_type: 'budget' }, { status: 'approved', total: 900, document_type: 'budget' }],
      [{ status: 'awaiting_finance' }, { status: 'preparing' }, { status: 'completed' }],
      [{ status: 'partial', amount: 200, paid_amount: 50, due_date: '2026-09-01' }, { status: 'settled', amount: 500, paid_amount: 500, due_date: '2026-09-01' }],
      [{ starts_at: '2026-09-10T12:00:00Z', cancelled_at: null, sync_status: 'error' }, { starts_at: '2026-09-11T12:00:00Z', cancelled_at: '2026-09-01', sync_status: 'pending' }],
      new Date('2026-09-07T12:00:00Z'),
    )
    expect(result).toMatchObject({ negotiatingTotal: 250, preBudgetDraftCount: 1, formalBudgetDraftCount: 0, formalBudgetSentCount: 1, activeOrderCount: 2, receivableBalance: 150, upcomingEventCount: 1, approvedBudgetCount: 1, totalBudgetCount: 2 })
    expect(result.budgetConversionRate).toBeCloseTo(50)
    expect(result.priorities).toEqual({ preBudgetDrafts: 1, budgetDrafts: 0, awaitingFinance: 1, overdueReceivables: 1, calendarSync: 2 })
  })
})
