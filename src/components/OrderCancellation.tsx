import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useToast } from './ToastProvider'
import { supabase } from '../lib/supabase'

type Props = { organizationId:string; order:{id:string;display_number:string}; onClose:()=>void; onSaved:()=>Promise<void> }

export function OrderCancellation({organizationId,order,onClose,onSaved}:Props) {
  const {show} = useToast()
  const [reason,setReason] = useState('')
  const [saving,setSaving] = useState(false)
  const cancel = async () => {
    if(!supabase || saving || reason.trim().length < 5) return
    setSaving(true)
    const {error} = await supabase.rpc('cancel_customer_order',{org_id:organizationId,target_order_id:order.id,new_reason:reason})
    if(error) {
      const message = error.message.includes('receipts') ? 'Existem recebimentos. Estorne-os no Financeiro antes de cancelar.' : error.message.includes('supplier payments') ? 'Existem pagamentos ao fornecedor. Estorne-os no Financeiro antes de cancelar.' : error.message.includes('requires a return') ? 'Há compras já recebidas. Registre a devolução antes de cancelar.' : error.message.includes('completed') ? 'Um pedido concluído não pode ser cancelado.' : 'Não foi possível cancelar o pedido.'
      show(message,'error')
    } else {
      show('Pedido e registros posteriores cancelados.','success')
      await onSaved()
      onClose()
    }
    setSaving(false)
  }
  return <div className="dialog-backdrop"><section className="dialog order-cancellation-dialog">
    <header><div><span className="eyebrow">Cancelamento completo</span><h2>Cancelar {order.display_number}</h2><p>O cancelamento será aplicado aos itens, parcelas pendentes, compras abertas e compromissos vinculados.</p></div><button className="icon-button" aria-label="Fechar" onClick={onClose}><X/></button></header>
    <div className="order-cancellation-content"><div className="inline-warning"><AlertTriangle/><span>Pagamentos, recebimentos ou mercadorias já recebidas precisam ser revertidos antes.</span></div><label className="field">Motivo do cancelamento<input autoFocus required minLength={5} value={reason} onChange={event => setReason(event.target.value)} placeholder="Informe o motivo"/></label></div>
    <footer><button className="button secondary" onClick={onClose}>Manter pedido</button><button className="button danger" disabled={saving || reason.trim().length < 5} onClick={() => void cancel()}>{saving ? 'Cancelando…' : 'Cancelar pedido'}</button></footer>
  </section></div>
}
