import {salesDay,type SalesLead,type SalesOrder,type SalesBudget,linkedBudgetIds} from './salesResults'
export type CommercialPhase='new'|'contacted'|'preparing'|'proposal_sent'|'negotiating'|'won'|'lost'
export const commercialLabels:Record<CommercialPhase,string>={new:'Novo lead',contacted:'Em atendimento',preparing:'Preparando proposta',proposal_sent:'Proposta enviada',negotiating:'Em negociação',won:'Ganho',lost:'Perdido'}
export type ContactActivity={id:string;opportunity_id:string;kind:'contact'|'system';occurred_at:string;channel:string;direction:string;outcome:string;notes:string|null;next_follow_up_at:string|null;created_by:string|null}
export type FollowUpLead=SalesLead&{commercial_phase?:CommercialPhase|null;assigned_to?:string|null;next_follow_up_at:string|null}
export function phaseForLead(lead:FollowUpLead,orders:SalesOrder[],budgets:SalesBudget[]):CommercialPhase{
 const ids=linkedBudgetIds(lead)
 if(orders.some(o=>o.status!=='cancelled'&&ids.includes(o.budget_id)))return 'won'
 if(lead.stage==='lost')return 'lost'
 if(lead.commercial_phase)return lead.commercial_phase
 if(budgets.some(b=>ids.includes(b.id)&&['sent','approved'].includes(b.status)))return 'proposal_sent'
 if(ids.length||lead.stage==='budgeting')return 'preparing'
 return lead.stage==='new'?'new':lead.stage==='won'?'won':'contacted'
}
export function contactSummary(activities:ContactActivity[]){
 const contacts=activities.filter(a=>a.kind==='contact')
 return {attempts:contacts.filter(a=>a.direction==='outbound').length,responses:contacts.filter(a=>a.direction==='inbound'||a.outcome!=='no_response').length,last:contacts.map(a=>a.occurred_at).sort().at(-1)??null}
}
export type FollowUpFilter='all'|'today'|'overdue'|'unscheduled'|'waiting'
export function matchesFollowUp(lead:FollowUpLead,phase:CommercialPhase,filter:FollowUpFilter,now=new Date()){
 if(filter==='all')return true
 if(['won','lost'].includes(phase)||lead.archived_at)return false
 if(filter==='waiting')return lead.response_status==='waiting'
 if(filter==='unscheduled')return !lead.next_follow_up_at
 if(!lead.next_follow_up_at)return false
 if(filter==='today')return salesDay(lead.next_follow_up_at)===salesDay(now.toISOString())
 return new Date(lead.next_follow_up_at)<now
}
export const channelLabels:Record<string,string>={whatsapp:'WhatsApp',email:'E-mail',phone:'Ligação',meeting:'Reunião',other:'Outro',system:'Sistema'}
export const outcomeLabels:Record<string,string>={answered:'Houve resposta',no_response:'Sem resposta',requested_return:'Pediu retorno',stage:'Atualização automática'}

