export type OpportunityClient={id:string;name:string;phone:string|null;email:string|null}
export function withOpportunityClient<T extends {client_id:string|null;name:string;phone:string|null;email:string|null}>(form:T,client:OpportunityClient,previous?:OpportunityClient):T{
 const contact=(key:'phone'|'email')=>client[key]??(previous&&form[key]===previous[key]?'':form[key]??'')
 return {...form,client_id:client.id,name:client.name,phone:contact('phone'),email:contact('email')}
}

