/** Linked active opportunities share the registration origin. Archived records keep their snapshot. */
export function resolveOpportunityOrigins<T extends {client_id:string|null;origin:string|null;archived_at?:string|null}>(leads:T[],clients:{id:string;origin:string|null}[]):T[]{
 const origins=new Map(clients.map(client=>[client.id,client.origin?.trim()||null]))
 return leads.map(lead=>{
  if(lead.archived_at||!lead.client_id||!origins.has(lead.client_id))return lead
  const origin=origins.get(lead.client_id)??null
  return lead.origin===origin?lead:{...lead,origin}
 })
}
