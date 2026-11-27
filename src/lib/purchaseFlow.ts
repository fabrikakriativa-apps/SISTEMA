import {lineTotal} from './purchasingWorkspace'

// Allocate integer cents, including the remainder, so finance and item costs agree.
export function distributePurchaseTotal(total:number, lines:{id:string;quantity:number;unit_cost:number;actual_total?:number|null}[]){
 if(!Number.isFinite(total)||total<0||!lines.length)throw new Error('Total inválido')
 const cents=Math.round(total*100),weights=lines.map(l=>Math.max(0,lineTotal(l))),sum=weights.reduce((a,b)=>a+b,0)
 const shares=weights.map((w,index)=>({index,raw:sum?cents*w/sum:cents/lines.length}))
 const amounts=shares.map(s=>Math.floor(s.raw)),remainder=cents-amounts.reduce((a,b)=>a+b,0)
 shares.sort((a,b)=>(b.raw-Math.floor(b.raw))-(a.raw-Math.floor(a.raw))||a.index-b.index).slice(0,remainder).forEach(s=>amounts[s.index]++)
 return Object.fromEntries(lines.map((l,i)=>[l.id,amounts[i]/100]))
}
export function purchaseFinancialLabel(p:{invoice_on_delivery?:boolean;payables:{status:string;amount?:number;paid_amount?:number}[];purchase_items:{invoice_id?:string|null}[]}){
 const bills=p.payables.filter(b=>b.status!=='cancelled')
 if(!bills.length)return p.invoice_on_delivery?'A faturar na entrega':'Financeiro não gerado'
 const paid=bills.reduce((s,b)=>s+Number(b.paid_amount??0),0),amount=bills.reduce((s,b)=>s+Number(b.amount??0),0)
 const pending=p.invoice_on_delivery&&p.purchase_items.some(l=>!l.invoice_id)
 if(pending)return 'Faturado parcialmente'
 return amount>0&&paid>=amount?'Pago':paid>0?'Parcialmente pago':'Em aberto'
}
export function purchaseDeliveryLabel(status:string){return ({draft:'Pendente',awaiting_delivery:'Aguardando',delayed:'Aguardando · atrasado',completed:'Concluído',cancelled:'Cancelado',returned:'Devolvido'} as Record<string,string>)[status]??status}
