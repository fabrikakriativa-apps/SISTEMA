import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, Search, Trash2, X } from 'lucide-react'
import { DecimalInput } from './DecimalInput'
import { useToast } from './ToastProvider'
import { money } from '../lib/format'
import { supabase } from '../lib/supabase'
import { DateRangeFilter, inDateRange, type DateRange } from './DateRangeFilter'
import { SortableHeader, compareValues, type SortState } from './SortableHeader'

type Supplier = { id: string; name: string }
type Installment = { id?: string; due_date: string; amount: number; locked?: boolean }
type OrderItem = { id: string; budget_item_id: string; snapshot: { description?: string; environment?: string | null } }
type Order = { id: string; display_number: string; client: { name: string } | null; order_items: OrderItem[] }
type Payable = {
  id: string; group_id: string; installment: number; installment_count: number
  description: string; due_date: string | null; amount: number; paid_amount: number
  status: string; payment_method: string | null; purchase_id: string | null
  order_id: string | null; budget_item_id: string | null
  supplier: { id: string; name: string } | null
  purchase: { display_number: string; supplier: { name: string } | null } | null
  order: { display_number: string; client: { name: string } | null } | null
  budget_item: { description: string; environment: string | null } | null
}

const today = () => new Date().toISOString().slice(0, 10)
const formatDate = (value: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : 'Sem vencimento'
const rounded = (value: number) => Math.round((Number(value) || 0) * 100) / 100
const statusLabel: Record<string, string> = { open: 'Em aberto', partial: 'Parcialmente pago', settled: 'Pago', overdue: 'Em atraso', cancelled: 'Cancelado', reversed: 'Estornado' }
const dateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
const matchesPeriod = (dueDate: string | null, period: string | null) => {
  if (!period || period === 'all') return true
  if (!dueDate) return false
  const now = new Date(), current = dateKey(now)
  if (period === 'overdue') return dueDate < current
  if (period === 'today') return dueDate === current
  if (period === 'week') { const end = new Date(now); end.setDate(end.getDate() + 6); return dueDate >= current && dueDate <= dateKey(end) }
  if (period === 'month') { const start = dateKey(new Date(now.getFullYear(), now.getMonth(), 1)), end = dateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)); return dueDate >= start && dueDate <= end }
  return true
}
const itemLabel = (item: { description?: string; environment?: string | null }) => item.environment?.trim() || item.description || 'Item sem descrição'
const createInstallments = (total: number, count: number, firstDue: string): Installment[] => {
  const safeCount = Math.max(1, Math.trunc(count) || 1)
  const commonValue = rounded(total / safeCount)
  return Array.from({ length: safeCount }, (_, index) => {
    const due = new Date(`${firstDue}T12:00:00`)
    due.setMonth(due.getMonth() + index)
    return { due_date: due.toISOString().slice(0, 10), amount: index === safeCount - 1 ? rounded(total - commonValue * (safeCount - 1)) : commonValue }
  })
}

const redistributeInstallments = (total: number, count: number, firstDue: string, preserved: Installment[]): Installment[] => {
  const safeCount = Math.max(preserved.length, Math.trunc(count) || 1)
  const remainingCount = safeCount - preserved.length
  const preservedTotal = rounded(preserved.reduce((sum, installment) => sum + installment.amount, 0))
  const remainingTotal = rounded(total - preservedTotal)
  if (remainingCount === 0) return preserved
  if (remainingTotal < 0) return preserved
  return [...preserved, ...createInstallments(remainingTotal, remainingCount, firstDue)]
}

export function PayablesPanel({ organizationId, period }: { organizationId: string; period: string | null }) {
  const { show } = useToast()
  const [items, setItems] = useState<Payable[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' })
  const [sort, setSort] = useState<SortState<'installment' | 'order' | 'due' | 'amount' | 'status'>>({ key: 'due', direction: 'asc' })
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Payable | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ description: '', supplierId: '', orderId: '', budgetItemId: '', method: 'A combinar', total: 0, count: 1, firstDue: today() })
  const [installments, setInstallments] = useState<Installment[]>([])

  const load = useCallback(async () => {
    if (!supabase) return
    const [payablesResult, suppliersResult, ordersResult] = await Promise.all([
      supabase.from('payables').select('id,group_id,installment,installment_count,description,due_date,amount,paid_amount,status,payment_method,purchase_id,order_id,budget_item_id,supplier:suppliers!payables_supplier_id_fkey(id,name),purchase:purchases!payables_purchase_id_fkey(display_number,supplier:suppliers!purchases_supplier_id_fkey(name)),order:orders!payables_order_id_fkey(display_number,client:clients!orders_client_id_fkey(name)),budget_item:budget_items!payables_budget_item_id_fkey(description,environment)').eq('organization_id', organizationId).order('due_date'),
      supabase.from('suppliers').select('id,name').eq('organization_id', organizationId).eq('active', true).order('name'),
      supabase.from('orders').select('id,display_number,client:clients!orders_client_id_fkey(name),order_items:order_items!order_items_order_id_fkey(id,budget_item_id,snapshot)').eq('organization_id', organizationId).neq('status', 'cancelled').order('number', { ascending: false }),
    ])
    if (payablesResult.error) show('Não foi possível carregar as contas a pagar.', 'error')
    setItems((payablesResult.data ?? []) as unknown as Payable[])
    setSuppliers((suppliersResult.data ?? []) as Supplier[])
    setOrders((ordersResult.data ?? []) as unknown as Order[])
  }, [organizationId, show])

  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => items.filter(item => {
    const term = search.trim().toLowerCase()
    const dueMatchesPeriod = matchesPeriod(item.due_date, period)
    return dueMatchesPeriod && inDateRange(item.due_date, dateRange) && (!term || `${item.description} ${item.supplier?.name ?? ''} ${item.purchase?.supplier?.name ?? ''} ${item.order?.display_number ?? ''} ${item.budget_item?.description ?? ''}`.toLowerCase().includes(term))
  }).sort((a, b) => {
    const values = { installment: [a.installment, b.installment], order: [a.purchase?.display_number ?? a.order?.display_number ?? a.supplier?.name ?? '', b.purchase?.display_number ?? b.order?.display_number ?? b.supplier?.name ?? ''], due: [a.due_date ?? '', b.due_date ?? ''], amount: [Number(a.amount), Number(b.amount)], status: [statusLabel[a.status] ?? a.status, statusLabel[b.status] ?? b.status] }[sort.key]
    return compareValues(values[0], values[1]) * (sort.direction === 'asc' ? 1 : -1)
  }), [items, period, search, dateRange, sort])

  const installmentsTotal = rounded(installments.reduce((sum, item) => sum + item.amount, 0))
  const totalsMatch = installments.length > 0 && installmentsTotal === rounded(form.total)
  const lockedInstallments = installments.filter(installment => installment.locked)
  const lockedTotal = rounded(lockedInstallments.reduce((sum, installment) => sum + installment.amount, 0))
  const updateInstallment = (index: number, patch: Partial<Installment>) => setInstallments(current => current.map((item, itemIndex) => itemIndex === index && !item.locked ? { ...item, ...patch } : item))

  const beginCreate = () => {
    const fresh = { description: '', supplierId: '', orderId: '', budgetItemId: '', method: 'A combinar', total: 0, count: 1, firstDue: today() }
    setForm(fresh)
    setInstallments(createInstallments(fresh.total, fresh.count, fresh.firstDue))
    setEditingGroupId(null)
    setOpen(true)
  }

  const beginEdit = () => {
    if (!selected) return
    const group = items.filter(item => item.group_id === selected.group_id).sort((a, b) => a.installment - b.installment)
    const first = group[0]
    if (!first) return
    setForm({ description: first.description, supplierId: first.supplier?.id ?? '', orderId: first.order_id ?? '', budgetItemId: first.budget_item_id ?? '', method: first.payment_method ?? 'A combinar', total: rounded(group.reduce((sum, item) => sum + Number(item.amount), 0)), count: group.length, firstDue: first.due_date ?? today() })
    setInstallments(group.map(item => {
      const locked = Number(item.paid_amount) > 0 || !['open', 'overdue'].includes(item.status)
      return { id: locked ? item.id : undefined, due_date: item.due_date ?? today(), amount: Number(item.amount), locked }
    }))
    setEditingGroupId(selected.group_id)
    setSelected(null)
    setOpen(true)
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase || saving) return
    if (installments.length !== form.count) { show('Clique em “Redistribuir parcelas” para aplicar a nova quantidade.', 'error'); return }
    if (!totalsMatch) { show('A soma das parcelas deve ser igual ao valor total.', 'error'); return }
    setSaving(true)
    const { error } = editingGroupId
      ? await supabase.rpc('update_manual_payable_group', { org_id: organizationId, target_group_id: editingGroupId, payable_description: form.description, payable_supplier_id: form.supplierId, payable_order_id: form.orderId || null, payable_budget_item_id: form.budgetItemId || null, payable_method: form.method, installments_json: installments })
      : await supabase.rpc('create_manual_payable_group_with_link', { org_id: organizationId, payable_description: form.description, payable_supplier_id: form.supplierId, payable_order_id: form.orderId || null, payable_budget_item_id: form.budgetItemId || null, payable_method: form.method, installments_json: installments })
    setSaving(false)
    if (error) { show('Não foi possível salvar. Confira fornecedor, vencimentos e valores.', 'error'); return }
    show(editingGroupId ? 'Conta e parcelas atualizadas.' : 'Conta e parcelas vinculadas foram criadas.', 'success')
    setOpen(false)
    setEditingGroupId(null)
    await load()
  }

  const removeInstallment = async () => {
    if (!supabase || !selected) return
    const { error } = await supabase.rpc('delete_manual_payable_installment', { org_id: organizationId, target_payable_id: selected.id })
    if (error) { show('Somente parcelas manuais ainda não pagas podem ser excluídas.', 'error'); return }
    show('Parcela excluída definitivamente.', 'success')
    setConfirmingDelete(false)
    setSelected(null)
    await load()
  }

  const canDelete = Boolean(selected && !selected.purchase_id && Number(selected.paid_amount) === 0 && ['open', 'overdue'].includes(selected.status))
  const selectedOrder = orders.find(order => order.id === form.orderId)

  return <>
    <section className="panel">
      <div className="toolbar">
        <label className="search"><Search /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar fornecedor ou lançamento" /></label>
        <DateRangeFilter label="Vencimento" value={dateRange} onChange={setDateRange} />
        <button className="button primary" onClick={beginCreate}><Plus /> Nova conta a pagar</button>
      </div>
      <div className="table-wrap"><table><thead><tr><SortableHeader label="Parcelas" column="installment" sort={sort} onChange={setSort} /><SortableHeader label="Pedido / fornecedor" column="order" sort={sort} onChange={setSort} /><SortableHeader label="Vencimento" column="due" sort={sort} onChange={setSort} /><SortableHeader label="Valor / saldo" column="amount" sort={sort} onChange={setSort} /><SortableHeader label="Status" column="status" sort={sort} onChange={setSort} /></tr></thead><tbody>
        {visible.map(item => <tr className="clickable-row" key={item.id} onClick={() => setSelected(item)}>
          <td><strong>Parcela {item.installment}/{item.installment_count}</strong><small>{item.installment_count > 1 ? `${item.installment_count} parcelas vinculadas` : 'Lançamento único'}</small></td>
          <td>{item.purchase?.display_number ? <><strong>{item.purchase.display_number}</strong><small>{item.purchase.supplier?.name ?? item.supplier?.name ?? 'Fornecedor não informado'}</small></> : item.order?.display_number ? <><strong>{item.order.display_number}{item.budget_item ? ` · ${itemLabel(item.budget_item)}` : ''}</strong><small>{item.supplier?.name ?? 'Fornecedor não informado'}</small></> : <>{item.supplier?.name ?? 'Fornecedor não informado'}</>}</td>
          <td>{formatDate(item.due_date)}</td>
          <td className="payable-value"><strong>{money.format(Number(item.amount))}</strong><small><span>Pago: {money.format(Number(item.paid_amount))}</span><span>Saldo: {money.format(Math.max(0, Number(item.amount) - Number(item.paid_amount)))}</span></small></td>
          <td>{statusLabel[item.status] ?? item.status}</td>
        </tr>)}
        {!visible.length && <tr><td colSpan={5} className="empty">Nenhuma conta a pagar encontrada.</td></tr>}
      </tbody></table></div>
    </section>

    {open && <div className="dialog-backdrop"><form className="dialog manual-payable-dialog" onSubmit={save}>
      <header><div><span className="eyebrow">Contas a pagar</span><h2>{editingGroupId ? 'Editar conta a pagar' : 'Nova conta a pagar'}</h2><p>{editingGroupId ? 'Todas as parcelas vinculadas estão abaixo. Ajuste o que for necessário antes de salvar.' : 'Defina o fornecedor e ajuste o vencimento real de cada parcela antes de salvar.'}</p></div><button type="button" className="icon-button" onClick={() => { setOpen(false); setEditingGroupId(null) }}><X /></button></header>
      <div className="form-grid">
        <label className="field span-2">Descrição<input required value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Ex.: Tecidos para cabeceira" /></label>
        <label className="field span-2">Fornecedor<select required value={form.supplierId} onChange={event => setForm({ ...form, supplierId: event.target.value })}><option value="">Selecione o fornecedor</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
        <label className="field span-2">Vincular a pedido (opcional)<select value={form.orderId} onChange={event => setForm({ ...form, orderId: event.target.value, budgetItemId: '' })}><option value="">Sem vínculo com pedido</option>{orders.map(order => <option key={order.id} value={order.id}>{order.display_number} · {order.client?.name ?? 'Cliente não informado'}</option>)}</select><small>O vínculo permite acompanhar o custo real e o resultado da venda.</small></label>
        {selectedOrder && <label className="field span-2">Item do pedido<select required value={form.budgetItemId} onChange={event => setForm({ ...form, budgetItemId: event.target.value })}><option value="">Selecione o item</option>{selectedOrder.order_items.map(item => <option key={item.id} value={item.budget_item_id}>{itemLabel(item.snapshot)}</option>)}</select></label>}
        <label className="field">Forma de pagamento<input required value={form.method} onChange={event => setForm({ ...form, method: event.target.value })} /></label>
        <label className="field">Valor total<DecimalInput value={form.total} decimalScale={2} onValueChange={value => setForm({ ...form, total: value })} /></label>
        <label className="field">Parcelas<input type="number" min={Math.max(1, lockedInstallments.length)} step="1" value={form.count} onChange={event => setForm({ ...form, count: Math.max(Math.max(1, lockedInstallments.length), Number(event.target.value) || 1) })} /></label>
        <label className="field">Primeiro vencimento<input type="date" value={form.firstDue} onChange={event => setForm({ ...form, firstDue: event.target.value })} /></label>
        <button type="button" className="button secondary span-2" onClick={() => {
          if (form.total < lockedTotal) { show('O valor total não pode ser menor que as parcelas já pagas.', 'error'); return }
          setInstallments(redistributeInstallments(form.total, form.count, form.firstDue, lockedInstallments))
        }}>Redistribuir parcelas</button>
        <div className="manual-installments span-2">
          <div className="manual-installments-head" aria-hidden="true"><span>Parcela</span><span>Vencimento</span><span>Valor</span></div>
          {installments.map((installment, index) => <div key={index}>
            <b>{index + 1}/{installments.length}{installment.locked ? ' · pago' : ''}</b>
            <input aria-label={`Vencimento parcela ${index + 1}`} type="date" disabled={installment.locked} value={installment.due_date} onChange={event => updateInstallment(index, { due_date: event.target.value })} />
            <DecimalInput value={installment.amount} decimalScale={2} disabled={installment.locked} onValueChange={value => updateInstallment(index, { amount: value })} />
          </div>)}
          <div className="installments-total"><span>Total das parcelas</span><strong>{money.format(installmentsTotal)}</strong>{!totalsMatch && <small>Precisa somar {money.format(rounded(form.total))}.</small>}</div>
        </div>
      </div>
      <footer><button type="button" className="button secondary" onClick={() => { setOpen(false); setEditingGroupId(null) }}>Cancelar</button><button className="button primary" disabled={saving || form.total <= 0 || !totalsMatch}>{saving ? 'Salvando...' : editingGroupId ? 'Salvar alterações' : 'Salvar conta e parcelas'}</button></footer>
    </form></div>}

    {selected && <div className="dialog-backdrop"><div className="dialog"><header><div><span className="eyebrow">Parcela {selected.installment}/{selected.installment_count}</span><h2>{selected.description}</h2><p>{selected.supplier?.name ?? selected.purchase?.supplier?.name ?? 'Fornecedor não informado'} · Vencimento: {formatDate(selected.due_date)} · {money.format(Number(selected.amount))}{selected.order ? ` · ${selected.order.display_number}${selected.budget_item ? ` · ${itemLabel(selected.budget_item)}` : ''}` : ''}</p></div><button className="icon-button" onClick={() => { setConfirmingDelete(false); setSelected(null) }}><X /></button></header>{confirmingDelete && <div className="inline-confirm"><div><strong>Excluir esta parcela definitivamente?</strong><span>Ela será removida do grupo; as demais serão renumeradas.</span></div><button className="button danger" onClick={() => void removeInstallment()}>Confirmar exclusão</button></div>}<footer><button className="button primary" disabled={selected.status === 'cancelled'} onClick={beginEdit}>Editar conta e parcelas</button>{canDelete && !confirmingDelete && <button className="button danger" onClick={() => setConfirmingDelete(true)}><Trash2 /> Excluir parcela</button>}<button className="button secondary" onClick={() => { setConfirmingDelete(false); setSelected(null) }}>Fechar</button></footer></div></div>}
  </>
}
