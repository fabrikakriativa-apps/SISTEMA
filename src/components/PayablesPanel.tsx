import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, Search, Trash2, X } from 'lucide-react'
import { DecimalInput } from './DecimalInput'
import { useToast } from './ToastProvider'
import { money } from '../lib/format'
import { supabase } from '../lib/supabase'

type Supplier = { id: string; name: string }
type Installment = { due_date: string; amount: number }
type Payable = {
  id: string; group_id: string; installment: number; installment_count: number
  description: string; due_date: string | null; amount: number; paid_amount: number
  status: string; payment_method: string | null; purchase_id: string | null
  order_id: string | null; budget_item_id: string | null
  supplier: { name: string } | null
  purchase: { display_number: string; supplier: { name: string } | null } | null
}

const today = () => new Date().toISOString().slice(0, 10)
const formatDate = (value: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : 'Sem vencimento'
const rounded = (value: number) => Math.round((Number(value) || 0) * 100) / 100
const createInstallments = (total: number, count: number, firstDue: string): Installment[] => {
  const safeCount = Math.max(1, Math.trunc(count) || 1)
  const commonValue = rounded(total / safeCount)
  return Array.from({ length: safeCount }, (_, index) => {
    const due = new Date(`${firstDue}T12:00:00`)
    due.setMonth(due.getMonth() + index)
    return { due_date: due.toISOString().slice(0, 10), amount: index === safeCount - 1 ? rounded(total - commonValue * (safeCount - 1)) : commonValue }
  })
}

export function PayablesPanel({ organizationId, period }: { organizationId: string; period: string | null }) {
  const { show } = useToast()
  const [items, setItems] = useState<Payable[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Payable | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ description: '', supplierId: '', method: 'A combinar', total: 0, count: 1, firstDue: today() })
  const [installments, setInstallments] = useState<Installment[]>([])

  const load = useCallback(async () => {
    if (!supabase) return
    const [payablesResult, suppliersResult] = await Promise.all([
      supabase.from('payables').select('id,group_id,installment,installment_count,description,due_date,amount,paid_amount,status,payment_method,purchase_id,order_id,budget_item_id,supplier:suppliers!payables_supplier_id_fkey(name),purchase:purchases!payables_purchase_id_fkey(display_number,supplier:suppliers!purchases_supplier_id_fkey(name))').eq('organization_id', organizationId).order('due_date'),
      supabase.from('suppliers').select('id,name').eq('organization_id', organizationId).eq('active', true).order('name'),
    ])
    if (payablesResult.error) show('Não foi possível carregar as contas a pagar.', 'error')
    setItems((payablesResult.data ?? []) as unknown as Payable[])
    setSuppliers((suppliersResult.data ?? []) as Supplier[])
  }, [organizationId, show])

  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => items.filter(item => {
    const term = search.trim().toLowerCase()
    const dueMatchesPeriod = !period || (item.due_date?.startsWith(period) ?? false)
    return dueMatchesPeriod && (!term || `${item.description} ${item.supplier?.name ?? ''} ${item.purchase?.supplier?.name ?? ''}`.toLowerCase().includes(term))
  }), [items, period, search])

  const installmentsTotal = rounded(installments.reduce((sum, item) => sum + item.amount, 0))
  const totalsMatch = installments.length > 0 && installmentsTotal === rounded(form.total)
  const updateInstallment = (index: number, patch: Partial<Installment>) => setInstallments(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))

  const beginCreate = () => {
    const fresh = { description: '', supplierId: '', method: 'A combinar', total: 0, count: 1, firstDue: today() }
    setForm(fresh)
    setInstallments(createInstallments(fresh.total, fresh.count, fresh.firstDue))
    setOpen(true)
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase || saving) return
    if (!totalsMatch) { show('A soma das parcelas deve ser igual ao valor total.', 'error'); return }
    setSaving(true)
    const { error } = await supabase.rpc('create_manual_payable_group', {
      org_id: organizationId, payable_description: form.description, payable_supplier_id: form.supplierId,
      payable_method: form.method, installments_json: installments,
    })
    setSaving(false)
    if (error) { show('Não foi possível salvar. Confira fornecedor, vencimentos e valores.', 'error'); return }
    show('Conta e parcelas vinculadas foram criadas.', 'success')
    setOpen(false)
    await load()
  }

  const cancel = async () => {
    if (!supabase || !selected) return
    const { error } = await supabase.rpc('cancel_manual_payable', { org_id: organizationId, target_payable_id: selected.id })
    if (error) { show('Somente lançamentos manuais ainda não pagos podem ser excluídos.', 'error'); return }
    show('Lançamento excluído com segurança.', 'success')
    setSelected(null)
    await load()
  }

  const canCancel = Boolean(selected && !selected.purchase_id && !selected.order_id && !selected.budget_item_id && Number(selected.paid_amount) === 0 && ['open', 'overdue'].includes(selected.status))

  return <>
    <section className="panel">
      <div className="toolbar">
        <label className="search"><Search /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar fornecedor ou lançamento" /></label>
        <button className="button primary" onClick={beginCreate}><Plus /> Nova conta a pagar</button>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Parcela / grupo</th><th>Compra / fornecedor</th><th>Vencimento</th><th>Valor / pago</th><th>Status</th></tr></thead><tbody>
        {visible.map(item => <tr className="clickable-row" key={item.id} onClick={() => setSelected(item)}>
          <td><strong>Parcela {item.installment}/{item.installment_count}</strong><small>{item.group_id ? `Grupo ${item.group_id.slice(0, 8)}` : 'Sem grupo'}</small></td>
          <td>{item.purchase?.display_number ? <><strong>{item.purchase.display_number}</strong><small>{item.purchase.supplier?.name ?? item.supplier?.name ?? 'Fornecedor não informado'}</small></> : <>{item.supplier?.name ?? 'Fornecedor não informado'}</>}</td>
          <td>{formatDate(item.due_date)}</td>
          <td><strong>{money.format(Number(item.amount))}</strong><small>Pago: {money.format(Number(item.paid_amount))}</small></td>
          <td>{item.status}</td>
        </tr>)}
        {!visible.length && <tr><td colSpan={5} className="empty">Nenhuma conta a pagar encontrada.</td></tr>}
      </tbody></table></div>
    </section>

    {open && <div className="dialog-backdrop"><form className="dialog manual-payable-dialog" onSubmit={save}>
      <header><div><span className="eyebrow">Contas a pagar</span><h2>Nova conta a pagar</h2><p>Defina o fornecedor e ajuste o vencimento real de cada parcela antes de salvar.</p></div><button type="button" className="icon-button" onClick={() => setOpen(false)}><X /></button></header>
      <div className="form-grid">
        <label className="field span-2">Descrição<input required value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Ex.: Tecidos para cabeceira" /></label>
        <label className="field span-2">Fornecedor<select required value={form.supplierId} onChange={event => setForm({ ...form, supplierId: event.target.value })}><option value="">Selecione o fornecedor</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
        <label className="field">Forma de pagamento<input required value={form.method} onChange={event => setForm({ ...form, method: event.target.value })} /></label>
        <label className="field">Valor total<DecimalInput value={form.total} decimalScale={2} onValueChange={value => setForm({ ...form, total: value })} /></label>
        <label className="field">Parcelas<input type="number" min="1" step="1" value={form.count} onChange={event => setForm({ ...form, count: Math.max(1, Number(event.target.value) || 1) })} /></label>
        <label className="field">Primeiro vencimento<input type="date" value={form.firstDue} onChange={event => setForm({ ...form, firstDue: event.target.value })} /></label>
        <button type="button" className="button secondary span-2" onClick={() => setInstallments(createInstallments(form.total, form.count, form.firstDue))}>Gerar parcelas</button>
        <div className="manual-installments span-2">
          {installments.map((installment, index) => <div key={index}>
            <b>{index + 1}/{installments.length}</b>
            <input aria-label={`Vencimento parcela ${index + 1}`} type="date" value={installment.due_date} onChange={event => updateInstallment(index, { due_date: event.target.value })} />
            <DecimalInput value={installment.amount} decimalScale={2} onValueChange={value => updateInstallment(index, { amount: value })} />
          </div>)}
          <div className="installments-total"><span>Total das parcelas</span><strong>{money.format(installmentsTotal)}</strong>{!totalsMatch && <small>Precisa somar {money.format(rounded(form.total))}.</small>}</div>
        </div>
      </div>
      <footer><button type="button" className="button secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="button primary" disabled={saving || form.total <= 0 || !totalsMatch}>{saving ? 'Salvando...' : 'Salvar conta e parcelas'}</button></footer>
    </form></div>}

    {selected && <div className="dialog-backdrop"><div className="dialog"><header><div><span className="eyebrow">Parcela {selected.installment}/{selected.installment_count}</span><h2>{selected.description}</h2><p>{selected.supplier?.name ?? selected.purchase?.supplier?.name ?? 'Fornecedor não informado'} · Vencimento: {formatDate(selected.due_date)} · {money.format(Number(selected.amount))}</p></div><button className="icon-button" onClick={() => setSelected(null)}><X /></button></header><footer>{canCancel && <button className="button danger" onClick={() => void cancel()}><Trash2 /> Excluir lançamento</button>}<button className="button secondary" onClick={() => setSelected(null)}>Fechar</button></footer></div></div>}
  </>
}
