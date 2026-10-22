import {money} from '../lib/format'
import {monthlyClosings,monthlyLabels,type MonthlyOrigin} from '../lib/salesMonthly'
import type {SalesLead,SalesOrder,SalesRange} from '../lib/salesResults'

export function SalesMonthlyChart({orders,leads,range,onSelect}:{orders:SalesOrder[];leads:SalesLead[];range:SalesRange;onSelect:(title:string,ids:string[])=>void}){
 const months=monthlyClosings(orders,leads,range),max=Math.max(1,...months.map(m=>m.total))
 const label=(month:string)=>new Date(month+'-01T12:00:00').toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}).replace('.','')
 return <div className="sales-monthly">
  <div className="sales-monthly-legend">{(Object.keys(monthlyLabels) as MonthlyOrigin[]).map(key=><span key={key}><i className={'monthly-'+key}/>{monthlyLabels[key]}</span>)}</div>
  <div className="sales-monthly-scroll"><div className="sales-monthly-plot" role="group" aria-label="Pedidos por mês e mês de entrada do lead">{months.map(m=><div className="sales-monthly-column" key={m.month}>
   <div className="sales-monthly-track"><div className="sales-monthly-stack" style={{height:`${m.total/max*100}%`}}><strong className="sales-monthly-total">{money.format(m.groups.reduce((sum,g)=>sum+g.value,0))}</strong>{m.groups.filter(g=>g.orders.length).map(g=>{
    const share=(g.orders.length/m.total*100).toLocaleString('pt-BR',{maximumFractionDigits:1})
    const title=`${label(m.month)} · ${monthlyLabels[g.key]}: ${g.orders.length} pedido(s) · ${share}% · ${money.format(g.value)}`
    return <button type="button" key={g.key} className={'monthly-'+g.key} style={{height:`${g.orders.length/m.total*100}%`}} title={title} aria-label={title} onClick={()=>onSelect(label(m.month)+' — '+monthlyLabels[g.key],g.orders.map(o=>o.id))}>{g.orders.length/m.total*220*m.total/max>=22?g.orders.length:null}</button>
   })}</div></div><span className="sales-monthly-label">{label(m.month)}</span>
  </div>)}</div></div>
  {!orders.length&&<p className="sales-empty-note">Nenhum pedido fechado neste período.</p>}
 </div>
}
