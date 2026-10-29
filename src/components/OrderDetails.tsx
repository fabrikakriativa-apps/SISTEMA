import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ClipboardList, Eye, GitBranch, PackagePlus, ReceiptText, X } from 'lucide-react'
import { useToast } from './ToastProvider'
import { supabase } from '../lib/supabase'
import { money } from '../lib/format'
import { OrderPreview } from './OrderPreview'
import {SortableHeader,compareValues,type SortState} from './SortableHeader'
import {orderStatusLabels,type OrderStatus} from '../lib/orderStatus'
import { ReceiptPreview } from './ReceiptPreview'
import { readRecovery, writeRecovery, clearRecovery } from '../lib/recoveryDraft'
import { DecimalInput } from './DecimalInput'
import {OrderPaymentPlanEditor} from './OrderPaymentPlanEditor'
import type {PaymentGroup} from '../lib/orderPaymentPlan'
import { ReviseOrderReceivables } from './ReviseOrderReceivables'
import { routeHash } from '../lib/navigation'
import {AppointmentEditor} from './AppointmentEditor'
import {useAccess} from './AuthorizedAccess'

export type DetailOrder = {
  id:string; display_number:string; status:string; payment_terms:string|null; promised_date:string|null; client_address:string|null; notes:string|null; total:number; created_at:string
  commercial_terms?:{condition:string;additional_discount:number;subtotal:number;total:number;payment_plan?:PaymentGroup[]}|null
  client:{name:string; document:string|null; address:string|null; city:string|null}|null; budget:{id:string;display_number:string}|null
  order_items:{id:string; status:string; snapshot:{environment?:string|null; description?:string; quantity?:number; sale_total?:number}}[]
  receivables:{id:string; installment:number; installment_count:number; due_date:string|null; amount:number; gross_amount?:number|null; fee_amount?:number; paid_amount:number; paid_at:string|null; payment_method:string|null; status:string}[]
}
const today = () => new Date().toISOString().slice(0,10)
const date = (value:string|null) => value ? new Date(`${value.slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR') : 'A confirmar'

export function OrderDetails({organizationId,order,onBack,onReviewBudget,onSaved}:{organizationId:string;order:DetailOrder;onBack:()=>void;onReviewBudget:()=>void;onSaved:()=>Promise<void>}) {
  const {show} = useToast()
  const appointmentAccess=useAccess(),[appointmentOpen,setAppointmentOpen]=useState(false)
  const [choices,setChoices]=useState<{label:string;total:number}[]>([])
  const [condition,setCondition]=useState(order.commercial_terms?.condition??'Valor original do orçamento')
  const [discount,setDiscount]=useState(Number(order.commercial_terms?.additional_discount??0))
  const [commercialSaving,setCommercialSaving]=useState(false)
  const [commercialError,setCommercialError]=useState(false)
  const commercialAttempt=useRef('')
  const commercialDirty=condition!==(order.commercial_terms?.condition??'Valor original do orçamento')||discount!==Number(order.commercial_terms?.additional_discount??0)
  const commercialTotal=Math.max(0,Number(choices.find(x=>x.label===condition)?.total??order.total)-discount)
  useEffect(()=>{let active=true;void supabase?.rpc('get_order_payment_choices',{org_id:organizationId,target_order_id:order.id}).then(({data,error})=>{if(active&&!error)setChoices(data as {label:string;total:number}[])});return()=>{active=false}},[organizationId,order.id,order.total])
  useEffect(()=>{
    if(!commercialDirty){commercialAttempt.current='';setCommercialError(false);return}
    if(!supabase||commercialSaving)return
    const key=JSON.stringify([order.id,condition,discount])
    if(commercialAttempt.current===key)return
    const selected=choices.find(x=>x.label===condition)
    if(!selected||discount>selected.total){setCommercialError(true);return}
    setCommercialError(false)
    const timer=window.setTimeout(async()=>{
      commercialAttempt.current=key;setCommercialSaving(true)
      try{
        const {error}=await supabase!.rpc('set_order_payment_condition',{org_id:organizationId,target_order_id:order.id,condition_label:condition,additional_discount:discount})
        if(error)throw error
        await onSaved()
      }catch{setCommercialError(true);show('Não foi possível salvar a condição e o desconto. Confira se já existem parcelas.','error')}
      finally{setCommercialSaving(false)}
    },800)
    return()=>window.clearTimeout(timer)
  },[condition,discount,commercialDirty,commercialSaving,choices,order.id])
  const [address,setAddress] = useState(order.client_address || [order.client?.address,order.client?.city].filter(Boolean).join(' · '))
  const [promisedDate,setPromisedDate] = useState(order.promised_date ?? '')
  const [notes,setNotes] = useState(order.notes ?? '')
  const [deliverySaving,setDeliverySaving] = useState(false),[notesSaving,setNotesSaving] = useState(false)
  const [preview,setPreview] = useState(false),[receipt,setReceipt] = useState(false),[actionsOpen,setActionsOpen] = useState(false),[revisionSaving,setRevisionSaving] = useState(false)
  const [itemSort,setItemSort]=useState<SortState<'item'|'quantity'|'value'|'operation'>>({key:'item',direction:'asc'})
  const [editingReceivable,setEditingReceivable]=useState<DetailOrder['receivables'][number]|null>(null)
  const openReceivable=(item:DetailOrder['receivables'][number])=>{if(order.commercial_terms?.payment_plan&&order.receivables.some(r=>Number(r.paid_amount)>0)){show('Pagamentos já recebidos estão preservados. Ajustes devem ser conferidos no financeiro.','info');return}setActionsOpen(false);setEditingReceivable(item)}
  const recoveryKey=`${organizationId}:order:${order.id}`
  const [autoState,setAutoState]=useState('saved')
  const latest=useRef({address,promisedDate,notes}), savingAuto=useRef(false)
  const persisted=useRef({address:order.client_address||[order.client?.address,order.client?.city].filter(Boolean).join(' · '),promisedDate:order.promised_date??'',notes:order.notes??''})
  useEffect(() => {
    const saved=readRecovery<{address:string;promisedDate:string;notes:string}>(recoveryKey)
    const initial={address:order.client_address||[order.client?.address,order.client?.city].filter(Boolean).join(' · '),promisedDate:order.promised_date??'',notes:order.notes??''}
    persisted.current=initial
    setAddress(saved?.address??initial.address);setPromisedDate(saved?.promisedDate??initial.promisedDate);setNotes(saved?.notes??initial.notes)
  },[order.id])
  useEffect(()=>{
    const value={address,promisedDate,notes};latest.current=value
    if(['completed','cancelled'].includes(order.status))return
    if(JSON.stringify(value)===JSON.stringify(persisted.current))return
    writeRecovery(recoveryKey,value);setAutoState('waiting')
    const timer=window.setTimeout(async()=>{
      if(!supabase||savingAuto.current)return
      savingAuto.current=true;setAutoState('saving')
      try{
        do {
        const queued=latest.current
        if(queued.notes!==persisted.current.notes){const result=await supabase.rpc('set_order_general_notes',{org_id:organizationId,target_order_id:order.id,new_notes:queued.notes});if(result.error)throw result.error;persisted.current.notes=queued.notes}
        if(queued.address!==persisted.current.address||queued.promisedDate!==persisted.current.promisedDate){const result=await supabase.rpc('set_order_delivery_details',{org_id:organizationId,target_order_id:order.id,new_client_address:queued.address,new_promised_date:queued.promisedDate||null});if(result.error)throw result.error;persisted.current.address=queued.address;persisted.current.promisedDate=queued.promisedDate}
        if(JSON.stringify(latest.current)===JSON.stringify(persisted.current)){clearRecovery(recoveryKey);setAutoState('saved');break}
        if(JSON.stringify(latest.current)===JSON.stringify(queued)){setAutoState('waiting');break}
        } while(true)
      }catch{setAutoState('error')}
      finally{savingAuto.current=false}
    },800)
    return()=>window.clearTimeout(timer)
  },[address,promisedDate,notes,order.id,order.status])
  const receivables = useMemo(() => order.receivables.filter(item => item.status !== 'cancelled').sort((a,b) => a.installment-b.installment),[order.receivables])
  const receivedTotal = receivables.reduce((sum,item)=>sum+Number(item.paid_amount||0)*(Number(item.gross_amount??item.amount)/Number(item.amount||1)),0)
  const sortedItems=useMemo(()=>[...order.order_items].sort((a,b)=>{const values={item:[`${a.snapshot.environment??''} ${a.snapshot.description??''}`,`${b.snapshot.environment??''} ${b.snapshot.description??''}`],quantity:[Number(a.snapshot.quantity??0),Number(b.snapshot.quantity??0)],value:[Number(a.snapshot.sale_total??0),Number(b.snapshot.sale_total??0)],operation:[a.status,b.status]}[itemSort.key];return compareValues(values[0],values[1])*(itemSort.direction==='asc'?1:-1)}),[order.order_items,itemSort])
  const saveDelivery = async () => {
    if(!supabase || deliverySaving) return
    setDeliverySaving(true)
    const {error} = await supabase.rpc('set_order_delivery_details',{org_id:organizationId,target_order_id:order.id,new_client_address:address.trim(),new_promised_date:promisedDate||null})
    if(error) show('Não foi possível salvar os dados de entrega.','error')
    else { await onSaved(); show('Dados de entrega atualizados.','success') }
    setDeliverySaving(false)
  }
  const saveNotes = async () => {
    if(!supabase || notesSaving) return
    setNotesSaving(true)
    const {error} = await supabase.rpc('set_order_general_notes',{org_id:organizationId,target_order_id:order.id,new_notes:notes})
    if(error) show('Não foi possível salvar as observações do pedido.','error')
    else { await onSaved(); show('Observações do pedido atualizadas.','success') }
    setNotesSaving(false)
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
    {appointmentOpen&&<AppointmentEditor organizationId={organizationId} initialSource={{kind:'order',id:order.id,label:[order.display_number,order.client?.name].filter(Boolean).join(' · '),address}} onClose={()=>setAppointmentOpen(false)} onSaved={async()=>{}}/>}
    <section className="panel order-detail-header" aria-label="Identificação do pedido">
<div className="order-identity">
<span className="eyebrow">Número do pedido</span>
<h2 className="order-number">{order.display_number}</h2>
<p className="order-client-name">{order.client?.name ?? 'Cliente não informado'}</p>
<p className="order-created-date">Criado em {date(order.created_at)}</p>
<small role="status">{autoState==='saving'?'Salvando automaticamente…':autoState==='waiting'?'Rascunho protegido neste navegador':autoState==='error'?'Falha ao sincronizar; rascunho protegido neste navegador':'Alterações salvas'}</small>
</div>
<div className="order-header-actions">
{appointmentAccess&&['admin','comercial','operacao'].includes(appointmentAccess.role)&&order.status!=='cancelled'&&<button className="button secondary" onClick={()=>setAppointmentOpen(true)}>Agendar</button>}
{order.budget&&<a className="button secondary" href={routeHash('orcamentos',order.budget.id)} target="_blank" rel="noopener noreferrer" title="Abrir orçamento em nova aba">Abrir {order.budget.display_number} ↗</a>}
<button className="button secondary" onClick={() => setActionsOpen(true)}>
<ClipboardList/>Ações</button>
<button className="button secondary" onClick={onBack}>
<ArrowLeft/>Voltar aos pedidos</button>
</div>
</section>
    {preview && <OrderPreview order={{...order,client_address:address,promised_date:promisedDate||null,notes}} onClose={() => setPreview(false)}/>}
    {receipt && <ReceiptPreview order={{...order,receivables:order.receivables.map(r=>({...r,amount:Number(r.gross_amount??r.amount),paid_amount:Number(r.paid_amount)*(Number(r.gross_amount??r.amount)/Number(r.amount||1))}))}} onClose={() => setReceipt(false)}/>}
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
<button type="button" className="order-action" onClick={()=>{if(commercialDirty){show('Aplique a condição e o desconto antes de emitir o pedido.','info');return}setActionsOpen(false);setPreview(true)}}>
<Eye/>
<span>
<strong>Versão do cliente</strong>
<small>Visualize o documento que será apresentado ao cliente.</small>
</span>
</button>{receivedTotal>0?<button type="button" className="order-action" onClick={()=>{setActionsOpen(false);setReceipt(true)}}>
<ReceiptText/>
<span>
<strong>Emitir recibo</strong>
<small>{receivedTotal>=Number(order.total)-.005?'Quitação total conforme o financeiro do pedido.':'Recibo parcial pelo valor já recebido.'}</small>
</span>
</button>:<div className="order-action disabled">
<ReceiptText/>
<span>
<strong>Emitir recibo</strong>
<small>Disponível após o registro de um recebimento parcial ou total.</small>
</span>
</div>}{order.status==='cancelled'&&order.budget?.id?<button type="button" className="order-action" disabled={revisionSaving} onClick={()=>void startRevision()}>
<GitBranch/>
<span>
<strong>{revisionSaving?'Criando revisão…':'Revisar pedido'}</strong>
<small>Cria uma nova revisão do orçamento para gerar outro pedido, sem apagar este cancelado.</small>
</span>
</button>:<div className="order-action disabled">
<GitBranch/>
<span>
<strong>Nova revisão comercial</strong>
<small>A revisão comercial fica disponível após o cancelamento deste pedido.</small>
</span>
</div>}{receivables.some(x=>['open','overdue'].includes(x.status)&&Number(x.paid_amount)===0)&&<button type="button" className="order-action" onClick={()=>openReceivable(receivables.find(x=>['open','overdue'].includes(x.status)&&Number(x.paid_amount)===0)!)}><ReceiptText/><span><strong>Revisar parcelas do pedido</strong><small>Corrija valor, vencimento e forma de recebimento sem cancelar o pedido.</small></span></button>}<button type="button" className="order-action" onClick={()=>{setActionsOpen(false);onReviewBudget()}}>
<GitBranch/><span><strong>Revisar especificações do orçamento</strong><small>Complemente tecido e descrições mantendo os valores aprovados e este pedido.</small></span>
</button><div className="order-action info">
<PackagePlus/>
<span>
<strong>Insumos e lista de compras</strong>
<small>Em Compras, edite as necessidades ou adicione os materiais e insumos necessários para este pedido.</small>
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
<label className="field">Entrega combinada<input type="date" value={promisedDate} onChange={event => setPromisedDate(event.target.value)}/>
</label>
<div className="order-field-note">
<strong>{promisedDate ? date(promisedDate) : 'A confirmar'}</strong>
<span>A data poderá ser reprogramada.</span>
</div>
</div>
<footer>
<button className="button primary" disabled={deliverySaving} onClick={() => void saveDelivery()}>{deliverySaving ? 'Salvando…' : 'Salvar entrega'}</button>
</footer>
</section>
      <section className="panel order-detail-card">
<header>
<div>
<span className="eyebrow">Financeiro do pedido</span>
<h2>Recebimento</h2>
<p>{order.payment_terms || 'Condição comercial a combinar.'}</p>
</div>
</header>{order.status === 'awaiting_finance' && receivables.length===0 ? <>
<div className="form-grid">
<label className="field">Condição escolhida no orçamento<select value={condition} disabled={receivables.length>0||!choices.length} onChange={event=>setCondition(event.target.value)}>{choices.map(choice=><option key={choice.label} value={choice.label}>{choice.label} — {money.format(choice.total)}</option>)}</select></label>
<label className="field">Desconto adicional (R$)<DecimalInput value={discount} decimalScale={2} disabled={receivables.length>0} onValueChange={setDiscount}/></label>
<label className="field">Total após desconto<input readOnly value={money.format(commercialTotal)}/></label>
<div className="field" role="status"><span>{commercialError?'Condição não salva. Confira o desconto e as parcelas existentes.':commercialSaving?'Salvando condição e desconto…':commercialDirty?'Aguardando salvamento automático…':'Condição e desconto salvos automaticamente'}</span></div>
<div className="span-2"><OrderPaymentPlanEditor key={`${order.id}:${order.total}`} organizationId={organizationId} orderId={order.id} total={Number(order.total)} initial={order.commercial_terms?.payment_plan} onSaved={onSaved} disabled={commercialSaving||commercialDirty}/></div>
</div>
</> : <div className="order-receivable-list">{receivables.length ? receivables.map(item => <div key={item.id} role={['open','overdue'].includes(item.status)&&Number(item.paid_amount)===0?'button':undefined} tabIndex={['open','overdue'].includes(item.status)&&Number(item.paid_amount)===0?0:undefined} aria-label={`Revisar parcela ${item.installment}`} onClick={()=>{if(['open','overdue'].includes(item.status)&&Number(item.paid_amount)===0)openReceivable(item)}} onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&['open','overdue'].includes(item.status)&&Number(item.paid_amount)===0){e.preventDefault();openReceivable(item)}}}>
<span>{item.gross_amount!=null&&item.payment_method==='Cartão de crédito'?'Crédito antecipado':`Parcela ${item.installment}/${item.installment_count}`}</span>
<span>{item.payment_method || 'A combinar'}</span>
<span>{date(item.due_date)}</span>
<strong>{money.format(Number(item.amount))}{Number(item.fee_amount)>0&&<small style={{display:'block'}}>Bruto {money.format(Number(item.gross_amount))} · Taxa {money.format(Number(item.fee_amount))}</small>}</strong>
</div>) : <p>Nenhuma parcela registrada neste pedido.</p>}</div>}</section>
    </section>
    {editingReceivable&&receivables.every(r=>Number(r.paid_amount)===0&&['open','overdue'].includes(r.status))?<div className="dialog-backdrop"><section className="dialog order-receivable-revision"><header><h2>Revisar pagamentos do pedido</h2></header><OrderPaymentPlanEditor organizationId={organizationId} orderId={order.id} total={Number(order.total)} initial={order.commercial_terms?.payment_plan} rows={receivables} onSaved={onSaved} onClose={()=>setEditingReceivable(null)}/></section></div>:editingReceivable&&<ReviseOrderReceivables organizationId={organizationId} orderId={order.id} rows={receivables} onClose={()=>setEditingReceivable(null)} onSaved={onSaved}/>}
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
