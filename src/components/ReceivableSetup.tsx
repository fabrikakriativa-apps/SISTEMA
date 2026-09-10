import { useState, type FormEvent } from 'react'
import { CreditCard, X } from 'lucide-react'
import { useToast } from './ToastProvider'
import { supabase } from '../lib/supabase'
import { money } from '../lib/format'

type SetupOrder={id:string;display_number:string;total:number;payment_terms:string|null}
const today=()=>new Date().toISOString().slice(0,10)

export function ReceivableSetup({organizationId,order,onClose,onSaved}:{organizationId:string;order:SetupOrder;onClose:()=>void;onSaved:()=>Promise<void>}){
  const {show}=useToast(),[installments,setInstallments]=useState(1),[firstDue,setFirstDue]=useState(today()),[method,setMethod]=useState('PIX'),[saving,setSaving]=useState(false)
  const amount=Number(order.total)/Math.max(1,installments)
  const submit=async(e:FormEvent)=>{
    e.preventDefault();if(!supabase||saving)return
    setSaving(true)
    const {error}=await supabase.rpc('configure_order_receivables',{org_id:organizationId,target_order_id:order.id,installment_count:installments,first_due_date:firstDue,payment_method:method})
    if(error)show(error.code==='23514'?'Este pedido já foi configurado ou os dados informados são inválidos.':'Não foi possível gerar as parcelas. Nenhuma alteração foi realizada.','error')
    else {await onSaved();onClose();show('Contas a receber geradas e itens liberados para Compras.','success')}
    setSaving(false)
  }
  return <div className="dialog-backdrop"><form className="dialog" onSubmit={submit}><header><div className="dialog-icon"><CreditCard/></div><div><span className="eyebrow">Financeiro do pedido</span><h2>Configurar recebimento</h2><p>{order.display_number} · total {money.format(Number(order.total))}</p></div><button type="button" className="icon-button" onClick={onClose}><X/></button></header><div className="form-grid">{order.payment_terms&&<p className="span-2 finance-note"><strong>Condição comercial do orçamento:</strong> {order.payment_terms}</p>}<label className="field">Forma de recebimento<select value={method} onChange={e=>setMethod(e.target.value)}><option>PIX</option><option>Transferência bancária</option><option>Boleto</option><option>Cartão de crédito</option><option>Cartão de débito</option><option>Dinheiro</option><option>A combinar</option></select></label><label className="field">Quantidade de parcelas<input type="number" min="1" max="60" value={installments} onChange={e=>setInstallments(Math.max(1,Math.min(60,Number(e.target.value))))}/></label><label className="field">Primeiro vencimento<input required type="date" value={firstDue} onChange={e=>setFirstDue(e.target.value)}/></label><label className="field">Valor aproximado por parcela<input readOnly value={money.format(amount)}/></label><p className="span-2 finance-note">O sistema ajustará os centavos automaticamente para que a soma das parcelas seja exatamente igual ao total do pedido.</p></div><footer><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}>{saving?'Gerando parcelas…':'Gerar contas a receber'}</button></footer></form></div>
}
