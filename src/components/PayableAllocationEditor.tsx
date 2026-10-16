import { DecimalInput } from './DecimalInput'
import { SearchSelect } from './SearchSelect'
import { money } from '../lib/format'
import { payableItemLabel } from '../lib/payableEditor'
import type { PayableAllocation } from '../lib/payableAllocation'

export type AllocationOrder = { id: string; display_number: string; client: { name: string } | null; order_items: { id: string; budget_item_id: string; snapshot: { description?: string; environment?: string | null } }[] }
export function PayableAllocationEditor({ rows, orders, total, onChange }: { rows: PayableAllocation[]; orders: AllocationOrder[]; total: number; onChange: (rows: PayableAllocation[]) => void }) {
  const update = (index: number, patch: Partial<PayableAllocation>) => onChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row))
  return <section className="manual-installments span-2" aria-label="Rateio entre pedidos">
    <h3>Pedidos e rateio (opcional)</h3>
    <p>Uma única conta do fornecedor pode cobrir vários pedidos. Informe o valor ou percentual de cada um.</p>
    {rows.map((row, index) => {
      const order = orders.find(item => item.id === row.order_id)
      return <fieldset key={index} className="form-grid" style={{ marginBottom: 16 }}>
        <legend>Pedido {index + 1}</legend>
        <div className="field span-2"><span>Pedido / cliente</span><SearchSelect ariaLabel={`Buscar pedido do rateio ${index + 1}`} value={row.search} options={orders.map(item => ({ id: item.id, label: `${item.display_number} · ${item.client?.name ?? 'Cliente não informado'}` }))} placeholder="Digite o pedido ou cliente" onChange={search => update(index, { search, order_id: '', budget_item_id: '' })} onSelect={option => update(index, { search: option.label, order_id: option.id, budget_item_id: '' })} /></div>
        {order && <label className="field span-2">Item do pedido<select value={row.budget_item_id} onChange={event => update(index, { budget_item_id: event.target.value })}><option value="">Pedido inteiro (sem item específico)</option>{order.order_items.map(item => <option key={item.id} value={item.budget_item_id}>{payableItemLabel(item.snapshot)}</option>)}</select></label>}
        <label className="field">Valor atribuído<DecimalInput ariaLabel={`Valor do pedido ${index + 1}`} value={row.amount} decimalScale={2} onValueChange={amount => update(index, { amount })} /></label>
        <label className="field">Proporção (%)<DecimalInput ariaLabel={`Percentual do pedido ${index + 1}`} value={total > 0 ? Math.round(row.amount / total * 10000) / 100 : 0} decimalScale={2} onValueChange={percent => update(index, { amount: Math.round(total * percent) / 100 })} /></label>
        <button type="button" className="button secondary" onClick={() => onChange(rows.filter((_, i) => i !== index))}>Remover pedido</button>
      </fieldset>
    })}
    <button type="button" className="button secondary" onClick={() => onChange([...rows, { order_id: '', budget_item_id: '', search: '', amount: Math.max(0, Math.round((total - rows.reduce((sum, row) => sum + row.amount, 0)) * 100) / 100) }])}>Adicionar pedido ao rateio</button>
    {!!rows.length && <p>Total do rateio: <strong>{money.format(rows.reduce((sum, row) => sum + row.amount, 0))}</strong> de {money.format(total)}</p>}
  </section>
}

