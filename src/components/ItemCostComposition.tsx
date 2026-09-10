import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { money } from '../lib/format'
import { supplyCostTotal } from '../lib/budgetItems'
import './ItemCostComposition.css'

export type SupplyOption={id:string;code:string;name:string;category:string;usage_unit:string;current_cost:number}
export type SupplyLine={supply_id:string;description:string;quantity:number;unit:string;unit_cost:number}

export function ItemCostComposition({supplies,lines,onChange}:{supplies:SupplyOption[];lines:SupplyLine[];onChange:(lines:SupplyLine[])=>void}){
  const [category,setCategory]=useState(''),[searches,setSearches]=useState<Record<number,string>>({})
  const categories=useMemo(()=>[...new Set(supplies.map(item=>item.category.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')),[supplies])
  const visible=category?supplies.filter(item=>item.category===category):supplies
  const label=(supply?:SupplyOption)=>supply?`${supply.code} · ${supply.name}`:''
  const add=()=>onChange([...lines,{supply_id:'',description:'',quantity:1,unit:'un',unit_cost:0}])
  const update=(index:number,change:Partial<SupplyLine>)=>onChange(lines.map((line,i)=>i===index?{...line,...change}:line))
  const choose=(index:number,id:string)=>{const supply=supplies.find(item=>item.id===id);setSearches(current=>({...current,[index]:label(supply)}));update(index,{supply_id:id,description:supply?.name??'',unit:supply?.usage_unit??'un',unit_cost:Number(supply?.current_cost??0)})}
  const search=(index:number,value:string)=>{setSearches(current=>({...current,[index]:value}));const match=visible.find(item=>label(item).toLocaleLowerCase('pt-BR')===value.trim().toLocaleLowerCase('pt-BR'));if(match)choose(index,match.id);else if(!value.trim())update(index,{supply_id:'',description:'',unit:'un',unit_cost:0})}
  return <section className="cost-composition span-2"><header><div><strong>Insumos cadastrados</strong><small>Busque pelo nome, código ou categoria. O custo cadastrado é copiado para o orçamento e permanece registrado nesta composição.</small></div><div className="cost-composition-actions"><label>Categoria<select aria-label="Filtrar insumos por categoria" value={category} onChange={event=>setCategory(event.target.value)}><option value="">Todas</option>{categories.map(item=><option key={item} value={item}>{item}</option>)}</select></label><button type="button" className="button secondary" onClick={add}><Plus/>Adicionar insumo</button></div></header>{lines.map((line,index)=>{const selected=supplies.find(item=>item.id===line.supply_id);const value=searches[index]??label(selected);return <div className="cost-line" key={`${index}-${line.supply_id}`}><input list={`supply-options-${index}`} aria-label={`Buscar insumo ${index+1}`} value={value} onChange={event=>search(index,event.target.value)} placeholder="Digite para buscar"/><datalist id={`supply-options-${index}`}>{visible.map(supply=><option value={label(supply)} key={supply.id}/>)}</datalist><input aria-label={`Quantidade do insumo ${index+1}`} type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={event=>update(index,{quantity:Number(event.target.value)})}/><span>{line.unit}</span><input aria-label={`Custo unitário do insumo ${index+1}`} type="number" min="0" step="0.01" value={line.unit_cost} onChange={event=>update(index,{unit_cost:Number(event.target.value)})}/><strong>{money.format(line.quantity*line.unit_cost)}</strong><button type="button" className="icon-button" aria-label={`Remover insumo ${index+1}`} onClick={()=>{setSearches({});onChange(lines.filter((_,i)=>i!==index))}}><Trash2/></button></div>})}{!lines.length&&<p>Nenhum insumo cadastrado foi incluído neste item.</p>}<footer>Total dos insumos: <strong>{money.format(supplyCostTotal(lines))}</strong></footer></section>
}
