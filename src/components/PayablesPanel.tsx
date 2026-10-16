import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, Search, Trash2, X } from 'lucide-react'
import { DecimalInput } from './DecimalInput'
import { PayableAllocationEditor } from './PayableAllocationEditor'
import { allocationError, type PayableAllocation } from '../lib/payableAllocation'
import { PayableAttachments, payableFileError, uploadPayableFiles } from './PayableAttachments'
import { adjustPayableAmount, payableItemLabel } from '../lib/payableEditor'
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
const itemLabel = payableItemLabel
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
  const [allocations,setAllocations]=useState<PayableAllocation[]>([])
  const [savedAllocations,setSavedAllocations]=useState<(PayableAllocation & {group_id:string})[]>([])
  const [pendingFiles,setPendingFiles]=useState<File[]>([])
  const [rateioReady,setRateioReady]=useState(false)
  const [paymentAction,setPaymentAction]=useState<'pay'|'reverse'|null>(null)
  const [paymentAmount,setPaymentAmount]=useState(0)
  const [paymentDate,setPaymentDate]=useState(today())
  const [paymentReason,setPaymentReason]=useState('')

  const load = useCallback(async () => {
    if (!supabase) return
    const [payablesResult, suppliersResult, ordersResult, allocationsResult] = await Promise.all([
      supabase.from('payables').select('id,group_id,installment,installment_count,description,due_date,amount,paid_amount,status,payment_method,purchase_id,order_id,budget_item_id,supplier:suppliers!payables_supplier_id_fkey(id,name),purchase:purchases!payables_purchase_id_fkey(display_number,supplier:suppliers!purchases_supplier_id_fkey(name)),order:orders!payables_order_id_fkey(display_number,client:clients!orders_client_id_fkey(name)),budget_item:budget_items!payables_budget_item_id_fkey(description,environment)').eq('organization_id', organizationId).order('due_date'),
      supabase.from('suppliers').select('id,name').eq('organization_id', organizationId).eq('active', true).order('name'),
      supabase.from('orders').select('id,display_number,client:clients!orders_client_id_fkey(name),order_items:order_items!order_items_order_id_fkey(id,budget_item_id,snapshot)').eq('organization_id', organizationId).neq('status', 'cancelled').order('number', { ascending: false }),
      supabase.from('payable_allocations').select('group_id,order_id,budget_item_id,amount').eq('organization_id', organizationId),
    ])
    if (payablesResult.error) show('Não foi possível carregar as contas a pagar.', 'error')
    setItems((payablesResult.data ?? []) as unknown as Payable[])
    setSuppliers((suppliersResult.data ?? []) as Supplier[])
    setOrders((ordersResult.data ?? []) as unknown as Order[])
    if (allocationsResult.error) show('Não foi possível carregar o rateio. Atualize a página antes de editar contas.', 'error')
    setRateioReady(!allocationsResult.error)
    setSavedAllocations((allocationsResult.data ?? []) as unknown as (PayableAllocation & {group_id:string})[])
  }, [organizationId, show])

  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => items.filter(item => {
    const term = search.trim().toLowerCase()
    const dueMatchesPeriod = matchesPeriod(item.due_date, period)
    const linkedText=savedAllocations.filter(row=>row.group_id===item.group_id).map(row=>{const order=orders.find(order=>order.id===row.order_id);return `${order?.display_number??''} ${order?.client?.name??''}`}).join(' ')
    return dueMatchesPeriod && inDateRange(item.due_date, dateRange) && (!term || `${linkedText} ${item.description} ${item.supplier?.name ?? ''} ${item.purchase?.supplier?.name ?? ''} ${item.order?.display_number ?? ''} ${item.budget_item?.description ?? ''}`.toLowerCase().includes(term))
  }).sort((a, b) => {
    const values = { installment: [a.installment, b.installment], order: [a.purchase?.display_number ?? a.order?.display_number ?? a.supplier?.name ?? '', b.purchase?.display_number ?? b.order?.display_number ?? b.supplier?.name ?? ''], due: [a.due_date ?? '', b.due_date ?? ''], amount: [Number(a.amount), Number(b.amount)], status: [statusLabel[a.status] ?? a.status, statusLabel[b.status] ?? b.status] }[sort.key]
    return compareValues(values[0], values[1]) * (sort.direction === 'asc' ? 1 : -1)
  }), [items, period, search, dateRange, sort, savedAllocations, orders])

  const installmentsTotal = rounded(installments.reduce((sum, item) => sum + item.amount, 0))
  const totalsMatch = installments.length > 0 && installmentsTotal === rounded(form.total)
  const lockedInstallments = installments.filter(installment => installment.locked)
  const lockedTotal = rounded(lockedInstallments.reduce((sum, installment) => sum + installment.amount, 0))
  const updateInstallment = (index: number, patch: Partial<Installment>) => setInstallments(current => patch.amount!==undefined?adjustPayableAmount(current,form.total,index,patch.amount):current.map((item, itemIndex) => itemIndex === index && !item.locked ? { ...item, ...patch } : item))

  const beginCreate = () => {
    const fresh = { description: '', supplierId: '', orderId: '', budgetItemId: '', method: 'A combinar', total: 0, count: 1, firstDue: today() }
    setForm(fresh)
    setAllocations([])
    setPendingFiles([])
    setInstallments(createInstallments(fresh.total, fresh.count, fresh.firstDue))
    setEditingGroupId(null)
    setOpen(true)
  }

  const beginEdit = () => {
    if (!selected || !rateioReady) return
    const group = items.filter(item => item.group_id === selected.group_id).sort((a, b) => a.installment - b.installment)
    const first = group[0]
    if (!first) return
    const linked=orders.find(order=>order.id===first.order_id)
    const saved = savedAllocations.filter(row=>row.group_id===first.group_id)
    setAllocations(saved.length?saved.map(row=>({...row,budget_item_id:row.budget_item_id??'',amount:Number(row.amount),search:orders.find(order=>order.id===row.order_id)?.display_number??row.order_id})):linked?[{order_id:linked.id,budget_item_id:first.budget_item_id??'',amount:rounded(group.reduce((sum,item)=>sum+Number(item.amount),0)),search:`${linked.display_number} · ${linked.client?.name??''}`}]:[])
    setPendingFiles([])
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
    if (!supabase || saving || !rateioReady) return
    const rateioError=allocationError(allocations,form.total)
    if(rateioError){show(rateioError,'error');return}
    if (installments.length !== form.count) { show('Clique em “Redistribuir parcelas” para aplicar a nova quantidade.', 'error'); return }
    if (!totalsMatch) { show('A soma das parcelas deve ser igual ao valor total.', 'error'); return }
    setSaving(true)
    const { data:groupId,error } = await supabase.rpc('save_allocated_payable_group', {org_id:organizationId,target_group_id:editingGroupId,payable_description:form.description,payable_supplier_id:form.supplierId,payable_method:form.method,installments_json:installments,allocations_json:allocations.map(row=>({order_id:row.order_id,budget_item_id:row.budget_item_id||null,amount:row.amount}))})
    if (error) { setSaving(false);show(error.code==='42501'?'Seu perfil não pode editar contas a pagar.':'Não foi possível salvar. Confira fornecedor, rateio, vencimentos e valores.', 'error'); return }
    const failed=await uploadPayableFiles(organizationId,String(groupId),pendingFiles)
    setSaving(false)
    if(failed.length){setPendingFiles(pendingFiles.filter(file=>failed.includes(file.name)));setEditingGroupId(String(groupId));await load();show('A conta foi salva, mas alguns anexos falharam. Tente enviá-los novamente.','error');return}
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
  const beginPaymentAction=(item:Payable,action:'pay'|'reverse')=>{
    setSelected(item);setPaymentAction(action);setPaymentAmount(rounded(Number(item.amount)-Number(item.paid_amount)));setPaymentDate(today());setPaymentReason('')
  }
  const savePaymentAction=async(event:FormEvent)=>{
    event.preventDefault()
    if(!supabase||!selected||!paymentAction||saving)return
    if(paymentAction==='pay'&&(paymentAmount<=0||paymentAmount>rounded(Number(selected.amount)-Number(selected.paid_amount)))){show('Informe um valor maior que zero e dentro do saldo da parcela.','error');return}
    if(paymentAction==='reverse'&&paymentReason.trim().length<5)return
    setSaving(true)
    const {error}=paymentAction==='pay'
      ?await supabase.rpc('register_payable_payment',{org_id:organizationId,target_payable_id:selected.id,payment_scope:'single',payment_amount:paymentAmount,payment_date:paymentDate})
      :await supabase.rpc('reverse_payable_payment',{org_id:organizationId,target_payable_id:selected.id,reversal_scope:'single',reversal_reason:paymentReason})
    setSaving(false)
    if(error){show(error.code==='42501'?'Seu perfil não tem permissão para registrar pagamentos.':'Não foi possível atualizar o pagamento. Confira os dados e tente novamente.','error');return}
    show(paymentAction==='pay'?'Pagamento registrado.':'Pagamento estornado e saldo reaberto.','success');setPaymentAction(null);setSelected(null);await load()
  }
  const allocationRows=(groupId:string)=>savedAllocations.filter(row=>row.group_id===groupId)
  const renderAllocation=(row:PayableAllocation,index:number)=>{const order=orders.find(item=>item.id===row.order_id);const item=order?.order_items.find(item=>item.budget_item_id===row.budget_item_id);return <span key={row.order_id||index} style={{display:'block',marginBottom:8}}><strong>{order?.display_number??row.order_id}</strong><span className="table-subline">{order?.client?.name}</span>{item&&<span className="table-subline">{itemLabel(item.snapshot)}</span>}<span className="table-subline">Rateio da conta: {money.format(Number(row.amount))}</span></span>}

  return <>
    <section className="panel">
      <div className="toolbar">
        <label className="search"><Search /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar fornecedor ou lançamento" /></label>
        <DateRangeFilter label="Vencimento" value={dateRange} onChange={setDateRange} />
        <button className="button primary" onClick={beginCreate}><Plus /> Nova conta a pagar</button>
      </div>
      <div className="table-wrap"><table><thead><tr><SortableHeader label="Parcelas" column="installment" sort={sort} onChange={setSort} /><SortableHeader label="Pedido / fornecedor" column="order" sort={sort} onChange={setSort} /><SortableHeader label="Vencimento" column="due" sort={sort} onChange={setSort} /><SortableHeader label="Valor / saldo" column="amount" sort={sort} onChange={setSort} /><SortableHeader label="Status" column="status" sort={sort} onChange={setSort} /></tr></thead><tbody>
        {visible.map(item => <tr className="clickable-row" key={item.id} onClick={() => setSelected(item)}>
          <td><strong>Parcela {item.installment}/{item.installment_count}</strong><small className="table-subline">{item.installment_count > 1 ? `${item.installment_count} parcelas vinculadas` : 'Lançamento único'}</small></td>
          <td style={{whiteSpace:'normal',minWidth:240,maxWidth:520}}>{allocationRows(item.group_id).length?allocationRows(item.group_id).map(renderAllocation):<><strong style={{display:'block'}}>{item.order?.display_number ?? item.purchase?.display_number ?? 'Sem pedido vinculado'}</strong>{item.order?.client?.name&&<span className="table-subline">{item.order.client.name}</span>}{item.budget_item&&<span className="table-subline">{itemLabel(item.budget_item)}</span>}</>}<small className="table-subline">Fornecedor: {item.supplier?.name ?? item.purchase?.supplier?.name ?? 'Não informado'}</small></td>
          <td>{formatDate(item.due_date)}</td>
          <td className="payable-value"><strong>{money.format(Number(item.amount))}</strong><small><span>Pago: {money.format(Number(item.paid_amount))}</span><span>Saldo: {money.format(Math.max(0, Number(item.amount) - Number(item.paid_amount)))}</span></small></td>
          <td><select className="status-select" aria-label={`Status parcela ${item.installment} de ${item.description}`} value={item.status} onClick={event=>event.stopPropagation()} onChange={event=>{if(event.target.value==='pay')beginPaymentAction(item,'pay');if(event.target.value==='reverse')beginPaymentAction(item,'reverse')}}><option value={item.status}>{statusLabel[item.status]??item.status}</option>{['open','overdue','partial'].includes(item.status)&&<option value="pay">Registrar pagamento…</option>}{Number(item.paid_amount)>0&&['partial','settled'].includes(item.status)&&<option value="reverse">Estornar / reabrir…</option>}</select></td>
        </tr>)}
        {!visible.length && <tr><td colSpan={5} className="empty">Nenhuma conta a pagar encontrada.</td></tr>}
      </tbody></table></div>
    </section>

    {open && <div className="dialog-backdrop"><form className="dialog manual-payable-dialog" onSubmit={save}>
      <header><div><span className="eyebrow">Contas a pagar</span><h2>{editingGroupId ? 'Editar conta a pagar' : 'Nova conta a pagar'}</h2><p>{editingGroupId ? 'Todas as parcelas vinculadas estão abaixo. Ajuste o que for necessário antes de salvar.' : 'Defina o fornecedor e ajuste o vencimento real de cada parcela antes de salvar.'}</p></div><button type="button" className="icon-button" onClick={() => { setOpen(false); setEditingGroupId(null) }}><X /></button></header>
      <div className="form-grid">
        <label className="field span-2">Descrição<input required value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Ex.: Tecidos para cabeceira" /></label>
        <label className="field span-2">Fornecedor<select required value={form.supplierId} onChange={event => setForm({ ...form, supplierId: event.target.value })}><option value="">Selecione o fornecedor</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
        <PayableAllocationEditor rows={allocations} orders={orders} total={form.total} onChange={setAllocations}/>
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
            <DecimalInput ariaLabel={`Valor parcela ${index+1}`} value={installment.amount} decimalScale={2} disabled={installment.locked} onValueChange={value => updateInstallment(index, { amount: value })} />
          </div>)}
          <div className="installments-total"><span>Total das parcelas</span><strong>{money.format(installmentsTotal)}</strong>{!totalsMatch && <small>Precisa somar {money.format(rounded(form.total))}.</small>}</div>
        </div>
        <small className="span-2">Ao alterar um valor, o saldo é dividido entre as outras parcelas abertas. Parcelas com pagamento registrado permanecem inalteradas.</small>
        <label className="field span-2">Anexar arquivos (PDF ou imagens, até 20 MB cada)<input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" disabled={saving} onChange={event=>{const files=Array.from(event.target.files??[]);const invalid=files.map(payableFileError).find(Boolean);if(invalid){show(invalid,'error');event.target.value='';return}setPendingFiles(files)}}/>{pendingFiles.map((file,index)=><small key={index}>{file.name}</small>)}</label>
        {editingGroupId&&<div className="span-2"><PayableAttachments organizationId={organizationId} groupId={editingGroupId}/></div>}
      </div>
      <footer><button type="button" className="button secondary" onClick={() => { setOpen(false); setEditingGroupId(null) }}>Cancelar</button><button className="button primary" disabled={saving || form.total <= 0 || !totalsMatch}>{saving ? 'Salvando...' : editingGroupId ? 'Salvar alterações' : 'Salvar conta e parcelas'}</button></footer>
    </form></div>}

    {selected && <div className="dialog-backdrop"><div className="dialog"><header><div><span className="eyebrow">Parcela {selected.installment}/{selected.installment_count}</span><h2>{selected.description}</h2><p>{selected.supplier?.name ?? selected.purchase?.supplier?.name ?? 'Fornecedor não informado'} · Vencimento: {formatDate(selected.due_date)} · {money.format(Number(selected.amount))}</p></div><button className="icon-button" onClick={() => { setConfirmingDelete(false); setSelected(null) }}><X /></button></header><div className="form-grid"><div className="span-2">{allocationRows(selected.group_id).map(renderAllocation)}</div></div><PayableAttachments organizationId={organizationId} groupId={selected.group_id}/>{confirmingDelete && <div className="inline-confirm"><div><strong>Excluir esta parcela definitivamente?</strong><span>Ela será removida do grupo; as demais serão renumeradas.</span></div><button className="button danger" onClick={() => void removeInstallment()}>Confirmar exclusão</button></div>}<footer><button className="button primary" disabled={selected.status === 'cancelled'||!rateioReady} onClick={beginEdit}>Editar conta e parcelas</button>{canDelete && !allocationRows(selected.group_id).length && !confirmingDelete && <button className="button danger" onClick={() => setConfirmingDelete(true)}><Trash2 /> Excluir parcela</button>}<button className="button secondary" onClick={() => { setConfirmingDelete(false); setSelected(null) }}>Fechar</button></footer></div></div>}
    {selected&&paymentAction&&<div className="dialog-backdrop"><form className="dialog" role="dialog" aria-modal="true" aria-label={paymentAction==='pay'?'Registrar pagamento':'Estornar pagamento'} onSubmit={savePaymentAction}>
      <header><div><span className="eyebrow">Parcela {selected.installment}/{selected.installment_count}</span><h2>{paymentAction==='pay'?'Registrar pagamento':'Estornar pagamento'}</h2><p>{selected.description} · {selected.supplier?.name??selected.purchase?.supplier?.name}</p></div><button type="button" className="icon-button" aria-label="Fechar pagamento" disabled={saving} onClick={()=>setPaymentAction(null)}><X/></button></header>
      <div className="form-grid">{paymentAction==='pay'?<><p className="span-2">Saldo: {money.format(rounded(Number(selected.amount)-Number(selected.paid_amount)))}. Um valor menor registra pagamento parcial; o saldo integral marca como Pago.</p><label className="field">Data do pagamento<input required type="date" value={paymentDate} onChange={event=>setPaymentDate(event.target.value)}/></label><label className="field">Valor pago<DecimalInput ariaLabel="Valor pago" value={paymentAmount} decimalScale={2} onValueChange={setPaymentAmount}/></label></>:<label className="field span-2">Motivo do estorno<textarea required minLength={5} value={paymentReason} onChange={event=>setPaymentReason(event.target.value)}/><small>Remove a baixa registrada nesta parcela e reabre o saldo, mantendo o histórico.</small></label>}</div>
      <footer><button type="button" className="button secondary" disabled={saving} onClick={()=>setPaymentAction(null)}>Voltar</button><button className="button primary" disabled={saving}>{saving?'Salvando…':paymentAction==='pay'?'Confirmar pagamento':'Confirmar estorno'}</button></footer>
    </form></div>}
  </>
}

