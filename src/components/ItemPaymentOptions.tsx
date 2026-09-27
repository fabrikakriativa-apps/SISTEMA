import { useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { adjustmentFromFinalValue, optionFinalValue, standardItemPaymentOptions, type ItemPaymentOption } from '../lib/paymentOptions'
import { DecimalInput } from './DecimalInput'
import './ItemPaymentOptions.css'

const blank=(position:number):ItemPaymentOption=>({position,description:'',adjustment_percent:0,final_value:null,observation:''})
export function ItemPaymentOptions({saleTotal,options,onChange}:{saleTotal:number;options:ItemPaymentOption[];onChange:(options:ItemPaymentOption[])=>void}){
 useEffect(()=>{
  const synchronized=options.map(option=>option.final_value===null?option:{...option,adjustment_percent:adjustmentFromFinalValue(saleTotal,option.final_value)})
  if(synchronized.some((option,index)=>option.adjustment_percent!==options[index].adjustment_percent))onChange(synchronized)
 // The resulting percentage depends on the item's actual selling price, never the reverse.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[saleTotal])
 const update=(index:number,change:Partial<ItemPaymentOption>)=>onChange(options.map((item,current)=>current===index?{...item,...change}:item))
 const updateAdjustment=(index:number,adjustment:number)=>update(index,{adjustment_percent:adjustment,final_value:null})
 const updateFinalValue=(index:number,finalValue:number)=>update(index,{final_value:finalValue,adjustment_percent:adjustmentFromFinalValue(saleTotal,finalValue)})
 return <section className="item-payment-options span-2"><header><div><strong>Opções comerciais do item</strong><small>Valores alternativos para apresentar ao cliente. Use percentual negativo para desconto e positivo para acréscimo; isso nunca altera o preço real do item, pedido ou financeiro.</small></div><div><button type="button" className="button secondary compact-button" onClick={()=>onChange(standardItemPaymentOptions())}>Usar opções padrão</button><button type="button" className="button secondary compact-button" onClick={()=>onChange([...options,blank(options.length+1)])}><Plus/>Adicionar opção</button></div></header>{options.length?<div className="payment-option-lines"><div className="payment-option-head"><span>Descrição da condição</span><span>% desconto/acréscimo</span><span>Valor final</span><span>Observação</span><span/></div>{options.map((option,index)=><div className="payment-option-line" key={option.id??index}><input aria-label={`Descrição da condição ${index+1}`} value={option.description} onChange={event=>update(index,{description:event.target.value})}/><DecimalInput ariaLabel={`Desconto ou acréscimo ${index+1}`} value={option.adjustment_percent} decimalScale={6} allowNegative min={-100} trimTrailingZeros onValueChange={adjustment=>updateAdjustment(index,adjustment)}/><DecimalInput ariaLabel={`Valor final da condição ${index+1}`} value={optionFinalValue(saleTotal,option)} decimalScale={2} onValueChange={finalValue=>updateFinalValue(index,finalValue)}/><input aria-label={`Observação da condição ${index+1}`} value={option.observation} onChange={event=>update(index,{observation:event.target.value})}/><button type="button" className="icon-button" aria-label={`Excluir opção ${index+1}`} onClick={()=>onChange(options.filter((_,current)=>current!==index))}><Trash2/></button></div>)}</div>:<p>Use as opções padrão ou inclua uma condição comercial.</p>}</section>
}
