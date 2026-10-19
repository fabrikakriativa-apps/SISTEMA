export type LeadProfile='unassessed'|'in_profile'|'out_of_profile'
export const profileLabels:Record<LeadProfile,string>={unassessed:'Em avaliação',in_profile:'Dentro do perfil',out_of_profile:'Fora de perfil'}
export type SalesLead={id:string;name:string;received_on:string|null;profile_status:LeadProfile;profile_reason:string|null;capture_source:string|null;campaign:string|null;customer_kind:'unknown'|'new_lead'|'repeat';response_status:'active'|'waiting'|'no_response';stage:string;budget_id:string|null;related_budget_ids:string[];origin:string|null;archived_at?:string|null}
export type SalesBudget={id:string;display_number:string;client_id:string|null;status:string;created_at:string;total:number|string}
export type SalesOrder={id:string;display_number:string;budget_id:string;status:string;created_at:string;total:number|string}
export type SalesHistory={id:string;entity_type:'opportunity'|'budget'|'order';entity_id:string;recorded_at:string;state:{profile_status?:LeadProfile;stage?:string;response_status?:SalesLead['response_status'];archived_at?:string|null;status?:string;total?:number|string;baseline?:boolean}}
export type SalesRange={from:string;to:string}
export const salesDay=(value:string)=>value.length===10?value:new Date(value).toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'})
export const inSalesRange=(day:string|null,range:SalesRange)=>Boolean(day&&(!range.from||day>=range.from)&&(!range.to||day<=range.to))
export const linkedBudgetIds=(lead:SalesLead)=>[...new Set([lead.budget_id,...lead.related_budget_ids].filter((id):id is string=>Boolean(id)))]
export function validateLeadTracking(lead:Pick<SalesLead,'received_on'|'customer_kind'|'profile_status'|'profile_reason'>,today=salesDay(new Date().toISOString())){
 if(lead.received_on&&(!/^\d{4}-\d{2}-\d{2}$/.test(lead.received_on)||Number.isNaN(new Date(lead.received_on+'T12:00:00Z').getTime())||new Date(lead.received_on+'T12:00:00Z').toISOString().slice(0,10)!==lead.received_on||lead.received_on>today))throw new Error('Informe uma data de entrada válida, não futura.')
 if(lead.received_on&&lead.customer_kind==='unknown')throw new Error('Informe se é novo lead ou recompra.')
 if(lead.profile_status==='out_of_profile'&&(lead.profile_reason??'').trim().length<3)throw new Error('Informe o motivo de estar fora do perfil.')
}
export function calculateSalesResults(leads:SalesLead[],budgets:SalesBudget[],orders:SalesOrder[],history:SalesHistory[],range:SalesRange,cutoff:string){
 const facts=new Map<string,SalesHistory[]>()
 for(const event of history){const key=event.entity_type+':'+event.entity_id;const list=facts.get(key)??[];list.push(event);facts.set(key,list)}
 for(const list of facts.values())list.sort((a,b)=>a.recorded_at.localeCompare(b.recorded_at)||a.id.localeCompare(b.id))
 const events=(kind:string,id:string)=>(facts.get(kind+':'+id)??[]).filter(e=>salesDay(e.recorded_at)<=cutoff)
 const activeLeads=leads.filter(lead=>{
  const state=events('opportunity',lead.id).at(-1)?.state
  return state? !state.archived_at:!lead.archived_at||salesDay(lead.archived_at)>cutoff
 })
 const budgetMap=new Map(budgets.map(b=>[b.id,b]))
 const orderOwners=new Map<string,SalesLead>();for(const lead of activeLeads)for(const id of linkedBudgetIds(lead))orderOwners.set(id,lead)
 const validOrders=orders.flatMap(order=>{
  if(salesDay(order.created_at)>cutoff)return []
  const snapshot=events('order',order.id).at(-1)
  // A pre-activation historical status cannot be reconstructed from today's status.
  if(!snapshot)return []
  return snapshot.state.status==='cancelled'?[]:[{...order,total:Number(snapshot.state.total??order.total)}]
 })
 const cohort=activeLeads.filter(l=>l.customer_kind==='new_lead'&&inSalesRange(l.received_on,range)&&l.received_on!<=cutoff)
 const rows=cohort.flatMap(lead=>{
  const state=events('opportunity',lead.id).at(-1)?.state
  if(state?.archived_at)return []
  const ids=linkedBudgetIds(lead)
  const proposals=ids.flatMap(id=>{
   const budget=budgetMap.get(id);if(!budget||salesDay(budget.created_at)>cutoff)return []
   const first=events('budget',id).find(e=>['sent','approved'].includes(e.state.status??''))
   return first?[id]:[]
  })
  const deals=validOrders.filter(o=>ids.includes(o.budget_id)&&(!lead.received_on||salesDay(o.created_at)>=lead.received_on))
  return [{...lead,profile_status:state?.profile_status??'unassessed',response_status:state?.response_status??'active',stage:state?.stage??'new',proposals,deals}]
 })
 const buyers=rows.filter(l=>l.deals.length>0)
 const firstSale=(lead:SalesLead)=>validOrders.filter(o=>linkedBudgetIds(lead).includes(o.budget_id)).map(o=>salesDay(o.created_at)).sort()[0]??null
 const immediate=buyers.filter(l=>inSalesRange(firstSale(l),range))
 const closed=validOrders.filter(o=>inSalesRange(salesDay(o.created_at),range))
 const groups=['current','previous','repeat','unknown'].map(key=>{
  const deals=closed.filter(o=>{
   const lead=orderOwners.get(o.budget_id)
   if(!lead?.received_on||lead.customer_kind==='unknown')return key==='unknown'
   if(lead.customer_kind==='repeat')return key==='repeat'
   if(lead.received_on>salesDay(o.created_at))return key==='unknown'
   return inSalesRange(lead.received_on,range)?key==='current':key==='previous'
  })
  return {key,orders:deals,buyers:new Set(deals.map(o=>orderOwners.get(o.budget_id)?.id).filter(Boolean)).size,value:deals.reduce((s,o)=>s+Number(o.total),0)}
 })
 return {rows,buyers,immediate,proposals:rows.filter(l=>l.proposals.length),qualified:rows.filter(l=>l.profile_status==='in_profile'),outside:rows.filter(l=>l.profile_status==='out_of_profile'),unassessed:rows.filter(l=>l.profile_status==='unassessed'),noResponse:rows.filter(l=>l.response_status==='no_response'&&!l.deals.length),lost:rows.filter(l=>l.stage==='lost'&&l.response_status!=='no_response'&&!l.deals.length),groups,closed,unknownEntry:activeLeads.filter(l=>!l.received_on).length,historyStarts:history.map(e=>salesDay(e.recorded_at)).sort()[0]??null}
}

