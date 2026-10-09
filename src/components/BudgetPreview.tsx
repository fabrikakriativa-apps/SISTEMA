import { Printer, X } from 'lucide-react'
import { money } from '../lib/format'
import { SaveDocumentImage } from './SaveDocumentImage'
import { optionFinalValue, type ItemPaymentOption } from '../lib/paymentOptions'

type PreviewItem = { id:string; environment:string|null; description:string; quantity:number; sale_total:number; affects_total:boolean; family:{name:string}|null }
type PreviewBudget = { display_number:string; current_revision:number; created_at:string; valid_until:string|null; payment_terms:string|null; delivery_terms:string|null; notes:string|null; subtotal:number; discount:number; total:number; document_type?:'pre_budget'|'budget' }
const date = (value:string|null) => value ? new Date(`${value.slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR') : 'A definir'

export function BudgetPreview({budget,items,paymentOptions,clientName,clientAddress,onClose}:{budget:PreviewBudget;items:PreviewItem[];paymentOptions:Record<string,ItemPaymentOption[]>;clientName:string;clientAddress?:string;onClose:()=>void}) {
  const isPreBudget = budget.document_type === 'pre_budget'
  const visibleItems = items
  return <div className="preview-backdrop">
    <div className="client-preview-shell">
      <div className="preview-toolbar"><div><strong>Prévia do {isPreBudget ? 'pré-orçamento' : 'orçamento'} para o cliente</strong><span>Esta é a mesma versão usada na impressão e no PDF.</span></div><button className="button secondary" onClick={() => window.print()}><Printer/>Imprimir / salvar PDF</button><SaveDocumentImage number={budget.display_number}/><button className="icon-button" aria-label="Fechar prévia" onClick={onClose}><X/></button></div>
      <article className="client-document budget-client-document">
        <header><div className="document-brand"><span>FK</span><div><strong>FÁBRIKA KRIATIVA</strong><small>Soluções personalizadas para ambientes</small></div></div><div className="document-number"><small>{isPreBudget ? 'PRÉ-ORÇAMENTO' : 'ORÇAMENTO'}</small><strong>{budget.display_number}</strong><span>{date(budget.created_at)}</span></div></header>
        <section className="budget-client-heading"><div><small>PROPOSTA PARA</small><strong>{clientName}</strong>{clientAddress && <span>{clientAddress}</span>}</div><div><small>VALIDADE</small><strong>{date(budget.valid_until)}</strong>{budget.delivery_terms && <span>Previsão: {budget.delivery_terms}</span>}</div></section>
        <section className="budget-document-items">
          {visibleItems.length ? visibleItems.map((item,index) => <BudgetItem key={item.id} item={item} index={index} paymentOptions={paymentOptions[item.id] ?? []}/>) : <div className="document-empty">Nenhum item incluído neste {isPreBudget ? 'pré-orçamento' : 'orçamento'}.</div>}
        </section>
        <section className="document-total"><div><span>Subtotal</span><strong>{money.format(Number(budget.subtotal))}</strong></div>{Number(budget.discount) > 0 && <div><span>Desconto</span><strong>- {money.format(Number(budget.discount))}</strong></div>}<div className="grand-total"><span>Total do orçamento</span><strong>{money.format(Number(budget.total))}</strong></div></section>
        {(budget.notes || isPreBudget) && <footer>{budget.notes && <p><strong>Observações:</strong> {budget.notes}</p>}{isPreBudget && <p><strong>Importante:</strong> Como se trata de um orçamento prévio, as medidas e especificações serão confirmadas antes da produção, conforme as condições finais do local e as definições do projeto.</p>}</footer>}
      </article>
    </div>
  </div>
}

function BudgetItem({item,index,paymentOptions}:{item:PreviewItem;index:number;paymentOptions:ItemPaymentOption[]}) {
  const label = item.family?.name || `Item ${index+1}`
  return <article className="budget-document-item">
    <header><div><small>ITEM {index+1}{item.environment ? ` · ${item.environment}` : ''}{!item.affects_total?' · OPÇÃO (NÃO SOMA AO TOTAL)':''}</small><strong>{label}</strong><p>{item.description}</p><span>Quantidade: {Number(item.quantity).toLocaleString('pt-BR')}</span></div><div><small>VALOR DO ITEM</small><strong>{money.format(Number(item.sale_total))}</strong></div></header>
    {paymentOptions.length > 0 && <section className="budget-payment-options"><small>FORMAS DE PAGAMENTO PARA ESTE ITEM</small><div>{paymentOptions.map(option => <article key={option.id ?? `${item.id}-${option.position}`}><div><strong>{option.description}</strong>{option.observation && <span>{option.observation}</span>}</div><strong>{money.format(optionFinalValue(Number(item.sale_total),option))}</strong></article>)}</div></section>}
  </article>
}
