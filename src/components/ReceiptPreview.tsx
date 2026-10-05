import { Printer, X } from 'lucide-react'
import { money } from '../lib/format'

type ReceiptPayment = { id:string; installment:number; installment_count:number; paid_amount:number; paid_at:string|null; payment_method:string|null; status:string }
type ReceiptOrder = {
  display_number:string; total:number; client_address:string|null
  client:{name:string;document:string|null;address:string|null;city:string|null}|null
  receivables:ReceiptPayment[]
}
const displayDate=(value:string|null)=>value?new Date(`${value.slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR'):'Data não informada'

export function ReceiptPreview({order,onClose}:{order:ReceiptOrder;onClose:()=>void}){
  const payments=order.receivables.filter(item=>item.status!=='cancelled'&&Number(item.paid_amount)>0).sort((a,b)=>a.installment-b.installment)
  const paid=payments.reduce((sum,item)=>sum+Number(item.paid_amount),0)
  const total=Number(order.total)
  const isTotal=paid>=total-.005
  const address=order.client_address||[order.client?.address,order.client?.city].filter(Boolean).join(' · ')
  const latestDate=payments.map(item=>item.paid_at).filter((value):value is string=>Boolean(value)).sort().at(-1)??null
  return <div className="preview-backdrop receipt-preview">
    <div className="client-preview-shell">
      <div className="preview-toolbar">
        <div><strong>{isTotal?'Recibo de quitação total':'Recibo parcial'}</strong><span>Valor calculado pelos recebimentos registrados no pedido.</span></div>
        <button className="button secondary" onClick={()=>window.print()}><Printer/>Imprimir / salvar PDF</button>
        <button className="icon-button" aria-label="Fechar recibo" onClick={onClose}><X/></button>
      </div>
      <article className="client-document receipt-document">
        <header>
          <div className="document-brand"><span>FK</span><div><strong>FÁBRIKA KRIATIVA</strong><small>FERREIRA E MAHS COMÉRCIO E SERVIÇOS LTDA</small></div></div>
          <div className="document-number"><small>{isTotal?'RECIBO DE QUITAÇÃO':'RECIBO PARCIAL'}</small><strong>{order.display_number}</strong><span>{displayDate(latestDate)}</span></div>
        </header>
        <section className="receipt-value"><small>VALOR RECEBIDO</small><strong>{money.format(paid)}</strong></section>
        <p className="receipt-statement">Recebemos de <strong>{order.client?.name??'Cliente não informado'}</strong>{order.client?.document?<> — CPF/CNPJ <strong>{order.client.document}</strong></>:null}, a importância de <strong>{money.format(paid)}</strong>, referente ao pagamento {isTotal?'total':'parcial'} do pedido <strong>{order.display_number}</strong>.</p>
        <section className="document-client receipt-client">
          <div><small>CLIENTE</small><strong>{order.client?.name??'Cliente não informado'}</strong>{order.client?.document&&<span>CPF/CNPJ: {order.client.document}</span>}{address&&<span>{address}</span>}</div>
          <div><small>SITUAÇÃO</small><strong>{isTotal?'Quitação total':'Pagamento parcial'}</strong><span>Pedido: {money.format(total)}</span><span>Saldo: {money.format(Math.max(0,total-paid))}</span></div>
        </section>
        <section className="order-installments"><strong>RECEBIMENTOS CONSIDERADOS</strong>{payments.map(item=><div key={item.id}><span>Parcela {item.installment}/{item.installment_count}</span><span>{item.payment_method||'Forma não informada'}</span><span>{displayDate(item.paid_at)}</span><b>{money.format(Number(item.paid_amount))}</b></div>)}</section>
        <footer className="receipt-signature"><p>Fábrika Kriativa</p><span>Documento emitido conforme os recebimentos registrados no sistema.</span></footer>
      </article>
    </div>
  </div>
}
