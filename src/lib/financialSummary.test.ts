import { describe, it, expect } from 'vitest'
import { financialSummary } from './financialSummary'
const row = (amount: number | string, paid_amount: number | string, status = 'open', due_date: string | null = '2026-10-15') => ({ amount, paid_amount, status, due_date })
describe('totais do filtro financeiro', () => {
  it('soma valores e desconta pagamentos parciais sem duplicar o rateio', () => expect(financialSummary([row(1072.38, 500, 'partial'), row(671.57, 0)], '2026-10-16')).toEqual({ count: 2, total: 1743.95, paid: 500, open: 1243.95, overdue: 1243.95 }))
  it('não inclui cancelados ou estornados', () => expect(financialSummary([row(100, 100, 'cancelled'), row(100, 0, 'reversed')], '2026-10-16')).toEqual({ count: 0, total: 0, paid: 0, open: 0, overdue: 0 }))
  it('não considera hoje ou sem vencimento como atrasado', () => expect(financialSummary([row(10, 0, 'open', '2026-10-16'), row(20, 0, 'open', null)], '2026-10-16')).toEqual({ count: 2, total: 30, paid: 0, open: 30, overdue: 0 }))
  it('conta valor liquidado como pago e não como saldo', () => expect(financialSummary([row('100.20', '100.20', 'settled')], '2026-10-16').open).toBe(0))
  it('evita resíduos de ponto flutuante', () => expect(financialSummary([row(.1, 0), row(.2, 0)], '2026-10-16').total).toBe(.3))
  it('recebe somente as linhas já filtradas', () => { const entries = [row(10, 0, 'open', '2026-10-01'), row(20, 0, 'open', '2026-11-01')]; expect(financialSummary(entries.filter(x => x.due_date! <= '2026-10-31'), '2026-10-16').total).toBe(10) })
})

