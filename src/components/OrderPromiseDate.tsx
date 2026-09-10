import { useState } from 'react'
import { CalendarDays, X } from 'lucide-react'
import { useToast } from './ToastProvider'
import { supabase } from '../lib/supabase'

type Props={organizationId:string;order:{id:string;display_number:string;promised_date:string|null;client_address:string|null;client:{address:string|null;city:string|null}|null};onClose:()=>void;onSaved:()=>Promise<void>}

export function OrderPromiseDate({organizationId,order,onClose,onSaved}:Props){
 const {show}=useToast(),[date,setDate]=useState(order.promised_date??''),[address,setAddress]=useState(order.client_address||[order.client?.address,order.client?.city].filter(Boolean).join(' · ')),[saving,setSaving]=useState(false)
 const save=async()=>{if(!supabase||!date||saving)return;setSaving(true);const {error}=await supabase.rpc('set_order_delivery_details',{org_id:organizationId,target_order_id:order.id,new_client_address:address,new_promised_date:date});if(error)show('Não foi possível salvar os dados de entrega.','error');else{await onSaved();show('Dados de entrega atualizados.','success');onClose()}setSaving(false)}
 return <div className="dialog-backdrop"><div className="dialog"><header><div className="dialog-icon"><CalendarDays/></div><div><span className="eyebrow">Pedido do cliente</span><h2>Dados de entrega</h2><p>{order.display_number} · a data será comparada com a previsão do fornecedor.</p></div><button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}><X/></button></header><div className="form-grid"><label className="field span-2">Endereço de entrega<input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Endereço + cidade / UF"/><small>Este endereço fica registrado no pedido, mesmo se o cadastro do cliente mudar.</small></label><label className="field span-2">Entrega combinada com o cliente<input required type="date" value={date} onChange={e=>setDate(e.target.value)}/><small>Pode ser alterada posteriormente caso o combinado seja reprogramado.</small></label></div><footer><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button type="button" className="button primary" disabled={!date||saving} onClick={()=>void save()}>{saving?'Salvando…':'Salvar dados'}</button></footer></div></div>
}
