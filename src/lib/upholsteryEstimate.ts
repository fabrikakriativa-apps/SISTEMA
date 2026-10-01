export type FoamDensity='d23'|'d28'|'d28_soft'

export type UpholsteryPiece={
  id:string
  name:string
  width:number
  height:number
  thickness:number
  density:FoamDensity
  fabric_reference:string
}

export type UpholsteryEstimate={
  pieces:UpholsteryPiece[]
  fabric_width:number
  fabric_estimate:number
  labor_estimate:number
  additional_estimate:number
  margin_percent:number
}

export const foamDensityLabels:Record<FoamDensity,string>={d23:'D23',d28:'D28',d28_soft:'D28 soft'}
const foamRatePerCentimeter:Record<FoamDensity,number>={d23:112,d28:124,d28_soft:143}
const round=(value:number,precision=2)=>Number(value.toFixed(precision))
const positive=(value:number)=>Number.isFinite(value)?Math.max(0,value):0

export const newUpholsteryEstimate=():UpholsteryEstimate=>({
  pieces:[{id:crypto.randomUUID(),name:'Peça 1',width:0,height:0,thickness:3,density:'d28',fabric_reference:''}],
  fabric_width:1.4,fabric_estimate:0,labor_estimate:0,additional_estimate:0,margin_percent:91
})

export type UpholsteryPieceResult=UpholsteryPiece & {foam_area:number;foam_rate:number;foam_cost:number;cut_width:number;cut_length:number}
export type FabricGroup={reference:string;meters:number;piece_count:number}
export type UpholsteryEstimateResult={pieces:UpholsteryPieceResult[];fabric_groups:FabricGroup[];foam_total:number;base_total:number;sale_total:number}

export function calculateUpholsteryEstimate(estimate:UpholsteryEstimate):UpholsteryEstimateResult{
  const fabricWidth=positive(estimate.fabric_width)||1.4
  const pieces=estimate.pieces.filter(piece=>positive(piece.width)>0&&positive(piece.height)>0).map(piece=>{
    const thickness=positive(piece.thickness)
    const foamArea=positive(piece.width)*positive(piece.height)
    const foamRate=thickness*foamRatePerCentimeter[piece.density]
    return {...piece,foam_area:round(foamArea,3),foam_rate:round(foamRate),foam_cost:round(foamArea*foamRate),cut_width:round(positive(piece.height)+(thickness/100*2)+.08,3),cut_length:round(positive(piece.width)+(thickness/100*2)+.08,3)}
  })
  const grouped=new Map<string,UpholsteryPieceResult[]>()
  for(const piece of pieces){
    const reference=piece.fabric_reference.trim()||`Tecido da ${piece.name.trim()||'peça'}`
    grouped.set(reference,[...(grouped.get(reference)??[]),piece])
  }
  const fabric_groups=[...grouped].map(([reference,groupPieces])=>{
    let accumulatedWidth=0,largestLength=0,meters=0
    for(const piece of groupPieces){
      if(accumulatedWidth>0&&accumulatedWidth+piece.cut_width>fabricWidth){meters+=largestLength;accumulatedWidth=0;largestLength=0}
      accumulatedWidth+=piece.cut_width
      largestLength=Math.max(largestLength,piece.cut_length)
    }
    if(accumulatedWidth>0)meters+=largestLength
    return {reference,meters:Math.ceil(meters*2)/2,piece_count:groupPieces.length}
  })
  const foam_total=round(pieces.reduce((total,piece)=>total+piece.foam_cost,0))
  const base_total=round(foam_total+positive(estimate.fabric_estimate)+positive(estimate.labor_estimate)+positive(estimate.additional_estimate))
  return {pieces,fabric_groups,foam_total,base_total,sale_total:round(base_total*(1+positive(estimate.margin_percent)/100))}
}

export function upholsteryDescription(estimate:UpholsteryEstimate,result=calculateUpholsteryEstimate(estimate)){
  const pieces=result.pieces.map(piece=>`${piece.name || 'Peça'}: ${piece.width.toLocaleString('pt-BR')} m × ${piece.height.toLocaleString('pt-BR')} m · espuma ${foamDensityLabels[piece.density]}, ${piece.thickness.toLocaleString('pt-BR')} cm`).join('\n')
  const fabrics=result.fabric_groups.map(group=>`Tecido: ${group.reference} — metragem estimada ${group.meters.toLocaleString('pt-BR')} m`).join('\n')
  return [pieces,fabrics].filter(Boolean).join('\n')
}
