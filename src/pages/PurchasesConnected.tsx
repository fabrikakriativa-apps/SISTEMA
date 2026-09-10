import { useCallback, useEffect, useMemo, useState } from 'react'
import { ShoppingCart } from 'lucide-react'
import { Page } from '../components/Page'
import { PurchaseConfirmation, type PurchaseForConfirmation } from '../components/PurchaseConfirmation'
import { useAccess } from '../components/AuthorizedAccess'
import { useToast } from '../components/ToastProvider'
import { money } from '../lib/format'
import {purchaseStatusLabels,purchaseStatusOptions,type PurchaseStatus} from '../lib/purchaseStatus'
import { supabase } from '../lib/supabase'

type Supplier={id:string;name:string}
type Need={id:string;kind:'whole_item'|'supply';description:string;quantity:number;unit:string;unit_cost:number;supply_id:string|null;order_item:{order_id:string;snapshot:{description?:string;environment?:string};order:{display_number:string;client:{name:string}|null}|null;budget_item:{family:{name:string;form_key:string}|null}|null}}
type Purchase=PurchaseForConfirmation&{status:PurchaseStatus;created_at:string;supplier:{name:string}|null;purchase_items:(PurchaseForConfirmation['purchase_items'][number]&{id:string})[]}

export function PurchasesConnected(){
 const access=useAccess(),{show}=useToast(),[tab,setTab]=useState<'needs'|'orders'>('needs'),[needs,setNeeds]=useState<Need[]>([]),[orders,setOrders]=useState<Purchase[]>([]),[suppliers,setSuppliers]=useState<Supplier[]>([]),[selected,setSelected]=useState<string[]>([]),[detail,setDetail]=useState<Purchase|null>(null),[requestedStatus,setRequestedStatus]=useState(''),[creating,setCreating]=useState(false),[mode,setMode]=useState<'made_to_order'|'immediate'>('made_to_order'),[supplier,setSupplier]=useState(''),[loading,setLoading]=useState(true)
 const load=useCallback(async()=>{if(!supabase||!access)return;setLoading(true);await supabase.rpc('refresh_purchase_delays',{org_id:access.organizationId});const [a,b,c]=await Promise.all([
  supabase.from('procurement_needs').select('id,kind,description,quantity,unit,unit_cost,supply_id,order_item:order_items!procurement_needs_order_item_id_fkey(order_id,snapshot,order:orders!order_items_order_id_fkey(display_number,client:clients!orders_client_id_fkey(name)),budget_item:budget_items!order_items_budget_item_id_fkey(family:item_families!budget_items_family_id_fkey(name,form_key)))').eq('organization_id',access.organizationId).eq('status','awaiting_purchase'),
  supabase.from('purchases').select('id,display_number,mode,status,total,created_at,supplier_id,external_number,ordered_at,supplier_due_date,payment_terms,supplier:suppliers!purchases_supplier_id_fkey(name),purchase_items:purchase_items!purchase_items_purchase_id_fkey(id,description,order_item:order_items!purchase_items_order_item_id_fkey(order:orders!order_items_order_id_fkey(display_number,promised_date)))').eq('organization_id',access.organizationId).order('number',{ascending:false}),
  supabase.from('suppliers').select('id,name').eq('organization_id',access.organizationId).eq('active',true).order('name')
 ]);if(a.error||b.error||c.error)show('Não foi possível carregar todos os dados de Compras. Tente novamente.','error');setNeeds((a.data??[]) as unknown as Need[]);setOrders((b.data??[]) as unknown as Purchase[]);setSuppliers((c.data??[]) as Supplier[]);setLoading(false)},[access,show])
 useEffect(()=>{void load()},[load])
 const chosen=useMemo(()=>needs.filter(x=>selected.includes(x.id)),[needs,selected])
 const toggle=(item:Need)=>{if(selected.includes(item.id)){setSelected(selected.filter(id=>id!==item.id));return}const first=chosen[0],family=(x:Need)=>x.kind==='supply'?`supply:${x.supply_id??x.id}`:['curtain','blind'].includes(x.order_item.budget_item?.family?.form_key??'')?x.order_item.budget_item?.family?.form_key:'other';if(first&&first.order_item.order_id!==item.order_item.order_id){show('Selecione componentes de um único pedido do cliente.','info');return}if(first&&family(first)!==family(item)){show('Selecione componentes compatíveis para o mesmo pedido ao fornecedor.','info');return}setSelected([...selected,item.id])}
 const create=async()=>{if(!supabase||!access||creating||!selected.length)return;setCreating(true);const {error}=await supabase.rpc('create_supplier_purchase',{org_id:access.organizationId,selected_order_item_ids:selected,selected_supplier_id:supplier||null,purchase_mode:mode});if(error)show('Não foi possível criar o pedido de compra.','error');else{show('Pedido de compra criado.','success');setSelected([]);await load();setTab('orders')}setCreating(false)}
 const openStatus=(purchase:Purchase,next:PurchaseStatus)=>{if(next===purchase.status)return;setRequestedStatus(next);setDetail(purchase)}
 return <Page title="Compras" description="Necessidades dos pedidos, compras ao fornecedor e integração financeira.">
  <div className="finance-tabs"><button className={tab==='needs'?'active':''} onClick={()=>setTab('needs')}>Necessidades de compra</button><button className={tab==='orders'?'active':''} onClick={()=>setTab('orders')}>Pedidos aos fornecedores</button></div>
  {tab==='needs'?<section className="panel"><div className="toolbar"><span>{needs.length} item(ns) aguardando compra</span><select aria-label="Fornecedor do pedido" value={supplier} onChange={e=>setSupplier(e.target.value)}><option value="">Definir fornecedor depois</option>{suppliers.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="made_to_order">Sob encomenda</option><option value="immediate">Compra imediata</option></select><button className="button primary" disabled={!selected.length||creating} onClick={()=>void create()}><ShoppingCart/>{creating?'Criando pedido…':selected.length?`Criar pedido (${selected.length} ${selected.length===1?'item selecionado':'itens selecionados'})`:'Selecione os itens'}</button></div>{loading?<p className="panel-message">Carregando…</p>:<div className="table-wrap"><table><thead><tr><th></th><th>Pedido / cliente</th><th>Tipo / ambiente</th><th>Descrição</th><th>Qtd.</th><th>Custo</th></tr></thead><tbody>{needs.map(x=><tr key={x.id} className={selected.includes(x.id)?'selected-row':''} onClick={()=>toggle(x)}><td><input type="checkbox" checked={selected.includes(x.id)} readOnly/></td>
<td><strong>{x.order_item.order?.display_number}</strong><small>{x.order_item.order?.client?.name}</small></td>
<td><strong>{x.kind==='supply'?'Insumo':x.order_item.budget_item?.family?.name}</strong><small>{x.order_item.snapshot.environment||'A definir'}</small></td>
<td>{x.description}</td>
<td>{Number(x.quantity).toLocaleString('pt-BR')} {x.unit}</td>
<td><strong>{money.format(Number(x.quantity)*Number(x.unit_cost))}</strong></td>
</tr>)}</tbody></table>{!needs.length&&<div className="empty-state"><ShoppingCart/><strong>Nenhuma necessidade de compra</strong></div>}</div>}</section>:<section className="panel">{loading?<p className="panel-message">Carregando…</p>:<div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Fornecedor</th><th>Modalidade</th><th>Data</th><th>Itens</th><th>Total</th><th>Status</th></tr></thead><tbody>{orders.map(x=><tr className="clickable-row" key={x.id} onClick={()=>setDetail(x)}><td><strong>{x.display_number}</strong><small>{x.external_number||'Clique para confirmar'}</small></td>
<td>{x.supplier?.name??'A definir'}</td>
<td>{x.mode==='immediate'?'Imediata':'Sob encomenda'}</td>
<td>{new Date(x.created_at).toLocaleDateString('pt-BR')}</td>
<td>{x.purchase_items.length}</td>
<td><strong>{money.format(Number(x.total))}</strong></td>
<td><select className="status-select" aria-label={`Status de ${x.display_number}`} value={x.status} onClick={e=>e.stopPropagation()} onChange={e=>{e.stopPropagation();openStatus(x,e.target.value as PurchaseStatus)}}>{purchaseStatusOptions(x.status).map(status=><option key={status} value={status}>{purchaseStatusLabels[status]}</option>)}</select></td>
</tr>)}</tbody></table>{!orders.length&&<div className="empty-state"><ShoppingCart/><strong>Nenhum pedido ao fornecedor</strong></div>}</div>}</section>}
  {detail&&access&&<PurchaseConfirmation organizationId={access.organizationId} purchase={detail} suppliers={suppliers} requestedStatus={requestedStatus} onClose={()=>{setDetail(null);setRequestedStatus('')}} onSaved={load}/>}
 </Page>
}
