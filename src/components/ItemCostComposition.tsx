import { Plus, Trash2 } from 'lucide-react'
import { money } from '../lib/format'
import { supplyCostTotal } from '../lib/budgetItems'

export type SupplyOption={id:string;code:string;name:string;usage_unit:string;current_cost:number}
export type SupplyLine={supply_id:string;description:string;quantity:number;unit:string;unit_cost:number}

export function ItemCostComposition({supplies,lines,onChange}:{supplies:SupplyOption[];lines:SupplyLine[];onChange:(lines:SupplyLine[])=>void}){
  const add=()=>onChange([...lines,{supply_id:'',description:'',quantity:1,unit:'un',unit_cost:0}])
  const update=(index:number,change:Partial<SupplyLine>)=>onChange(lines.map((line,i)=>i===index?{...line,...change}:line))
  const choose=(index:number,id:string)=>{const supply=supplies.find(item=>item.id===id);update(index,{supply_id:id,description:supply?.name??'',unit:supply?.usage_unit??'un',unit_cost:Number(supply?.current_cost??0)})}
  return <section className="cost-composition span-2"><header><div><strong>Insumos cadastrados</strong><small>O custo cadastrado é copiado para o orçamento e permanece registrado nesta composição.</small></div><button type="button" className="button secondary" onClick={add}><Plus/>Adicionar insumo</button></header>{lines.map((line,index)=><div className="cost-line" key={`${index}-${line.supply_id}`}><select aria-label={`Insumo ${index+1}`} value={line.supply_id} onChange={event=>choose(index,event.target.value)}><option value="">Selecione um insumo</option>{supplies.map(supply=><option value={supply.id} key={supply.id}>{supply.code} · {supply.name}</option>)}</select><input aria-label={`Quantidade do insumo ${index+1}`} type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={event=>update(index,{quantity:Number(event.target.value)})}/><span>{line.unit}</span><input aria-label={`Custo unitário do insumo ${index+1}`} type="number" min="0" step="0.01" value={line.unit_cost} onChange={event=>update(index,{unit_cost:Number(event.target.value)})}/><strong>{money.format(line.quantity*line.unit_cost)}</strong><button type="button" className="icon-button" aria-label={`Remover insumo ${index+1}`} onClick={()=>onChange(lines.filter((_,i)=>i!==index))}><Trash2/></button></div>)}{!lines.length&&<p>Nenhum insumo cadastrado foi incluído neste item.</p>}<footer>Total dos insumos: <strong>{money.format(supplyCostTotal(lines))}</strong></footer></section>
}
