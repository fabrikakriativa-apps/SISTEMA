import { Plus, X } from 'lucide-react'
import { DecimalInput } from './DecimalInput'
import { calculateUpholsteryEstimate, foamDensityLabels, upholsteryDescription, type UpholsteryEstimate, type UpholsteryPiece } from '../lib/upholsteryEstimate'
import { money } from '../lib/format'
import './UpholsteryEstimateCalculator.css'

type Props={estimate:UpholsteryEstimate;onChange:(estimate:UpholsteryEstimate)=>void;onApplyValue:(value:number)=>void;onInsertDescription:(description:string)=>void}

const emptyPiece=():UpholsteryPiece=>({id:crypto.randomUUID(),name:'Nova peça',width:0,height:0,thickness:3,density:'d28',fabric_reference:''})

export function UpholsteryEstimateCalculator({estimate,onChange,onApplyValue,onInsertDescription}:Props){
  const result=calculateUpholsteryEstimate(estimate)
  const updatePiece=(id:string,change:Partial<UpholsteryPiece>)=>onChange({...estimate,pieces:estimate.pieces.map(piece=>piece.id===id?{...piece,...change}:piece)})
  const description=upholsteryDescription(estimate,result)
  return <section className="upholstery-calculator span-2">
    <header><div><h3>Calculador rápido de estofado</h3><p>Calcula o custo por m², a quantidade de espuma e a metragem de tecido. O tecido é incluído como valor separado, sem gerar lista de compras.</p></div><button type="button" className="button secondary compact-button" onClick={()=>onChange({...estimate,pieces:[...estimate.pieces,emptyPiece()]})}><Plus/>Adicionar peça</button></header>
    <div className="upholstery-piece-list">
      {estimate.pieces.map((piece,index)=><div className="upholstery-piece" key={piece.id}>
        <div className="upholstery-piece-heading"><strong>Peça {index+1}</strong>{estimate.pieces.length>1&&<button type="button" className="text-button danger-text" onClick={()=>onChange({...estimate,pieces:estimate.pieces.filter(current=>current.id!==piece.id)})}><X/>Remover</button>}</div>
        <label className="field">Nome da peça<input value={piece.name} onChange={event=>updatePiece(piece.id,{name:event.target.value})} placeholder="Ex.: Cabeceira"/></label>
        <label className="field">Largura (m)<DecimalInput value={piece.width} decimalScale={3} onValueChange={value=>updatePiece(piece.id,{width:value})}/></label>
        <label className="field">Altura / profundidade (m)<DecimalInput value={piece.height} decimalScale={3} onValueChange={value=>updatePiece(piece.id,{height:value})}/></label>
        <label className="field">Espessura (cm)<DecimalInput value={piece.thickness} decimalScale={1} onValueChange={value=>updatePiece(piece.id,{thickness:value})}/></label>
        <label className="field">Espuma<select value={piece.density} onChange={event=>updatePiece(piece.id,{density:event.target.value as UpholsteryPiece['density']})}>{Object.entries(foamDensityLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field">Referência do tecido<input value={piece.fabric_reference} onChange={event=>updatePiece(piece.id,{fabric_reference:event.target.value})} placeholder="Ex.: Linho linha essencial"/></label>
      </div>)}
    </div>
    <div className="upholstery-estimate-inputs">
      <label className="field">Largura útil do tecido (m)<DecimalInput value={estimate.fabric_width} decimalScale={2} onValueChange={value=>onChange({...estimate,fabric_width:value})}/></label>
      <label className="field">Valor estimado dos tecidos<DecimalInput value={estimate.fabric_estimate} decimalScale={2} onValueChange={value=>onChange({...estimate,fabric_estimate:value})}/><small>Acrescentado manualmente ao cálculo.</small></label>
      <label className="field">Mão de obra estimada<DecimalInput value={estimate.labor_estimate} decimalScale={2} onValueChange={value=>onChange({...estimate,labor_estimate:value})}/></label>
      <label className="field">Outros custos estimados<DecimalInput value={estimate.additional_estimate} decimalScale={2} onValueChange={value=>onChange({...estimate,additional_estimate:value})}/></label>
      <label className="field">Margem (%)<DecimalInput value={estimate.margin_percent} decimalScale={2} onValueChange={value=>onChange({...estimate,margin_percent:value})}/></label>
    </div>
    <div className="upholstery-summary">
      <div><span>Custo por m²</span><strong>{money.format(result.cost_per_square_meter)}</strong></div>
      <div><span>Qtd. de espuma</span><strong>{result.foam_quantity.toLocaleString('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:3})} m²</strong></div>
      <div className="upholstery-fabric-result"><label className="field">Metragem de tecido (m)<DecimalInput value={result.fabric_meters} decimalScale={3} onValueChange={value=>{if(value!==result.fabric_meters)onChange({...estimate,fabric_meters_manual:value})}}/></label>{estimate.fabric_meters_manual!=null&&<button type="button" className="text-button" onClick={()=>onChange({...estimate,fabric_meters_manual:null})}>Usar cálculo automático</button>}</div>
      <div><span>Custo estimado</span><strong>{money.format(result.base_total)}</strong></div>
      <div className="upholstery-sale"><span>Valor sugerido</span><strong>{money.format(result.sale_total)}</strong></div>
    </div>
    <footer><button type="button" className="button secondary" disabled={!description} onClick={()=>onInsertDescription(description)}>Inserir resumo na descrição</button><button type="button" className="button primary" disabled={!result.pieces.length} onClick={()=>onApplyValue(result.sale_total)}>Usar valor sugerido</button></footer>
  </section>
}
