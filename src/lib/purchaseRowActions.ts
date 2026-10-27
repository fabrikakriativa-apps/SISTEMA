export function purchaseStatusAction(state:string,next:string,hasPurchase:boolean,workspaceManaged:boolean):'create'|'confirm'|'receive'|'legacy'|null{
 if(state===next)return null
 if(state==='draft'&&['awaiting_delivery','completed'].includes(next))return !hasPurchase?'create':workspaceManaged?'confirm':'legacy'
 if(['awaiting_delivery','delayed'].includes(state)&&next==='completed')return workspaceManaged?'receive':'legacy'
 return null
}
