import { useCallback, useEffect, useMemo, useState } from 'react'
import { PackageCheck, Search } from 'lucide-react'
import { Page } from '../components/Page'
import { useAccess } from '../components/AuthorizedAccess'
import { money } from '../lib/format'
import { supabase } from '../lib/supabase'

type OrderStatus='awaiting_finance'|'awaiting_purchase'|'awaiting_supplier'|'preparing'|'ready_to_schedule'|'scheduled'|'partially_completed'|'completed'|'pending_issue'|'cancelled'
type Order={id:string;display_number:string;status:OrderStatus;payment_terms:string|null;promised_date:string|null;total:number;created_at:string;client:{name:string}|null;budget:{display_number:string}|null;order_items:{id:string}[]}
const labels:Record<OrderStatus,string>={awaiting_finance:'Aguardando financeiro',awaiting_purchase:'Aguardando compra',awaiting_supplier:'Aguardando fornecedor',preparing:'Em preparação',ready_to_schedule:'Para agendar',scheduled:'Agendado',partially_completed:'Parcialmente concluído',completed:'Concluído',pending_issue:'Com pendência',cancelled:'Cancelado'}

export function Orders(){
  const access=useAccess(),[orders,setOrders]=useState<Order[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState('')
  const load=useCallback(async()=>{
    if(!supabase||!access)return
    setLoading(true);setError('')
    const {data,error}=await supabase.from('orders').select('id,display_number,status,payment_terms,promised_date,total,created_at,client:clients!orders_client_id_fkey(name),budget:budgets!orders_budget_id_fkey(display_number),order_items(id)').eq('organization_id',access.organizationId).order('number',{ascending:false}).abortSignal(AbortSignal.timeout(15000))
    if(error)setError('Não foi possível carregar os pedidos. Tente novamente.')
    else setOrders((data??[]) as unknown as Order[])
    setLoading(false)
  },[access])
  useEffect(()=>{void load()},[load])
  const filtered=useMemo(()=>{const term=search.trim().toLocaleLowerCase('pt-BR');return term?orders.filter(x=>`${x.display_number} ${x.client?.name??''} ${x.budget?.display_number??''} ${labels[x.status]}`.toLocaleLowerCase('pt-BR').includes(term)):orders},[orders,search])
  const active=orders.filter(x=>!['completed','cancelled'].includes(x.status)).length,awaitingPurchase=orders.filter(x=>x.status==='awaiting_purchase').length,scheduling=orders.filter(x=>x.status==='ready_to_schedule').length,issues=orders.filter(x=>x.status==='pending_issue').length
  return <Page title="Pedidos" description="Toda a operação acompanha o pedido e seus itens — sem módulos separados de produção e entrega."><section className="status-grid"><article><span>Ativos</span><strong>{active}</strong></article><article><span>Aguardando compra</span><strong>{awaitingPurchase}</strong></article><article><span>Para agendar</span><strong>{scheduling}</strong></article><article><span>Com pendência</span><strong>{issues}</strong></article></section><section className="panel"><div className="toolbar"><label className="search"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pedido, orçamento, cliente ou status"/></label><span>{filtered.length} pedido(s)</span></div>{error?<div className="empty-state"><PackageCheck/><strong>{error}</strong><button className="button secondary" onClick={()=>void load()}>Tentar novamente</button></div>:loading?<p className="panel-message">Carregando pedidos…</p>:filtered.length?<div className="table-wrap"><table><thead><tr><th>Pedido / cliente</th><th>Origem</th><th>Criação</th><th>Itens</th><th>Valor</th><th>Status</th></tr></thead><tbody>{filtered.map(order=><tr key={order.id}><td><strong>{order.display_number}</strong><small>{order.client?.name??'Cliente não informado'}</small></td><td>{order.budget?.display_number??'—'}</td><td>{new Date(order.created_at).toLocaleDateString('pt-BR')}</td><td>{order.order_items.length}</td><td><strong>{money.format(Number(order.total))}</strong></td><td><span className={`badge ${order.status==='completed'?'green':''}`}>{labels[order.status]}</span></td></tr>)}</tbody></table></div>:<div className="empty-state"><PackageCheck/><strong>Nenhum pedido neste ambiente</strong><span>Pedidos serão criados exclusivamente a partir de uma versão enviada e aprovada do orçamento.</span></div>}</section></Page>
}
