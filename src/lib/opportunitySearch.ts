import {matchesSearch,normalizeSearchText} from './searchOptions'
import {linkedBudgetIds,type SalesLead,type SalesOrder} from './salesResults'
const normalize=normalizeSearchText
export function matchesOpportunitySearch(lead:SalesLead&{phone?:string|null;email?:string|null},orders:SalesOrder[],query:string){
 const needle=normalize(query)
 if(!needle)return true
 if(matchesSearch([lead.name,lead.phone,lead.email,lead.origin,lead.capture_source,lead.campaign].filter(Boolean).join(' '),needle))return true
 const ids=linkedBudgetIds(lead)
 const short=needle.match(/^(?:(?:pedido|ped)\s*[-#]?\s*)?0*(\d+)$/)
 return orders.some(o=>o.status!=='cancelled'&&ids.includes(o.budget_id)&&(matchesSearch(o.display_number,needle)||Boolean(short&&Number(o.display_number.split('-').at(-1))===Number(short[1]))))
}

