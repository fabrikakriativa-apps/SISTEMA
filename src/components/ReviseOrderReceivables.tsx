import {useState} from 'react'
import {X} from 'lucide-react'
import {DecimalInput} from './DecimalInput'
import {supabase} from '../lib/supabase'
import {money} from '../lib/format'
import {useToast} from './ToastProvider'
import {distributeRevision,editableReceivable,revisionSnapshot,type RevisionReceivable} from '../lib/receivableRevision'

export function ReviseOrderReceivables({organizationId,orderId,rows,onClose,onSaved}:{organizationId:string;orderId:string;rows:RevisionReceivable[];onClose:()=>void;onSaved:()=>Promise<void>}){
 const {show}=useToast()
 const [initial]=useState(()=>rows.filter(x=>x.status!=='cancelled'))
 const pending=initial.filter(editableReceivable),protectedRows=initial.filter(x=>!editableReceivable(x))
 const total=pending.reduce((sum,x)=>sum+Number(x.amount),0)
 const [method,setMethod]=useState(pending[0]?.payment_method?.toUpperCase()==='PIX'?'PIX':pending[0]?.payment_method||'PIX')
 const [parts,setParts]=useState(()=>pending.map(x=>({amount:Number(x.amount),due_date:x.due_date??''})))
 const [saving,setSaving]=useState(false)
 const sum=parts.reduce((s,p)=>s+p.amount,0),matches=Math.round(sum*100)===Math.round(total*100)
 const valid=matches&&parts.length>0&&parts.every(p=>Number.isFinite(p.amount)&&p.amount>0&&p.due_date)
 const save=async()=>{
  if(!supabase||saving||!valid)return
  setSaving(true)
  try{
   const {error}=await supabase.rpc('revise_order_receivables',{org_id:organizationId,target_order_id:orderId,new_payment_method:method,new_installments:parts,expected_receivables:revisionSnapshot(initial)})
   if(error)throw error
   await onSaved();show('Parcelamento atualizado no pedido e no financeiro.','success');onClose()
  }catch(error){const message=error&&typeof error==='object'&&'message' in error?String(error.message):'';show(message.includes('changed')?'As parcelas foram alteradas enquanto você revisava. Feche e reabra a revisão para conferir os dados atuais.':message.includes('Not authorized')?'Seu perfil não permite revisar o financeiro.':'Não foi possível salvar o parcelamento. Confira valores e vencimentos. Os dados digitados foram mantidos.','error')}
  finally{setSaving(false)}
 }
 return <div className="dialog-backdrop"><section className="dialog order-receivable-revision" role="dialog" aria-modal="true" aria-labelledby="revise-payment-title">
 <header><div><h2 id="revise-payment-title">Revisar parcelamento do pedido</h2><p>Altere a forma de recebimento, a quantidade de parcelas, os valores e os vencimentos.</p></div><button className="icon-button" aria-label="Fechar revisão" disabled={saving} onClick={onClose}><X/></button></header>
 <div className="order-receivable-revision-content">
 <div className="form-grid"><label className="field">Forma de recebimento<select value={method} disabled={saving} onChange={e=>setMethod(e.target.value)}>{Array.from(new Set([method,'PIX','Transferência bancária','Boleto','Cartão de crédito','Cartão de débito','Dinheiro','A combinar'])).map(x=><option key={x}>{x}</option>)}</select></label>
 <label className="field">Quantidade de parcelas{protectedRows.length?' em aberto':''}<input type="number" min="1" max="60" value={parts.length} disabled={saving} onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>=1&&n<=60)setParts(distributeRevision(total,n,parts[0]?.due_date||new Date().toISOString().slice(0,10)))}}/></label></div>
 <div className="revision-total"><strong>Total a parcelar: {money.format(total)}</strong><button className="button secondary" disabled={saving} onClick={()=>setParts(distributeRevision(total,parts.length,parts[0]?.due_date||new Date().toISOString().slice(0,10)))}>Distribuir igualmente</button></div>
 {protectedRows.length>0&&<p>Parcelas com recebimentos registrados serão mantidas sem alterações. Esta revisão se aplica somente às parcelas abertas e sem recebimento.</p>}
 <div className="order-payment-parts">{parts.map((part,index)=><div className="order-payment-part" key={index}><strong className="order-payment-part-title">Parcela {index+1} de {parts.length}</strong><label className="field">Percentual (%)<DecimalInput value={total?part.amount/total*100:0} decimalScale={2} disabled={saving} onValueChange={value=>setParts(parts.map((p,i)=>i===index?{...p,amount:Math.round(total*value)/100}:p))}/></label><label className="field">Valor (R$)<DecimalInput value={part.amount} decimalScale={2} disabled={saving} onValueChange={amount=>setParts(parts.map((p,i)=>i===index?{...p,amount}:p))}/></label><label className="field">Vencimento<input type="date" value={part.due_date} disabled={saving} onChange={e=>setParts(parts.map((p,i)=>i===index?{...p,due_date:e.target.value}:p))}/></label></div>)}</div>
 {!matches&&<p role="alert">A soma das parcelas ({money.format(sum)}) deve ser igual a {money.format(total)}.</p>}
 </div><footer><button className="button secondary" disabled={saving} onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving||!valid} onClick={()=>void save()}>{saving?'Salvando…':'Salvar parcelamento'}</button></footer>
 </section></div>
}
