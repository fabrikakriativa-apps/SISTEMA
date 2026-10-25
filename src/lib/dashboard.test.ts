import { describe, expect, it } from 'vitest'
import { summarizeDashboard } from './dashboard'

describe('summarizeDashboard', () => {
  it('calcula saldos e considera somente registros ativos', () => {
    const result = summarizeDashboard(
      [{ id:'a', status: 'draft', total: 100, document_type: 'pre_budget' }, { id:'b', status: 'sent', total: '250', document_type: 'budget' }, { id:'c', status: 'approved', total: 900, document_type: 'budget' }],
      [{ status: 'awaiting_finance' }, { status: 'preparing' }, { status: 'completed' }],
      [{ status: 'partial', amount: 200, paid_amount: 50, due_date: '2026-09-01' }, { status: 'settled', amount: 500, paid_amount: 500, due_date: '2026-09-01' }],
      [{ starts_at: '2026-09-10T12:00:00Z', cancelled_at: null, sync_status: 'error' }, { starts_at: '2026-09-11T12:00:00Z', cancelled_at: '2026-09-01', sync_status: 'pending' }],
      new Date('2026-09-07T12:00:00Z'),
    )
    expect(result).toMatchObject({ negotiatingTotal: 350, preBudgetDraftCount: 1, formalBudgetDraftCount: 0, formalBudgetSentCount: 1, activeOrderCount: 2, receivableBalance: 150, upcomingEventCount: 1, approvedBudgetCount: 1, totalBudgetCount: 3, totalPreBudgetCount:1,totalFormalBudgetCount:2,negotiationDraftCount:1,negotiationSentCount:1 })
    expect(result.budgetConversionRate).toBeCloseTo(100/3)
    expect(result.priorities).toEqual({ preBudgetDrafts: 1, budgetDrafts: 0, awaitingFinance: 1, overdueReceivables: 1, calendarSync: 1 })
  })
  it('mantém uma negociação ao converter o pré-orçamento',()=>{
    const pre={id:'same',status:'sent',total:100,document_type:'pre_budget' as const}
    const before=summarizeDashboard([pre],[],[],[])
    const after=summarizeDashboard([{...pre,document_type:'budget',status:'approved'}],[],[],[])
    expect(before.totalBudgetCount).toBe(1)
    expect(after.totalBudgetCount).toBe(1)
    expect(after.budgetConversionRate).toBe(100)
  })
  it('conta cópia independente e não repete o mesmo ID',()=>{
    const budget={id:'a',status:'approved',total:100,document_type:'budget' as const}
    const result=summarizeDashboard([budget,budget,{...budget,id:'b',status:'draft'}],[],[],[])
    expect(result.totalBudgetCount).toBe(2)
    expect(result.approvedBudgetCount).toBe(1)
    expect(result.budgetConversionRate).toBe(50)
  })
  it('cancelados não distorcem a conversão, mas perdidos integram a base histórica',()=>{
    const result=summarizeDashboard([{id:'pre',document_type:'pre_budget',status:'cancelled',total:100},{id:'formal',document_type:'budget',status:'approved',total:100}],[],[],[])
    expect(result.budgetConversionRate).toBe(100)
    expect(result.negotiatingTotal).toBe(0)
    const lost=summarizeDashboard([{id:'pre',document_type:'pre_budget',status:'rejected',total:100},{id:'formal',document_type:'budget',status:'approved',total:100}],[],[],[])
    expect(lost.budgetConversionRate).toBe(50)
    expect(lost.negotiatingTotal).toBe(0)
  })
  it('trata base vazia sem divisão por zero',()=>expect(summarizeDashboard([],[],[],[]).budgetConversionRate).toBe(0))
  it('mantém sem resposta no valor em negociação e na base de conversão',()=>{
    const result=summarizeDashboard([{id:'pending',status:'no_response',total:250,document_type:'pre_budget'},{id:'won',status:'approved',total:100,document_type:'budget'}],[],[],[])
    expect(result.negotiatingTotal).toBe(250);expect(result.budgetConversionRate).toBe(50)
  })
})
