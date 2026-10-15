export type PayablePart = {amount:number; due_date:string; locked?:boolean}
export function adjustPayableAmount<T extends PayablePart>(parts:T[],total:number,index:number,amount:number):T[]{
  if(!parts[index]||parts[index].locked||!Number.isFinite(amount))return parts
  const cents=Math.round(amount*100)
  const updated=parts.map((part,i)=>i===index?{...part,amount:cents/100}:part)
  const adjustable=updated.map((part,i)=>!part.locked&&i!==index?i:-1).filter(i=>i>=0)
  const fixed=updated.reduce((sum,part,i)=>sum+(part.locked||i===index?Math.round(part.amount*100):0),0)
  const remaining=Math.round(total*100)-fixed
  if(remaining<0||cents<0||!adjustable.length)return updated
  const base=Math.floor(remaining/adjustable.length)
  return updated.map((part,i)=>adjustable.includes(i)?{...part,amount:(base+(i===adjustable.at(-1)?remaining-base*adjustable.length:0))/100}:part)
}
export function payableItemLabel(item:{description?:string;environment?:string|null}){
  return [item.description?.trim()||'Item sem descrição',item.environment?.trim()].filter(Boolean).join(' · Ambiente: ')
}

