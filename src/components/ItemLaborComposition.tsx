import { Plus, Trash2 } from 'lucide-react'
import { money } from '../lib/format'
import { SearchSelect } from './SearchSelect'
import './ItemLaborComposition.css'

export type ProviderOption={id:string;name:string;phone?:string|null;types?:string[]}
export type LaborLine={supplier_id:string;description:string;days:number;amount:number;start_date:string}

const blank=():LaborLine=>({supplier_id:'',description:'Mão de obra',days:1,amount:0,start_date:''})

export function laborCostTotal(lines:LaborLine[]){return Number(lines.reduce((total,line)=>total+(Number(line.amount)||0),0).toFixed(2))}

export function ItemLaborComposition({providers,lines,onChange}:{providers:ProviderOption[];lines:LaborLine[];onChange:(lines:LaborLine[])=>void}){
  const update=(index:number,change:Partial<LaborLine>)=>onChange(lines.map((line,current)=>current===index?{...line,...change}:line))
  return <section className="labor-composition span-2"><header><div><strong>Mão de obra</strong><small>Defina o prestador responsável, a duração e o custo. Na aprovação, cada lançamento gera uma conta a pagar editável.</small></div><button type="button" className="button secondary compact-button" onClick={()=>onChange([...lines,blank()])}><Plus/>Adicionar mão de obra</button></header>{lines.length?<div className="labor-lines">{lines.map((line,index)=>{const selected=providers.find(provider=>provider.id===line.supplier_id);return <div className="labor-line" key={`${index}-${line.supplier_id}`}><SearchSelect ariaLabel={`Prestador responsável ${index+1}`} value={selected?.name??''} onChange={()=>undefined} onSelect={option=>update(index,{supplier_id:option.id})} options={providers.map(provider=>({id:provider.id,label:provider.name,detail:[provider.phone,provider.types?.join(', ')].filter(Boolean).join(' · ')}))} placeholder="Buscar prestador"/><input aria-label={`Descrição da mão de obra ${index+1}`} value={line.description} onChange={event=>update(index,{description:event.target.value})} placeholder="Ex.: Confecção"/><label><span>Dias</span><input aria-label={`Dias de mão de obra ${index+1}`} type="number" min="0.5" step="0.5" value={line.days} onChange={event=>update(index,{days:Number(event.target.value)})}/></label><label><span>Início previsto</span><input aria-label={`Início previsto da mão de obra ${index+1}`} type="date" value={line.start_date} onChange={event=>update(index,{start_date:event.target.value})}/></label><label><span>Valor</span><input aria-label={`Valor da mão de obra ${index+1}`} type="number" min="0" step="0.01" value={line.amount} onChange={event=>update(index,{amount:Number(event.target.value)})}/></label><strong>{money.format(line.amount||0)}</strong><button type="button" className="icon-button" aria-label={`Remover mão de obra ${index+1}`} onClick={()=>onChange(lines.filter((_,current)=>current!==index))}><Trash2/></button></div>})}</div>:<p>Nenhuma mão de obra adicionada a este item.</p>}<footer>Total de mão de obra: <strong>{money.format(laborCostTotal(lines))}</strong></footer></section>
}
