type Entry = { amount: number | string; paid_amount: number | string; status: string; due_date: string | null }
const cents = (value: number | string) => Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) : 0
export function financialSummary(entries: Entry[], today: string) {
  const result = { count: 0, total: 0, paid: 0, open: 0, overdue: 0 }
  for (const entry of entries) {
    if (['cancelled', 'reversed'].includes(entry.status)) continue
    const amount = Math.max(0, cents(entry.amount)), paid = Math.max(0, cents(entry.paid_amount))
    const balance = ['open', 'partial', 'overdue'].includes(entry.status) ? Math.max(0, amount - paid) : 0
    result.count++; result.total += amount; result.paid += paid; result.open += balance
    if (entry.due_date && entry.due_date < today) result.overdue += balance
  }
  return { ...result, total: result.total / 100, paid: result.paid / 100, open: result.open / 100, overdue: result.overdue / 100 }
}

