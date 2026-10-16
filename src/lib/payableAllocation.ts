export type PayableAllocation = { order_id: string; budget_item_id: string; amount: number; search: string }
export const allocationCents = (amount: number) => Math.round((Number(amount) || 0) * 100)
export function allocationError(rows: PayableAllocation[], total: number): string | null {
  if (!rows.length) return null
  if (rows.some(row => !row.order_id)) return 'Selecione cada pedido nos resultados da busca.'
  if (new Set(rows.map(row => row.order_id)).size !== rows.length) return 'Cada pedido deve aparecer uma única vez no rateio.'
  if (rows.some(row => allocationCents(row.amount) <= 0)) return 'Informe um valor maior que zero para cada pedido.'
  if (rows.reduce((sum, row) => sum + allocationCents(row.amount), 0) !== allocationCents(total)) return 'O rateio entre pedidos deve somar o valor total da conta.'
  return null
}

