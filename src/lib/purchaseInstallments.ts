import {distributeRevision,type RevisionPart} from './receivableRevision'
export function refreshPurchaseParts(current:RevisionPart[],total:number,count:number,firstDue:string):RevisionPart[]{
 const generated=distributeRevision(total,count,firstDue)
 const sameTotal=current.reduce((s,p)=>s+Math.round(p.amount*100),0)===Math.round(total*100)
 return current.length===count&&sameTotal?current.map((p,i)=>({...p,due_date:generated[i].due_date})):generated
}
export function validPurchaseParts(parts:RevisionPart[],total:number){
 return parts.length>0&&parts.length<=60&&parts.every(p=>Number.isFinite(p.amount)&&p.amount>0)&&parts.reduce((s,p)=>s+Math.round(p.amount*100),0)===Math.round(total*100)
}
