import {describe,expect,it} from 'vitest'
import {installmentCount,validatePurchaseDocument} from './purchaseDocument'

const parsed=(description:string)=>({documentDate:null,externalNumber:null,internalCode:null,paymentTerms:null,paymentMethod:null,total:null,items:[{description,unit:'UN',quantity:1,width:null,height:null,value:100,operation:'manual' as const,confidence:.9}]})
describe('supplier purchase document',()=>{
  it('accepts descriptive variations with the same meaningful terms',()=>expect(validatePurchaseDocument(parsed('CORTINA ALBUM MARMOR CINZA'),['Cortina para sala, tecido Album Marmor cinza']).valid).toBe(true))
  it('rejects a PDF for another product',()=>expect(validatePurchaseDocument(parsed('PERSIANA SCREEN BRANCA'),['Cortina Album Marmor cinza']).valid).toBe(false))
  it('reads installment quantities without exceeding the supported range',()=>{expect(installmentCount('3x boleto')).toBe(3);expect(installmentCount('100x')).toBe(60)})
})
