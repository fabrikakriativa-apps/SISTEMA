import type {ParsedManufacturerDocument} from './manufacturerPdf'

const words=(value:string)=>new Set(value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z0-9]{3,}/g)??[])

export function validatePurchaseDocument(document:ParsedManufacturerDocument,expectedDescriptions:string[]){
  if(!document.items.length)return {valid:false,message:'O documento não contém itens reconhecíveis.'}
  if(!expectedDescriptions.length)return {valid:false,message:'Não há componentes vinculados para conferir este documento.'}
  const found=document.items.map(item=>words(item.description))
  const matched=expectedDescriptions.filter(description=>{const expected=words(description);return found.some(candidate=>[...expected].filter(word=>candidate.has(word)).length>=Math.min(2,expected.size))}).length
  if(!matched)return {valid:false,message:'Os itens do PDF não correspondem aos componentes desta compra.'}
  return {valid:true,message:`${matched} de ${expectedDescriptions.length} componente(s) conferido(s) no documento.`}
}

export function installmentCount(value:string|null){
  const count=Number(value?.match(/\b(\d{1,3})\s*x\b/i)?.[1]??1)
  return Math.max(1,Math.min(60,count||1))
}
