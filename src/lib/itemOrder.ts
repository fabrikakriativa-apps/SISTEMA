export function moveItem<T extends {id:string}>(items:T[],fromId:string,toId:string):T[]{
 const from=items.findIndex(i=>i.id===fromId),to=items.findIndex(i=>i.id===toId)
 if(from<0||to<0||from===to)return items
 const next=[...items],item=next.splice(from,1)[0];next.splice(to,0,item);return next
}
export function documentItemOrder<T extends {id:string;position:number}>(items:T[]):T[]{return [...items].sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id))}

