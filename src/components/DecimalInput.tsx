import { useEffect, useState } from 'react'

type DecimalInputProps = {
  value:number
  onValueChange:(value:number)=>void
  decimalScale:number
  min?:number
  ariaLabel?:string
}

const formatter=(value:number,decimalScale:number)=>new Intl.NumberFormat('pt-BR',{
  minimumFractionDigits:decimalScale,
  maximumFractionDigits:decimalScale
}).format(Number.isFinite(value)?value:0)

function parse(value:string){
  const raw=value.trim().replace(/\s/g,'')
  if(!raw)return 0
  const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw
  if(!/^\d*(?:\.\d*)?$/.test(normalized))return null
  const parsed=Number(normalized)
  return Number.isFinite(parsed)?parsed:null
}

export function DecimalInput({value,onValueChange,decimalScale,min=0,ariaLabel}:DecimalInputProps){
  const [draft,setDraft]=useState(()=>formatter(value,decimalScale))
  const [editing,setEditing]=useState(false)
  useEffect(()=>{if(!editing)setDraft(formatter(value,decimalScale))},[value,decimalScale,editing])
  const apply=(raw:string)=>{
    const parsed=parse(raw)
    if(parsed!==null)onValueChange(Math.max(min,parsed))
  }
  return <input aria-label={ariaLabel} inputMode="decimal" value={draft} onFocus={()=>setEditing(true)} onChange={event=>{setDraft(event.target.value);apply(event.target.value)}} onBlur={()=>{const parsed=parse(draft);const normalized=Math.max(min,parsed??value);setEditing(false);onValueChange(normalized);setDraft(formatter(normalized,decimalScale))}}/>
}
