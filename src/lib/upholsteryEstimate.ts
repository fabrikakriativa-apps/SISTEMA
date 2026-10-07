export type FoamDensity='d23'|'d28'|'d28_soft'

export type UpholsteryPiece={
  id:string
  name:string
  width:number
  height:number
  piece_thickness?:number
  thickness:number
  density:FoamDensity
  fabric_reference:string
}

export type UpholsteryEstimate={
  pieces:UpholsteryPiece[]
  fabric_width:number
  fabric_estimate:number
  fabric_meters_manual?:number|null
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
  fabric_width:1.4,fabric_estimate:0,labor_estimate:0,additional_estimate:0,margin_percent:100
})

export type UpholsteryPieceResult=UpholsteryPiece & {foam_area:number;foam_rate:number;foam_cost:number;cut_width:number;cut_length:number}
export type FabricGroup={reference:string;meters:number;piece_count:number}
export type UpholsteryEstimateResult={pieces:UpholsteryPieceResult[];fabric_groups:FabricGroup[];fabric_meters:number;suggested_fabric_meters:number;fabric_cost:number;cost_per_square_meter:number;foam_quantity:number;base_total:number;sale_total:number}

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
  const cost_per_square_meter=round(pieces.reduce((total,piece)=>total+piece.foam_cost,0))
  const foam_quantity=round(pieces.reduce((total,piece)=>total+piece.foam_area,0),3)
  const suggested_fabric_meters=round(fabric_groups.reduce((total,group)=>total+group.meters,0),3)
  const manual=estimate.fabric_meters_manual!==undefined&&estimate.fabric_meters_manual!==null
  const fabric_meters=manual?positive(estimate.fabric_meters_manual!):suggested_fabric_meters
  const fabric_cost=round(positive(estimate.fabric_estimate)*(manual?fabric_meters:1))
  const base_total=round(cost_per_square_meter+fabric_cost+positive(estimate.labor_estimate)+positive(estimate.additional_estimate))
  return {pieces,fabric_groups,fabric_meters,suggested_fabric_meters,fabric_cost,cost_per_square_meter,foam_quantity,base_total,sale_total:round(base_total*(1+positive(estimate.margin_percent)/100))}
}

export function upholsteryDescription(estimate:UpholsteryEstimate,result=calculateUpholsteryEstimate(estimate)){
  const meter=(value:number)=>value.toLocaleString('pt-BR',{maximumFractionDigits:3})
  return result.pieces.map(piece=>[
    `Item: ${piece.name.trim()||'Peça'}`,
    `Medidas aproximadas: ${meter(piece.width)} m x ${meter(piece.height)} m${positive(piece.piece_thickness??0)>0?` x ${meter(piece.piece_thickness!/100)} m`:''}`,
    `Espuma: ${foamDensityLabels[piece.density]} — espessura: ${meter(piece.thickness)} cm`,
    piece.fabric_reference.trim()?`Tecido: ${piece.fabric_reference.trim()}`:''
  ].filter(Boolean).join('\n')).join('\n\n')
}