export type ParsedManufacturerItem={
  description:string
  environment?:string|null
  unit:string
  quantity:number
  width:number|null
  height:number|null
  value:number
  operation:'manual'|'motorized'|'unspecified'
  confidence:number
}

export type ParsedManufacturerDocument={
  documentDate:string|null
  externalNumber:string|null
  internalCode:string|null
  paymentTerms:string|null
  paymentMethod:string|null
  total:number|null
  items:ParsedManufacturerItem[]
}

const decimal=(raw:string)=>Number(raw.replace(/\./g,'').replace(',','.'))
const money=(raw:string)=>Number(decimal(raw).toFixed(2))
const isoDate=(raw:string)=>{const [day,month,year]=raw.split('/');return `${year}-${month}-${day}`}
const clean=(value:string)=>value.replace(/\s+/g,' ').trim()

export function parseManufacturerText(text:string):ParsedManufacturerDocument {
  const normalized=text.replace(/\r/g,'')
  const date=normalized.match(/\bData:\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1]??null
  const external=normalized.match(/(?:Nro\s*Pedido|N[uú�]mero):\s*([^\s]+)(?=\s+(?:C[oó�]d|Cliente|$))/i)?.[1]??null
  const internal=normalized.match(/C[oó�]d\s*\.?(?:\s*Interno)?:\s*([^\s]+)/i)?.[1]??null
  const paymentLine=normalized.match(/Condi[çc][aã]o\s+de\s+Pagamento:\s*(.*?)\s+Forma\s+de\s+Pagamento:\s*([^\n]+)/i)
  const totalMatches=[...normalized.matchAll(/(?:Total(?:\s+com\s+Impostos)?|Valor-Total[^:]*):\s*([\d.]+,\d{2})/gi)]
  const total=totalMatches.length?decimal(totalMatches.at(-1)![1]):null
  const items:ParsedManufacturerItem[]=[]
  for(const source of normalized.split('\n')){
    const line=clean(source)
    if(!line||/^(DESCRI|Data:|Cliente:|Endere|CNPJ|Transportadora|Condi|Entrega:|Observa|Valor-|Total:|IPI:|ICMS)/i.test(line)||/Acresc\.:/i.test(line))continue
    const head=line.match(/^(.+?)\s+(M2|UN|ML)\s+(\d+[,.]\d+)\s+(\d+[,.]\d+)\s+(\d+[,.]\d+)\s+(.+)$/i)
    if(!head)continue
    const numbers=[...head[6].matchAll(/\d{1,3}(?:\.\d{3})*,\d{2,3}/g)].map(match=>match[0])
    if(!numbers.length)continue
    const description=clean(head[1])
    const upper=description.toUpperCase()
    const item={description,environment:null,unit:head[2].toUpperCase(),quantity:decimal(head[3]),width:decimal(head[4]),height:decimal(head[5]),value:money(numbers.at(-1)!),operation:(/MOTORIZAD/.test(upper)?'motorized':/MANUAL/.test(upper)?'manual':'unspecified') as ParsedManufacturerItem['operation'],confidence:numbers.length>=2?.96:.82}
    const previous=items.at(-1)
    if(/^TRILHO\b/i.test(description)&&previous&&/\bCORTINA\b/i.test(previous.description)){
      previous.description=`${previous.description}, com ${description}`
      previous.value=Number((previous.value+item.value).toFixed(2))
      previous.confidence=Math.min(previous.confidence,item.confidence)
      continue
    }
    items.push(item)
  }

  // New York online quotations are semantic forms rather than table rows.
  // Each item has an Ambiente line, detailed configuration and a block total.
  const newYorkBlocks=[...normalized.matchAll(/Descri[çc][ãa]o\s+da\s+(Cortina|Persiana)[^\n]*\n([\s\S]*?)(?=\n(?:Descri[çc][ãa]o\s+da\s+(?:Cortina|Persiana)|Cota[çc][ãa]o\s+v[áa]lida|Empresa\b)|$)/gi)]
  for(const match of newYorkBlocks){
    const kind=clean(match[1])
    const block=match[2]
    const dimensions=block.match(/Ambiente:\s*(.*?)\s+(\d+[,.]\d+)\s+(\d+[,.]\d+)\s+(\d+(?:[,.]\d+)?)(?:\s|$)/i)
    const price=block.match(/\bTotal\s+([\d.]+,\d{2,3})/i)?.[1]??block.match(/Valor\s+(?:da\s+)?(?:Cortina|Persiana)\s+([\d.]+,\d{2,3})/i)?.[1]
    if(!dimensions||!price)continue
    const environment=clean(dimensions[1])
    const fabric=clean(block.match(/Tecido:\s*([^\n]+)/i)?.[1]??'')
    const position=clean(block.match(/Posi[çc][ãa]o:\s*([^\n]+)/i)?.[1]??'')
    const rail=clean(block.match(/Trilho:\s*([^\n]+)/i)?.[1]??'')
    const description=[kind,environment&&`Ambiente ${environment}`,fabric&&`Tecido ${fabric}`,position&&`Posição ${position}`,rail&&`Trilho ${rail}`].filter(Boolean).join(' · ')
    const upper=block.toUpperCase()
    items.push({description,environment:environment||null,unit:'UN',quantity:decimal(dimensions[4]),width:decimal(dimensions[2]),height:decimal(dimensions[3]),value:money(price),operation:(/MOTORIZ|MOTOR|WIFI/.test(upper)?'motorized':/MANUAL|SEM CORDA/.test(upper)?'manual':'unspecified'),confidence:.98})
  }
  return {documentDate:date?isoDate(date):null,externalNumber:external,internalCode:internal,paymentTerms:paymentLine?clean(paymentLine[1]):null,paymentMethod:paymentLine?clean(paymentLine[2]):null,total,items}
}
