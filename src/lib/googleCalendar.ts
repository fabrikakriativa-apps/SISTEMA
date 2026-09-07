export type SyncEvent={id:string;title:string;description:string|null;starts_at:string;ends_at:string|null;cancelled_at:string|null;google_event_id:string|null}
const endpoint='https://www.googleapis.com/calendar/v3/calendars/primary/events'
export async function sendToGoogle(event:SyncEvent,token:string,request:typeof fetch=fetch){
 const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'}
 if(event.cancelled_at){if(!event.google_event_id)return {googleEventId:null};const response=await request(`${endpoint}/${encodeURIComponent(event.google_event_id)}`,{method:'DELETE',headers});if(!response.ok&&response.status!==404)throw new Error(response.status===401?'reauthorize':'google');return {googleEventId:event.google_event_id}}
 const start=new Date(event.starts_at),end=event.ends_at?new Date(event.ends_at):new Date(start.getTime()+60*60*1000),body=JSON.stringify({summary:event.title,description:event.description||undefined,start:{dateTime:start.toISOString()},end:{dateTime:end.toISOString()}})
 const url=event.google_event_id?`${endpoint}/${encodeURIComponent(event.google_event_id)}`:endpoint,response=await request(url,{method:event.google_event_id?'PATCH':'POST',headers,body})
 if(!response.ok)throw new Error(response.status===401?'reauthorize':'google');const data=await response.json() as {id?:string};if(!data.id)throw new Error('google');return {googleEventId:data.id}
}
