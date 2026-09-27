import { useEffect, useState } from 'react'

type DecimalInputProps = {
  value:number
  onValueChange:(value:number)=>void
  decimalScale:number
  min?:number
  allowNegative?:boolean
  trimTrailingZeros?:boolean
  ariaLabel?:string
}

const formatter=(value:number,decimalScale:number,trimTrailingZeros:boolean)=>new Intl.NumberFormat('pt-BR',{
  minimumFractionDigits:trimTrailingZeros?0:decimalScale,
  maximumFractionDigits:decimalScale
}).format(Number.isFinite(value)?value:0)

function parse(value:string,allowNegative:boolean){
  const raw=value.trim().replace(/\s/g,'')
  if(!raw)return 0
  const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw
  const valid=allowNegative?/^-?\d*(?:\.\d*)?$/.test(normalized):/^\d*(?:\.\d*)?$/.test(normalized)
  if(!valid)return null
  if(normalized==='-')return null
  const parsed=Number(normalized)
  return Number.isFinite(parsed)?parsed:null
}

export function DecimalInput({value,onValueChange,decimalScale,min=0,allowNegative=false,trimTrailingZeros=false,ariaLabel}:DecimalInputProps){
  const [draft,setDraft]=useState(()=>formatter(value,decimalScale,trimTrailingZeros))
  const [editing,setEditing]=useState(false)
  useEffect(()=>{if(!editing)setDraft(formatter(value,decimalScale,trimTrailingZeros))},[value,decimalScale,trimTrailingZeros,editing])
  const apply=(raw:string)=>{
    const parsed=parse(raw,allowNegative)
    if(parsed!==null)onValueChange(Math.max(min,parsed))
  }
  return <input aria-label={ariaLabel} inputMode="decimal" value={draft} onFocus={()=>setEditing(true)} onChange={event=>{setDraft(event.target.value);apply(event.target.value)}} onBlur={()=>{const parsed=parse(draft,allowNegative);const normalized=Math.max(min,parsed??value);setEditing(false);onValueChange(normalized);setDraft(formatter(normalized,decimalScale,trimTrailingZeros))}}/>
}
