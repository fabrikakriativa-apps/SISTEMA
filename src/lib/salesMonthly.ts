import {linkedBudgetIds,salesDay,salesOrderIssue,type SalesLead,type SalesOrder,type SalesRange} from './salesResults'

export const monthlyLabels={current:'Leads do próprio mês',previous:'Leads do mês anterior',older:'Leads de 2 meses ou mais',repeat:'Recompras',unknown:'Dados pendentes'}
export type MonthlyOrigin=keyof typeof monthlyLabels
export function monthlyClosings(orders:SalesOrder[],leads:SalesLead[],range:SalesRange){
 const owners=new Map<string,SalesLead>()
 for(const lead of leads)for(const id of linkedBudgetIds(lead))owners.set(id,lead)
 const index=(month:string)=>Number(month.slice(0,4))*12+Number(month.slice(5,7))-1
 const months=[]
 for(let n=index(range.from);n<=index(range.to);n++){
  const month=`${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`
  const rows=orders.filter(o=>salesDay(o.created_at).slice(0,7)===month)
  const category=(o:SalesOrder):MonthlyOrigin=>{
   const lead=owners.get(o.budget_id)
   if(salesOrderIssue(o,lead)||!lead?.received_on)return 'unknown'
   if(lead.customer_kind==='repeat')return 'repeat'
   const age=n-index(lead.received_on)
   return age===0?'current':age===1?'previous':'older'
  }
  const groups=(Object.keys(monthlyLabels) as MonthlyOrigin[]).map(key=>{
   const deals=rows.filter(o=>category(o)===key)
   return {key,orders:deals,value:deals.reduce((s,o)=>s+Number(o.total),0)}
  })
  months.push({month,total:rows.length,groups})
 }
 return months
}
