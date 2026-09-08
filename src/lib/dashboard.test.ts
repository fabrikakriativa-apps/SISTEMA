import { describe, expect, it } from 'vitest'
import { summarizeDashboard } from './dashboard'

describe('summarizeDashboard', () => {
  it('calcula saldos e considera somente registros ativos', () => {
    const result = summarizeDashboard(
      [{ status: 'draft', total: 100 }, { status: 'sent', total: '250' }, { status: 'approved', total: 900 }],
      [{ status: 'awaiting_finance' }, { status: 'preparing' }, { status: 'completed' }],
      [{ status: 'partial', amount: 200, paid_amount: 50, due_date: '2026-09-01' }, { status: 'settled', amount: 500, paid_amount: 500, due_date: '2026-09-01' }],
      [{ starts_at: '2026-09-10T12:00:00Z', cancelled_at: null, sync_status: 'error' }, { starts_at: '2026-09-11T12:00:00Z', cancelled_at: '2026-09-01', sync_status: 'pending' }],
      new Date('2026-09-07T12:00:00Z'),
    )
    expect(result).toMatchObject({ negotiatingTotal: 350, activeOrderCount: 2, receivableBalance: 150, upcomingEventCount: 1 })
    expect(result.priorities).toEqual({ drafts: 1, awaitingFinance: 1, overdueReceivables: 1, calendarSync: 2 })
  })
})
