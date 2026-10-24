/** An explicit opportunity origin is historical; missing values follow the linked registration. */
export function resolveOpportunityOrigins<T extends {client_id:string|null;origin:string|null}>(leads:T[],clients:{id:string;origin:string|null}[]):T[]{
 const origins=new Map(clients.map(client=>[client.id,client.origin?.trim()||null]))
 return leads.map(lead=>lead.origin?.trim()?lead:{...lead,origin:lead.client_id?origins.get(lead.client_id)??null:null})
}
