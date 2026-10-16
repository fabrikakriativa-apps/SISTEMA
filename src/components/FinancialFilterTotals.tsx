import type { ReactNode } from 'react'
import { money } from '../lib/format'
import { financialSummary, type FinancialCardFilter } from '../lib/financialSummary'
import './FinancialFilterTotals.css'

type Summary = ReturnType<typeof financialSummary>
export function FinancialFilterTotals({ summary, kind, active, onSelect, children }: { summary: Summary; kind: 'payable' | 'receivable'; active?: string; onSelect?: (key: FinancialCardFilter) => void; children?: ReactNode }) {
  const values = [
    { key: 'all' as const, label: 'Total no período', amount: summary.total, tone: 'neutral' },
    { key: 'received' as const, label: kind === 'payable' ? 'Pago' : 'Recebido', amount: summary.paid, tone: 'paid' },
    { key: 'open' as const, label: kind === 'payable' ? 'A pagar' : 'A receber', amount: summary.open, tone: 'pending' },
    { key: 'overdue' as const, label: 'Vencido em aberto', amount: summary.overdue, tone: 'overdue' },
  ]
  return <section className="financial-filter-totals" aria-label={`Totais filtrados de contas a ${kind === 'payable' ? 'pagar' : 'receber'}`}>
    <div className="financial-filter-caption"><span>Período e busca</span><small>{summary.count} parcela(s) válidas</small></div>
    <div className="financial-filter-values">{values.map(item => onSelect ? <button type="button" key={item.key} className={`financial-filter-value ${item.tone} ${active === item.key ? 'selected' : ''}`} aria-pressed={active === item.key} onClick={() => onSelect(item.key)}><span>{item.label}</span><strong>{money.format(item.amount)}</strong></button> : <div key={item.key} className={`financial-filter-value ${item.tone}`}><span>{item.label}</span><strong>{money.format(item.amount)}</strong></div>)}
    </div>
    {children && <div className="financial-filter-extras">{children}</div>}
  </section>
}

