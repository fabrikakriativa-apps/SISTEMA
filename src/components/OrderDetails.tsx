import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ClipboardList, Eye, GitBranch, PackagePlus, X } from 'lucide-react'
import { useToast } from './ToastProvider'
import { supabase } from '../lib/supabase'
import { money } from '../lib/format'
import { OrderPreview } from './OrderPreview'
import {SortableHeader,compareValues,type SortState} from './SortableHeader'
import {orderStatusLabels,type OrderStatus} from '../lib/orderStatus'

export type DetailOrder = {
  id:string; display_number:string; status:string; payment_terms:string|null; promised_date:string|null; client_address:string|null; notes:string|null; total:number; created_at:string
  client:{name:string; address:string|null; city:string|null}|null; budget:{id:string;display_number:string}|null
  order_items:{id:string; status:string; snapshot:{environment?:string|null; description?:string; quantity?:number; sale_total?:number}}[]
  receivables:{id:string; installment:number; installment_count:number; due_date:string|null; amount:number; payment_method:string|null; status:string}[]
}
const today = () => new Date().toISOString().slice(0,10)
const date = (value:string|null) => value ? new Date(`${value.slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR') : 'A confirmar'

export function OrderDetails({organizationId,order,onBack,onReviewBudget,onSaved}:{organizationId:string;order:DetailOrder;onBack:()=>void;onReviewBudget:()=>void;onSaved:()=>Promise<void>}) {
  const {show} = useToast()
  const [address,setAddress] = useState(order.client_address || [order.client?.address,order.client?.city].filter(Boolean).join(' · '))
  const [promisedDate,setPromisedDate] = useState(order.promised_date ?? '')
  const [notes,setNotes] = useState(order.notes ?? '')
  const [deliverySaving,setDeliverySaving] = useState(false),[notesSaving,setNotesSaving] = useState(false)
  const [method,setMethod] = useState('PIX'),[installments,setInstallments] = useState(1),[firstDue,setFirstDue] = useState(today()),[financeSaving,setFinanceSaving] = useState(false),[preview,setPreview] = useState(false),[actionsOpen,setActionsOpen] = useState(false),[revisionSaving,setRevisionSaving] = useState(false)
  const [itemSort,setItemSort]=useState<SortState<'item'|'quantity'|'value'|'operation'>>({key:'item',direction:'asc'})
  useEffect(() => {
    setAddress(order.client_address || [order.client?.address,order.client?.city].filter(Boolean).join(' · '))
    setPromisedDate(order.promised_date ?? '')
    setNotes(order.notes ?? '')
  },[order.id,order.client_address,order.promised_date,order.notes,order.client?.address,order.client?.city])
  const amount = Number(order.total)/Math.max(1,installments)
  const receivables = useMemo(() => order.receivables.filter(item => item.status !== 'cancelled').sort((a,b) => a.installment-b.installment),[order.receivables])
  const sortedItems=useMemo(()=>[...order.order_items].sort((a,b)=>{const values={item:[`${a.snapshot.environment??''} ${a.snapshot.description??''}`,`${b.snapshot.environment??''} ${b.snapshot.description??''}`],quantity:[Number(a.snapshot.quantity??0),Number(b.snapshot.quantity??0)],value:[Number(a.snapshot.sale_total??0),Number(b.snapshot.sale_total??0)],operation:[a.status,b.status]}[itemSort.key];return compareValues(values[0],values[1])*(itemSort.direction==='asc'?1:-1)}),[order.order_items,itemSort])
  const saveDelivery = async () => {
    if(!supabase || !promisedDate || deliverySaving) return
    setDeliverySaving(true)
    const {error} = await supabase.rpc('set_order_delivery_details',{org_id:organizationId,target_order_id:order.id,new_client_address:address.trim(),new_promised_date:promisedDate})
    if(error) show('Não foi possível salvar os dados de entrega.','error')
    else { await onSaved(); show('Dados de entrega atualizados.','success') }
    setDeliverySaving(false)
  }
  const saveNotes = async () => {
    if(!supabase || notesSaving) return
    setNotesSaving(true)
    const {error} = await supabase.rpc('set_order_general_notes',{org_id:organizationId,target_order_id:order.id,new_notes:notes.trim()})
    if(error) show('Não foi possível salvar as observações do pedido.','error')
    else { await onSaved(); show('Observações do pedido atualizadas.','success') }
    setNotesSaving(false)
  }
  const configureReceivables = async () => {
    if(!supabase || financeSaving) return
    setFinanceSaving(true)
    const {error} = await supabase.rpc('configure_order_receivables',{org_id:organizationId,target_order_id:order.id,installment_count:installments,first_due_date:firstDue,payment_method:method})
    if(error) show(error.code === '23514' ? 'Este pedido já possui recebimento configurado ou os dados são inválidos.' : 'Não foi possível gerar as parcelas.','error')
    else { await onSaved(); show('Contas a receber geradas e itens liberados para Compras.','success') }
    setFinanceSaving(false)
  }
  const startRevision = async () => {
    if(!supabase || !order.budget?.id || revisionSaving) return
    setRevisionSaving(true)
    const {error} = await supabase.rpc('start_budget_revision_after_order_cancellation',{org_id:organizationId,target_budget_id:order.budget.id})
    if(error) show('Não foi possível iniciar a revisão. Confirme se este pedido está cancelado.','error')
    else { show('Revisão criada. Agora informe ou ajuste os insumos em cada item antes de reenviar.','success'); setActionsOpen(false); onReviewBudget() }
    setRevisionSaving(false)
  }
  return <>
    <section className="order-detail-header">
<div>
<h1>{order.display_number}</h1>
<p>{order.client?.name ?? 'Cliente não informado'} · criado em {date(order.created_at)}</p>
</div>
<div>
<button className="button secondary" onClick={() => setActionsOpen(true)}>
<ClipboardList/>Ações</button>
<button className="button secondary" onClick={onBack}>
<ArrowLeft/>Voltar aos pedidos</button>
</div>
</section>
    {preview && <OrderPreview order={order} onClose={() => setPreview(false)}/>}
    {actionsOpen&&<div className="dialog-backdrop">
<section className="dialog order-actions-dialog" role="dialog" aria-modal="true" aria-labelledby="order-actions-title">
<header>
<div>
<span className="eyebrow">Pedido</span>
<h2 id="order-actions-title">Ações do pedido</h2>
<p>Documentos, revisão comercial e insumos ficam organizados aqui.</p>
</div>
<button type="button" className="icon-button" aria-label="Fechar" onClick={()=>setActionsOpen(false)}>
<X/>
</button>
</header>
<div className="order-actions-content">
<button type="button" className="order-action" onClick={()=>{setActionsOpen(false);setPreview(true)}}>
<Eye/>
<span>
<strong>Versão do cliente</strong>
<small>Visualize o documento que será apresentado ao cliente.</small>
</span>
</button>{order.status==='cancelled'&&order.budget?.id?<button type="button" className="order-action" disabled={revisionSaving} onClick={()=>void startRevision()}>
<GitBranch/>
<span>
<strong>{revisionSaving?'Criando revisão…':'Revisar pedido'}</strong>
<small>Cria uma nova revisão do orçamento para gerar outro pedido, sem apagar este cancelado.</small>
</span>
</button>:<div className="order-action disabled">
<GitBranch/>
<span>
<strong>Revisar pedido</strong>
<small>A revisão comercial fica disponível após o cancelamento deste pedido.</small>
</span>
</div>}<div className="order-action info">
<PackagePlus/>
<span>
<strong>Insumos e lista de compras</strong>
<small>Na revisão do orçamento, abra cada item e use “Insumos cadastrados”. Ao aprovar, esses insumos geram a lista de compras.</small>
</span>
</div>
</div>
<footer>
<button type="button" className="button secondary" onClick={()=>setActionsOpen(false)}>Fechar</button>
</footer>
</section>
</div>}
    <section className="order-detail-grid">
      <section className="panel order-detail-card">
<header>
<div>
<span className="eyebrow">Dados de entrega</span>
<h2>Entrega ao cliente</h2>
<p>Esses dados serão exibidos na versão do pedido para o cliente.</p>
</div>
</header>
<div className="form-grid">
<label className="field span-2">Endereço de entrega<input value={address} onChange={event => setAddress(event.target.value)} placeholder="Endereço + cidade / UF"/>
</label>
<label className="field">Entrega combinada<input required type="date" value={promisedDate} onChange={event => setPromisedDate(event.target.value)}/>
</label>
<div className="order-field-note">
<strong>{promisedDate ? date(promisedDate) : 'A confirmar'}</strong>
<span>A data poderá ser reprogramada.</span>
</div>
</div>
<footer>
<button className="button primary" disabled={!promisedDate || deliverySaving} onClick={() => void saveDelivery()}>{deliverySaving ? 'Salvando…' : 'Salvar entrega'}</button>
</footer>
</section>
      <section className="panel order-detail-card">
<header>
<div>
<span className="eyebrow">Financeiro do pedido</span>
<h2>Recebimento</h2>
<p>{order.payment_terms || 'Condição comercial a combinar.'}</p>
</div>
</header>{order.status === 'awaiting_finance' ? <>
<div className="form-grid">
<label className="field">Forma de recebimento<select value={method} onChange={event => setMethod(event.target.value)}>
<option>PIX</option>
<option>Transferência bancária</option>
<option>Boleto</option>
<option>Cartão de crédito</option>
<option>Cartão de débito</option>
<option>Dinheiro</option>
<option>A combinar</option>
</select>
</label>
<label className="field">Quantidade de parcelas<input type="number" min="1" max="60" value={installments} onChange={event => setInstallments(Math.max(1,Math.min(60,Number(event.target.value)||1)))}/>
</label>
<label className="field">Primeiro vencimento<input required type="date" value={firstDue} onChange={event => setFirstDue(event.target.value)}/>
</label>
<label className="field">Valor por parcela<input readOnly value={money.format(amount)}/>
</label>
</div>
<footer>
<button className="button primary" disabled={financeSaving} onClick={() => void configureReceivables()}>{financeSaving ? 'Gerando…' : 'Gerar contas a receber'}</button>
</footer>
</> : <div className="order-receivable-list">{receivables.length ? receivables.map(item => <div key={item.id}>
<span>Parcela {item.installment}/{item.installment_count}</span>
<span>{item.payment_method || 'A combinar'}</span>
<span>{date(item.due_date)}</span>
<strong>{money.format(Number(item.amount))}</strong>
</div>) : <p>Nenhuma parcela registrada neste pedido.</p>}</div>}</section>
    </section>
    <section className="panel order-notes-card">
<header>
<div>
<span className="eyebrow">Mensagem para o cliente</span>
<h2>Observações gerais do pedido</h2>
<p>Este texto aparecerá no rodapé da versão do pedido para o cliente.</p>
</div>
</header>
<div>
<label className="field">Observações<textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Ex.: Troca de espuma não inclusa. Caso seja necessária, será enviado orçamento complementar."/>
</label>
</div>
<footer>
<button className="button primary" disabled={notesSaving} onClick={() => void saveNotes()}>{notesSaving ? 'Salvando…' : 'Salvar observações'}</button>
</footer>
</section>
    <section className="panel order-detail-items">
<header>
<div>
<span className="eyebrow">Pedido {order.display_number}</span>
<h2>Itens e valores</h2>
<p>{order.client?.name ?? 'Cliente não informado'} · origem {order.budget?.display_number ?? '—'}</p>
</div>
<strong>{money.format(Number(order.total))}</strong>
</header>
<div className="table-wrap">
<table>
<thead>
<tr>
<SortableHeader label="Item" column="item" sort={itemSort} onChange={setItemSort}/>
<SortableHeader label="Quantidade" column="quantity" sort={itemSort} onChange={setItemSort}/>
<SortableHeader label="Valor" column="value" sort={itemSort} onChange={setItemSort}/>
<SortableHeader label="Operação" column="operation" sort={itemSort} onChange={setItemSort}/>
</tr>
</thead>
<tbody>{sortedItems.map((item,index) => <tr key={item.id}>
<td>
<strong>{item.snapshot.environment || `Item ${index+1}`}</strong>
<small className="table-subline">{item.snapshot.description || 'Descrição não informada'}</small>
</td>
<td>{Number(item.snapshot.quantity || 0).toLocaleString('pt-BR')}</td>
<td>
<strong>{money.format(Number(item.snapshot.sale_total || 0))}</strong>
</td>
<td>{orderStatusLabels[item.status as OrderStatus] ?? item.status}</td>
</tr>)}</tbody>
</table>
</div>
</section>
  </>
}
