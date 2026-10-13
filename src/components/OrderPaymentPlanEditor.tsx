import {useState} from 'react'
import {DecimalInput} from './DecimalInput'
import {supabase} from '../lib/supabase'
import {money} from '../lib/format'
import {useToast} from './ToastProvider'
import {distributeRevision,revisionSnapshot,updateRevisionAmount,type RevisionReceivable} from '../lib/receivableRevision'
import {newPaymentGroup,paymentMethods,isCredit,validPaymentPlan,type PaymentGroup} from '../lib/orderPaymentPlan'
export function OrderPaymentPlanEditor({organizationId,orderId,total,initial,rows=[],onSaved,onClose,disabled=false}:{organizationId:string;orderId:string;total:number;initial?:PaymentGroup[];rows?:RevisionReceivable[];onSaved:()=>Promise<void>;onClose?:()=>void;disabled?:boolean}){
 const today=new Date().toISOString().slice(0,10),{show}=useToast()
 const [groups,setGroups]=useState<PaymentGroup[]>(()=>initial?.length?initial:rows.length?[{...newPaymentGroup(total,rows[0].due_date||today,rows[0].payment_method||'PIX'),installments:rows.length,parts:rows.map(r=>({amount:Number(r.amount),due_date:r.due_date||today}))}]:[newPaymentGroup(total,today)])
 const [saving,setSaving]=useState(false),valid=validPaymentPlan(groups,total)
 const change=(index:number,patch:Partial<PaymentGroup>,redistribute=false)=>setGroups(current=>current.map((g,i)=>i===index?{...g,...patch,...(redistribute?{parts:distributeRevision(patch.amount??g.amount,patch.installments??g.installments,patch.due_date??g.due_date)}:{})}:g))
 const save=async()=>{
  if(!supabase||saving||disabled||!valid)return
  setSaving(true)
  try{const {error}=await supabase.rpc('set_order_payment_plan',{org_id:organizationId,target_order_id:orderId,new_plan:groups,expected_receivables:revisionSnapshot(rows)});if(error)throw error;await onSaved();show('Formas de pagamento e recebimentos configurados.','success');onClose?.()}
  catch{show('Não foi possível salvar. Confira os valores ou reabra a tela caso o financeiro tenha sido alterado.','error')}
  finally{setSaving(false)}
 }
 return <div className="form-grid">
 <label className="field span-2">Formas de pagamento<select value={groups.length} disabled={saving||disabled} onChange={e=>{const count=Number(e.target.value);setGroups(current=>count===1?[{...current[0],amount:total,parts:distributeRevision(total,current[0].installments,current[0].due_date)}]:[{...current[0],amount:Math.floor(total*50)/100,parts:distributeRevision(Math.floor(total*50)/100,current[0].installments,current[0].due_date)},newPaymentGroup(Number((total-Math.floor(total*50)/100).toFixed(2)),today,'Cartão de crédito')])}}><option value="1">Uma forma de pagamento</option><option value="2">Duas formas de pagamento</option></select></label>
 {groups.map((group,index)=><section className="panel span-2" key={index} style={{padding:16}}><strong>Pagamento {index+1}</strong><div className="form-grid">
 <label className="field">Forma de pagamento<select value={group.method} disabled={saving} onChange={e=>change(index,{method:e.target.value,fee:0},true)}>{paymentMethods.map(method=><option key={method}>{method}</option>)}</select></label>
 <label className="field">Valor acordado (R$)<DecimalInput value={group.amount} decimalScale={2} disabled={saving} onValueChange={amount=>change(index,{amount},true)}/></label>
 <label className="field">{isCredit(group.method)?'Parcelas no cartão para o cliente':'Quantidade de parcelas'}<input type="number" min="1" max="60" value={group.installments} disabled={saving} onChange={e=>change(index,{installments:Math.max(1,Math.min(60,Number(e.target.value)||1))},true)}/></label>
 <label className="field">{isCredit(group.method)?'Data do crédito antecipado':'Primeiro vencimento'}<input type="date" value={group.due_date} disabled={saving} onChange={e=>change(index,{due_date:e.target.value},true)}/></label>
 {isCredit(group.method)?<><label className="field">Taxa da operadora (R$)<DecimalInput value={group.fee} decimalScale={2} disabled={saving} onValueChange={fee=>change(index,{fee})}/></label><label className="field">Líquido a receber<input readOnly value={money.format(group.amount-group.fee)}/></label><small className="span-2">O financeiro terá um único recebimento. O cliente verá o parcelamento no cartão, sem taxa ou informação de antecipação.</small></>:group.installments>1&&<div className="order-payment-parts span-2">{group.parts.map((part,i)=><div className="order-payment-part" key={i}><strong>Parcela {i+1}</strong><label className="field">Percentual (%)<DecimalInput value={group.amount?part.amount/group.amount*100:0} decimalScale={2} onValueChange={p=>change(index,{parts:updateRevisionAmount(group.parts,group.amount,i,Math.round(group.amount*p)/100)})}/></label><label className="field">Valor (R$)<DecimalInput value={part.amount} decimalScale={2} onValueChange={amount=>change(index,{parts:updateRevisionAmount(group.parts,group.amount,i,amount)})}/></label><label className="field">Vencimento<input type="date" value={part.due_date} onChange={e=>change(index,{parts:group.parts.map((p,n)=>n===i?{...p,due_date:e.target.value}:p)})}/></label></div>)}</div>}
 </div></section>)}
 <p className="span-2" role={valid?undefined:'alert'}>Total dos pagamentos: {money.format(groups.reduce((s,g)=>s+g.amount,0))} · Total do pedido: {money.format(total)}{!valid&&' — confira os valores, parcelas, taxas e datas.'}</p>
 <div className="span-2">{onClose&&<button className="button secondary" disabled={saving} onClick={onClose}>Cancelar</button>} <button className="button primary" disabled={saving||disabled||!valid} onClick={()=>void save()}>{saving?'Salvando…':rows.length?'Salvar pagamentos e financeiro':'Gerar contas a receber'}</button></div>
 </div>
}
