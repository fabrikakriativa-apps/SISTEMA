import {linkedBudgetIds,type SalesLead,type SalesOrder} from './salesResults'
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim()
export function matchesOpportunitySearch(lead:SalesLead&{phone?:string|null;email?:string|null},orders:SalesOrder[],query:string){
 const needle=normalize(query)
 if(!needle)return true
 if(normalize([lead.name,lead.phone,lead.email,lead.origin,lead.capture_source,lead.campaign].filter(Boolean).join(' ')).includes(needle))return true
 const ids=linkedBudgetIds(lead)
 const short=needle.match(/^(?:(?:pedido|ped)\s*[-#]?\s*)?0*(\d+)$/)
 return orders.some(o=>o.status!=='cancelled'&&ids.includes(o.budget_id)&&(normalize(o.display_number).includes(needle)||Boolean(short&&Number(o.display_number.split('-').at(-1))===Number(short[1]))))
}

