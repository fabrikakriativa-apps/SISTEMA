import { useEffect,useState } from 'react'
import { X,Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from './ToastProvider'
import { readRecovery,useRecoveryDraft,clearRecovery } from '../lib/recoveryDraft'
export type EditableNeed={id:string;order_item_id:string;supply_id:string|null;description:string;quantity:number;unit:string;unit_cost:number;deadline:string|null}
type Item={id:string;snapshot:{description?:string};order:{display_number:string;client:{name:string}|null}|null}
type Supply={id:string;name:string;usage_unit:string;current_cost:number}
export function ProcurementNeedEditor({organizationId,need,onClose,onSaved}:{organizationId:string;need:EditableNeed|null;onClose:()=>void;onSaved:()=>Promise<void>}){
 const key=`${organizationId}:need:${need?.id??'new'}`
 const [form,setForm]=useState(()=>readRecovery<EditableNeed>(key)??need??{id:'',order_item_id:'',supply_id:null,description:'',quantity:1,unit:'un',unit_cost:0,deadline:null})
 const [items,setItems]=useState<Item[]>([]),[supplies,setSupplies]=useState<Supply[]>([]),[saving,setSaving]=useState(false),[confirmDelete,setConfirmDelete]=useState(false),{show}=useToast()
 useRecoveryDraft(key,form)
 useEffect(()=>{if(!supabase)return;void Promise.all([
 supabase.from('order_items').select('id,snapshot,order:orders!order_items_order_id_fkey!inner(display_number,status,client:clients!orders_client_id_fkey(name))').eq('organization_id',organizationId).not('order.status','in','(cancelled,completed)'),
 supabase.from('supplies').select('id,name,usage_unit,current_cost').eq('organization_id',organizationId).eq('active',true).order('name')
 ]).then(([a,b])=>{if(a.error||b.error)show('Não foi possível carregar itens e insumos.','error');setItems((a.data??[]) as unknown as Item[]);setSupplies((b.data??[]) as Supply[])})},[organizationId,show])
 const save=async(remove=false)=>{
 if(!supabase||saving)return;setSaving(true)
 const {error}=await supabase.rpc('save_procurement_need',{org_id:organizationId,target_need_id:need?.id??null,target_order_item_id:form.order_item_id,new_supply_id:form.supply_id||null,new_description:form.description,new_quantity:Number(form.quantity),new_unit:form.unit,new_unit_cost:Number(form.unit_cost),new_deadline:form.deadline||null,remove_need:remove})
 if(error)show('Não foi possível salvar. Necessidades já compradas devem ser ajustadas no pedido ao fornecedor.','error')
 else{clearRecovery(key);await onSaved();show(remove?'Necessidade removida.':'Necessidade de compra salva.','success');onClose()}setSaving(false)
 }
 return <div className="dialog-backdrop"><form className="dialog" onSubmit={e=>{e.preventDefault();void save()}}><header><div><h2>{need?'Editar necessidade':'Nova necessidade de compra'}</h2><p>Defina o que precisa comprar para o item do pedido.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X/></button></header><div className="form-grid">
 <label className="field span-2">Item do pedido<select required value={form.order_item_id} onChange={e=>setForm({...form,order_item_id:e.target.value})}><option value="">Selecione</option>{items.map(item=><option key={item.id} value={item.id}>{item.order?.display_number} · {item.order?.client?.name} · {item.snapshot.description}</option>)}</select></label>
 <label className="field span-2">Insumo cadastrado<select value={form.supply_id??''} onChange={e=>{const supply=supplies.find(x=>x.id===e.target.value);setForm({...form,supply_id:supply?.id??null,...(supply?{description:supply.name,unit:supply.usage_unit,unit_cost:Number(supply.current_cost)}:{})})}}><option value="">Produto ou material avulso</option>{supplies.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
 <label className="field span-2">Descrição<textarea required value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
 <label className="field">Quantidade<input type="number" required min="0.001" step="any" value={form.quantity} onChange={e=>setForm({...form,quantity:Number(e.target.value)})}/></label>
 <label className="field">Unidade<input required value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}/></label>
 <label className="field">Custo unitário<input type="number" required min="0" step="0.01" value={form.unit_cost} onChange={e=>setForm({...form,unit_cost:Number(e.target.value)})}/></label>
 <label className="field">Data limite<input type="date" value={form.deadline??''} onChange={e=>setForm({...form,deadline:e.target.value||null})}/></label>
 {confirmDelete&&<p className="span-2">Remover esta necessidade da lista? O item do pedido será preservado.</p>}
 </div><footer>{need&&<button type="button" className="button secondary" disabled={saving} onClick={()=>confirmDelete?void save(true):setConfirmDelete(true)}><Trash2/>{confirmDelete?'Confirmar exclusão':'Excluir necessidade'}</button>}<button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}>{saving?'Salvando…':'Salvar'}</button></footer></form></div>
}
