export type OpportunityClient={id:string;name:string;phone:string|null;email:string|null}
export function withOpportunityClient<T extends {client_id:string|null;name:string;phone:string|null;email:string|null}>(form:T,client:OpportunityClient,previous?:OpportunityClient):T{
 const contact=(key:'phone'|'email')=>client[key]??(previous&&form[key]===previous[key]?'':form[key]??'')
 return {...form,client_id:client.id,name:client.name,phone:contact('phone'),email:contact('email')}
}
/** The linked registration owns identity; prospecting owns the commercial process. */
export function registeredOpportunityName(lead:{client_id:string|null;name:string},clients:Pick<OpportunityClient,'id'|'name'>[]):string{
 const client=clients.find(c=>c.id===lead.client_id)
 return client?.name.trim()?client.name:lead.name
}
export function resolveOpportunityNames<T extends {client_id:string|null;name:string}>(leads:T[],clients:Pick<OpportunityClient,'id'|'name'>[]):T[]{
 const names=new Map(clients.filter(c=>c.name.trim()).map(c=>[c.id,c.name]))
 return leads.map(lead=>lead.client_id&&names.has(lead.client_id)?{...lead,name:names.get(lead.client_id)!}:lead)
}

