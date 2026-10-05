import { Printer, X } from 'lucide-react'
import { money } from '../lib/format'

type OrderItem = { id:string; snapshot:{ environment?:string|null; description?:string; quantity?:number; sale_total?:number } }
type Receivable = { id:string; installment:number; installment_count:number; due_date:string|null; amount:number; payment_method:string|null; status:string }
type PreviewOrder = {
  display_number:string; created_at:string; payment_terms:string|null; promised_date:string|null; client_address:string|null; notes:string|null; total:number
  client:{ name:string; document:string|null; address:string|null; city:string|null }|null; order_items:OrderItem[]; receivables?:Receivable[]
}
const displayDate = (value:string|null) => value ? new Date(`${value.slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR') : 'A confirmar'

export function OrderPreview({order,onClose}:{order:PreviewOrder;onClose:()=>void}) {
  const address = order.client_address || [order.client?.address,order.client?.city].filter(Boolean).join(' · ')
  const installments = (order.receivables ?? []).filter(item => item.status !== 'cancelled').sort((a,b) => a.installment-b.installment)
  return <div className="preview-backdrop">
    <div className="client-preview-shell">
      <div className="preview-toolbar">
        <div><strong>Pedido para o cliente</strong><span>Versão final para impressão ou salvamento em PDF.</span></div>
        <button className="button secondary" onClick={() => window.print()}><Printer/>Imprimir / salvar PDF</button>
        <button className="icon-button" aria-label="Fechar prévia" onClick={onClose}><X/></button>
      </div>
      <article className="client-document order-client-document">
        <header>
          <div className="document-brand"><span>FK</span><div><strong>FÁBRIKA KRIATIVA</strong><small>Gestão financeira e operacional</small></div></div>
          <div className="document-number"><small>PEDIDO</small><strong>{order.display_number}</strong><span>{displayDate(order.created_at)}</span></div>
        </header>
        <section className="document-client">
          <div><small>CLIENTE</small><strong>{order.client?.name ?? 'Cliente não informado'}</strong>{order.client?.document&&<span>CPF/CNPJ: {order.client.document}</span>}{address && <span>{address}</span>}</div>
          <div><small>CONDIÇÕES</small><strong>Pagamento: {order.payment_terms || 'A combinar'}</strong><span>Prazo de entrega: {displayDate(order.promised_date)}</span></div>
        </section>
        <section className="document-items order-document-items">
          <div className="order-document-head"><small>DESCRIÇÃO</small><small>QTD.</small><small>TOTAL</small></div>
          {order.order_items.map((item,index) => <div className="document-item" key={item.id}>
            <div><strong>{item.snapshot.environment || `Item ${index+1}`}</strong><p>{item.snapshot.description || 'Descrição não informada'}</p></div>
            <span>{Number(item.snapshot.quantity || 0).toLocaleString('pt-BR')}</span>
            <strong>{money.format(Number(item.snapshot.sale_total || 0))}</strong>
          </div>)}
        </section>
        {installments.length > 0 && <section className="order-installments"><strong>PARCELAS</strong>{installments.map(item => <div key={item.id}><span>Parcela {item.installment}/{item.installment_count}</span><span>{item.payment_method || 'A combinar'}</span><span>{displayDate(item.due_date)}</span><b>{money.format(Number(item.amount))}</b></div>)}</section>}
        <section className="document-total"><div><span>Subtotal</span><strong>{money.format(Number(order.total))}</strong></div><div className="grand-total"><span>Total do pedido</span><strong>{money.format(Number(order.total))}</strong></div></section>
        {order.notes && <footer><p><strong>Observações:</strong> {order.notes}</p></footer>}
      </article>
    </div>
  </div>
}
