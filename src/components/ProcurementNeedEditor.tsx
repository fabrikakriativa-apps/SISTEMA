import { useEffect,useState } from 'react'
import { X,Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from './ToastProvider'
import { readRecovery,useRecoveryDraft,clearRecovery } from '../lib/recoveryDraft'
import {SearchSelect} from './SearchSelect'
import {loadAllPages} from '../lib/loadAllPages'
export type EditableNeed={id:string;order_item_id:string;supply_id:string|null;supplier_name?:string;description:string;quantity:number;unit:string;unit_cost:number;deadline:string|null}
type Item={id:string;snapshot:{description?:string};order:{display_number:string;client:{name:string}|null}|null}
type Supply={id:string;code:string;name:string;category:string;usage_unit:string;current_cost:number;collection_name:string|null}
const itemLabel=(item:Item)=>[item.order?.display_number,item.order?.client?.name,item.snapshot.description].filter(Boolean).join(' · ')
const supplyLabel=(supply:Supply)=>`${supply.name} · ${supply.code}`
export function ProcurementNeedEditor({organizationId,need,onClose,onSaved}:{organizationId:string;need:EditableNeed|null;onClose:()=>void;onSaved:()=>Promise<void>}){
 const key=`${organizationId}:need:${need?.id??'new'}`
 const [form,setForm]=useState(()=>readRecovery<EditableNeed>(key)??need??{id:'',order_item_id:'',supply_id:null,description:'',quantity:1,unit:'un',unit_cost:0,deadline:null})
 const [items,setItems]=useState<Item[]>([]),[supplies,setSupplies]=useState<Supply[]>([]),[saving,setSaving]=useState(false),[confirmDelete,setConfirmDelete]=useState(false),{show}=useToast()
 const [itemSearch,setItemSearch]=useState<string|null>(null),[supplySearch,setSupplySearch]=useState<string|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false)
 useRecoveryDraft(key,form)
 const [supplierLoading,setSupplierLoading]=useState(false),[supplierError,setSupplierError]=useState(false)
 const selectSupply=async(id:string)=>{
  const supply=supplies.find(x=>x.id===id)!;setSupplySearch(supplyLabel(supply));setForm(current=>({...current,supply_id:id,description:supply.name,unit:supply.usage_unit,unit_cost:Number(supply.current_cost),supplier_name:''}));setSupplierLoading(true);setSupplierError(false)
  try{const {data,error}=await supabase!.from('supplies').select('import_details').eq('organization_id',organizationId).eq('id',id).single();if(error)throw error;const name=String(data?.import_details?.Fornecedor??'');setForm(current=>current.supply_id===id?{...current,supplier_name:name}:current)}catch{setSupplierError(true);show('Não foi possível carregar o fornecedor. Informe o nome manualmente.','error')}finally{setSupplierLoading(false)}
 }
 const [category,setCategory]=useState('')
 const categories=[...new Set(supplies.map(supply=>supply.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'))
 const filteredSupplies=category?supplies.filter(supply=>supply.category===category):supplies
 useEffect(()=>{if(!supabase)return;let active=true;setLoading(true);void Promise.all([
 loadAllPages<Item>(async(from,to)=>{const r=await supabase!.from('order_items').select('id,snapshot,order:orders!order_items_order_id_fkey!inner(display_number,status,client:clients!orders_client_id_fkey(name))').eq('organization_id',organizationId).not('order.status','in','(cancelled,completed)').order('id').range(from,to);return {data:r.data as unknown as Item[]|null,error:r.error}}),
 loadAllPages<Supply>((from,to)=>supabase!.from('supplies').select('id,code,name,category,usage_unit,current_cost,collection_name:import_details->>"Catálogo"').eq('organization_id',organizationId).eq('active',true).order('name').order('id').range(from,to))
 ]).then(([a,b])=>{if(!active)return;setLoadError(Boolean(a.error||b.error));if(a.error||b.error)show('Não foi possível carregar a lista completa de itens e insumos. Feche e tente novamente.','error');setItems(a.data??[]);setSupplies(b.data??[]);setLoading(false)});return()=>{active=false}},[organizationId,show])
 const save=async(remove=false)=>{
 if(!supabase||saving||loading||loadError||supplierLoading)return;
 if(!remove&&!form.order_item_id){show('Selecione um item do pedido nos resultados da busca.','error');return}
 // A typed name without a catalog selection is a valid loose material.
 setSaving(true)
 const {error}=await supabase.rpc('save_procurement_need_supplier',{org_id:organizationId,target_need_id:need?.id??null,target_order_item_id:form.order_item_id,new_supply_id:form.supply_id||null,new_description:form.description,new_quantity:Number(form.quantity),new_unit:form.unit,new_unit_cost:Number(form.unit_cost),new_deadline:form.deadline||null,new_supplier_name:form.supplier_name??'',remove_need:remove})
 if(error)show('Não foi possível salvar. Itens já comprados devem ser ajustados no pedido ao fornecedor.','error')
 else{clearRecovery(key);await onSaved();show(remove?'Item de compra removido.':'Item de compra salvo.','success');onClose()}setSaving(false)
 }
 return <div className="dialog-backdrop"><form className="dialog" onSubmit={e=>{e.preventDefault();void save()}}><header><div><h2>{need?'Editar item de compra':'Adicionar item de compra'}</h2><p>Defina o material que precisa comprar para o item do pedido.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X/></button></header><div className="form-grid">
 <div className="field span-2"><span>Item do pedido</span><SearchSelect ariaLabel="Buscar item do pedido" disabled={loading||saving||loadError} value={itemSearch??(items.find(x=>x.id===form.order_item_id)?itemLabel(items.find(x=>x.id===form.order_item_id)!):'')} options={items.map(item=>({id:item.id,label:itemLabel(item)}))} placeholder={loading?'Carregando pedidos…':'Digite número do pedido, cliente ou descrição'} onChange={value=>{setItemSearch(value);setForm({...form,order_item_id:''})}} onSelect={option=>{setItemSearch(option.label);setForm({...form,order_item_id:option.id})}}/></div>
 <label className="field span-2">Categoria<select disabled={loading||saving||loadError} value={category} onChange={e=>setCategory(e.target.value)}><option value="">Todas</option>{categories.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
 <div className="field span-2"><span>Insumo cadastrado</span><SearchSelect ariaLabel="Buscar insumo cadastrado" disabled={loading||saving||loadError} value={supplySearch??(supplies.find(x=>x.id===form.supply_id)?supplyLabel(supplies.find(x=>x.id===form.supply_id)!):'')} options={filteredSupplies.map(supply=>({id:supply.id,label:supplyLabel(supply),detail:supply.category}))} placeholder={loading?'Carregando insumos…':'Digite nome, código ou categoria do insumo'} onChange={value=>{setSupplySearch(value);setForm({...form,supply_id:null})}} onSelect={option=>{void selectSupply(option.id)}}/><button type="button" className="button secondary" disabled={saving||supplierLoading} onClick={()=>{setSupplySearch('');setForm({...form,supply_id:null})}}>Usar produto ou material avulso</button></div>
 <label className="field span-2">Fornecedor<input maxLength={300} disabled={saving||supplierLoading} value={form.supplier_name??''} placeholder={supplierLoading?'Carregando fornecedor…':'Informe o fornecedor'} onChange={e=>{setSupplierError(false);setForm({...form,supplier_name:e.target.value})}}/>{supplierError&&<small>Informe o fornecedor manualmente.</small>}</label>
 <label className="field span-2">Coleção<input readOnly value={supplies.find(x=>x.id===form.supply_id)?.collection_name??''} placeholder={loading?'Carregando coleção…':'Sem coleção cadastrada'}/></label>
 <label className="field span-2">Descrição<textarea required value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
 <label className="field">Quantidade<input type="number" required min="0.001" step="any" value={form.quantity} onChange={e=>setForm({...form,quantity:Number(e.target.value)})}/></label>
 <label className="field">Unidade<input required value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}/></label>
 <label className="field">Custo unitário<input type="number" required min="0" step="0.01" value={form.unit_cost} onChange={e=>setForm({...form,unit_cost:Number(e.target.value)})}/></label>
 <label className="field">Data limite<input type="date" value={form.deadline??''} onChange={e=>setForm({...form,deadline:e.target.value||null})}/></label>
 {confirmDelete&&<p className="span-2">Remover este material da lista de compras? O item do pedido será preservado.</p>}
 </div><footer>{need&&<button type="button" className="button secondary" disabled={saving} onClick={()=>confirmDelete?void save(true):setConfirmDelete(true)}><Trash2/>{confirmDelete?'Confirmar exclusão':'Excluir item de compra'}</button>}<button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}>{saving?'Salvando…':'Salvar'}</button></footer></form></div>
}
