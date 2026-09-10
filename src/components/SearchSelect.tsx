import { useMemo, useRef, useState } from 'react'

export type SearchSelectOption = { id:string; label:string; detail?:string }

type Props = {
  value:string
  options:SearchSelectOption[]
  placeholder?:string
  disabled?:boolean
  emptyMessage?:string
  ariaLabel:string
  onChange:(value:string)=>void
  onSelect:(option:SearchSelectOption)=>void
}

export function SearchSelect({value,options,placeholder,disabled,emptyMessage='Nenhum resultado encontrado.',ariaLabel,onChange,onSelect}:Props){
  const [open,setOpen]=useState(false)
  const closeTimer=useRef<number>()
  const matches=useMemo(()=>{
    const term=value.trim().toLocaleLowerCase('pt-BR')
    return (term?options.filter(option=>`${option.label} ${option.detail??''}`.toLocaleLowerCase('pt-BR').includes(term)):options).slice(0,8)
  },[options,value])
  const close=()=>{closeTimer.current=window.setTimeout(()=>setOpen(false),140)}
  const choose=(option:SearchSelectOption)=>{if(closeTimer.current)window.clearTimeout(closeTimer.current);onSelect(option);setOpen(false)}
  return <div className="search-select">
    <input aria-label={ariaLabel} autoComplete="off" disabled={disabled} value={value} onFocus={()=>setOpen(true)} onBlur={close} onChange={event=>{onChange(event.target.value);setOpen(true)}} placeholder={placeholder}/>
    {open&&!disabled&&<div className="search-select-menu" role="listbox">{matches.length?matches.map(option=><button type="button" role="option" key={option.id} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(option)}><strong>{option.label}</strong>{option.detail&&<small>{option.detail}</small>}</button>):<p>{emptyMessage}</p>}</div>}
  </div>
}
