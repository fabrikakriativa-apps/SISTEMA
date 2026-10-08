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

export type DetailOrder = {
  id:string; display_number:string; status:string; payment_terms:string|null; promised_date:string|null; client_address:string|null; notes:string|null; total:number; created_at:string
  commercial_terms?:{condition:string;additional_discount:number;subtotal:number;total:number}|null
  client:{name:string; document:string|null; address:string|null; city:string|null}|null; budget:{id:string;display_number:string}|null
  order_items:{id:string; status:string; snapshot:{environment?:string|null; description?:string; quantity?:number; sale_total?:number}}[]
  receivables:{id:string; installment:number; installment_count:number; due_date:string|null; amount:number; paid_amount:number; paid_at:string|null; payment_method:string|null; status:string}[]
}
const today = () => new Date().toISOString().slice(0,10)
const date = (value:string|null) => value ? new Date(`${value.slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR') : 'A confirmar'

export function OrderDetails({organizationId,order,onBack,onReviewBudget,onSaved}:{organizationId:string;order:DetailOrder;onBack:()=>void;onReviewBudget:()=>void;onSaved:()=>Promise<void>}) {
  const {show} = useToast()
  const [choices,setChoices]=useState<{label:string;total:number}[]>([])
  const [condition,setCondition]=useState(order.commercial_terms?.condition??'Valor original do orçamento')
  const [discount,setDiscount]=useState(Number(order.commercial_terms?.additional_discount??0))
  const [commercialSaving,setCommercialSaving]=useState(false)
  const commercialDirty=condition!==(order.commercial_terms?.condition??'Valor original do orçamento')||discount!==Number(order.commercial_terms?.additional_discount??0)
  const commercialTotal=Math.max(0,Number(choices.find(x=>x.label===condition)?.total??order.total)-discount)
  useEffect(()=>{let active=true;void supabase?.rpc('get_order_payment_choices',{org_id:organizationId,target_order_id:order.id}).then(({data,error})=>{if(active&&!error)setChoices(data as {label:string;total:number}[])});return()=>{active=false}},[organizationId,order.id,order.total])
  const saveCommercial=async()=>{
    if(!supabase||commercialSaving)return
    setCommercialSaving(true)
    const {error}=await supabase.rpc('set_order_payment_condition',{org_id:organizationId,target_order_id:order.id,condition_label:condition,additional_discount:discount})
    if(error)show('Não foi possível aplicar a condição. Confira o desconto e se já existem parcelas.','error')
    else{await onSaved();show('Condição e desconto aplicados ao pedido.','success')}
    setCommercialSaving(false)
  }
  const [address,setAddress] = useState(order.client_address || [order.client?.address,order.client?.city].filter(Boolean).join(' · '))
  const [promisedDate,setPromisedDate] = useState(order.promised_date ?? '')
  const [notes,setNotes] = useState(order.notes ?? '')
  const [deliverySaving,setDeliverySaving] = useState(false),[notesSaving,setNotesSaving] = useState(false)
  const [method,setMethod] = useState('PIX'),[installments,setInstallments] = useState(1),[firstDue,setFirstDue] = useState(today()),[financeSaving,setFinanceSaving] = useState(false),[preview,setPreview] = useState(false),[receipt,setReceipt] = useState(false),[actionsOpen,setActionsOpen] = useState(false),[revisionSaving,setRevisionSaving] = useState(false)
  const [itemSort,setItemSort]=useState<SortState<'item'|'quantity'|'value'|'operation'>>({key:'item',direction:'asc'})
  const [customParts,setCustomParts]=useState<{amount:number;due_date:string;on_delivery:boolean}[]|null>(null)
  const partsMatch=!customParts||Math.round(customParts.reduce((s,p)=>s+p.amount,0)*100)===Math.round(Number(order.total)*100)
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
  const amount = Number(order.total)/Math.max(1,installments)
  const receivables = useMemo(() => order.receivables.filter(item => item.status !== 'cancelled').sort((a,b) => a.installment-b.installment),[order.receivables])
  const receivedTotal = receivables.reduce((sum,item)=>sum+Number(item.paid_amount||0),0)
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
  const configureReceivables = async () => {
    if(!supabase || financeSaving) return
    setFinanceSaving(true)
    const {error} = customParts?await supabase.rpc('configure_order_custom_receivables',{org_id:organizationId,target_order_id:order.id,payment_method:method,installments_json:customParts}):await supabase.rpc('configure_order_receivables',{org_id:organizationId,target_order_id:order.id,installment_count:installments,first_due_date:firstDue,payment_method:method})
    if(error) show(error.code === '23514' ? 'Este pedido já possui recebimento configurado ou os dados são inválidos.' : 'Não foi possível gerar as parcelas.','error')
    else { await onSaved(); show('Contas a receber geradas. O status do pedido pode ser definido por você.','success') }
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
    <section className="panel order-detail-header" aria-label="Identificação do pedido">
<div className="order-identity">
<span className="eyebrow">Número do pedido</span>
<h2 className="order-number">{order.display_number}</h2>
<p className="order-client-name">{order.client?.name ?? 'Cliente não informado'}</p>
<p className="order-created-date">Criado em {date(order.created_at)}</p>
<small role="status">{autoState==='saving'?'Salvando automaticamente…':autoState==='waiting'?'Rascunho protegido neste navegador':autoState==='error'?'Falha ao sincronizar; rascunho protegido neste navegador':'Alterações salvas'}</small>
</div>
<div className="order-header-actions">
<button className="button secondary" onClick={() => setActionsOpen(true)}>
<ClipboardList/>Ações</button>
<button className="button secondary" onClick={onBack}>
<ArrowLeft/>Voltar aos pedidos</button>
</div>
</section>
    {preview && <OrderPreview order={{...order,client_address:address,promised_date:promisedDate||null,notes}} onClose={() => setPreview(false)}/>}
    {receipt && <ReceiptPreview order={order} onClose={() => setReceipt(false)}/>}
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
<strong>Revisar pedido</strong>
<small>A revisão comercial fica disponível após o cancelamento deste pedido.</small>
</span>
</div>}<button type="button" className="order-action" onClick={()=>{setActionsOpen(false);onReviewBudget()}}>
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
</header>{order.status === 'awaiting_finance' ? <>
<div className="form-grid">
<label className="field">Condição escolhida no orçamento<select value={condition} disabled={receivables.length>0||!choices.length} onChange={event=>setCondition(event.target.value)}>{choices.map(choice=><option key={choice.label} value={choice.label}>{choice.label} — {money.format(choice.total)}</option>)}</select></label>
<label className="field">Desconto adicional (R$)<DecimalInput value={discount} decimalScale={2} onValueChange={setDiscount}/></label>
<label className="field">Total após desconto<input readOnly value={money.format(commercialTotal)}/></label>
<div className="field"><span>Aplicar antes de emitir ou gerar parcelas</span><button type="button" className="button secondary" disabled={commercialSaving||receivables.length>0||!choices.length||discount>(choices.find(x=>x.label===condition)?.total??0)} onClick={()=>void saveCommercial()}>{commercialSaving?'Aplicando…':'Aplicar condição e desconto'}</button></div>
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
<label className="field">Valor por parcela<input readOnly value={customParts?'Valores personalizados abaixo':money.format(amount)}/>
</label>
<div className="field"><button type="button" className="button secondary" onClick={()=>{setInstallments(2);const entry=Math.round(Number(order.total)*60)/100;setCustomParts([{amount:entry,due_date:firstDue,on_delivery:false},{amount:Number((Number(order.total)-entry).toFixed(2)),due_date:order.promised_date??'',on_delivery:true}])}}>60% entrada + 40% na entrega</button><button type="button" className="text-button" onClick={()=>setCustomParts(null)}>Usar parcelas iguais</button></div>
{customParts?.map((part,index)=><div className="field" key={index}><span>Parcela {index+1} · {(part.amount/Number(order.total)*100||0).toFixed(2)}%</span><DecimalInput value={part.amount} decimalScale={2} onValueChange={amount=>setCustomParts(parts=>parts!.map((p,i)=>i===index?{...p,amount}:p))}/><label><input type="checkbox" checked={part.on_delivery} onChange={e=>setCustomParts(parts=>parts!.map((p,i)=>i===index?{...p,on_delivery:e.target.checked}:p))}/>Na entrega</label>{part.on_delivery?<small>{order.promised_date?`Entrega: ${date(order.promised_date)}`:'Vencimento a confirmar: entrega ainda sem data.'}</small>:<input aria-label={`Vencimento da parcela ${index+1}`} type="date" value={part.due_date} onChange={e=>setCustomParts(parts=>parts!.map((p,i)=>i===index?{...p,due_date:e.target.value}:p))}/>}</div>)}
{!partsMatch&&<p role="alert">A soma das parcelas deve corresponder ao total do pedido.</p>}
</div>
<footer>
<button className="button primary" disabled={financeSaving||commercialSaving||commercialDirty||!partsMatch} onClick={() => void configureReceivables()}>{financeSaving ? 'Gerando…' : 'Gerar contas a receber'}</button>
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

