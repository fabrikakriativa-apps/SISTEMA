import {describe,expect,it} from 'vitest'
import {parseManufacturerText} from './manufacturerPdf'

const header=`Data: 02/06/2026 Nro Pedido: #11013707-1 Cód . Interno: 260780 Pág.: 1 de 1
Condição de Pagamento: 30/60/90 DIAS Forma de Pagamento: BOLETO`

describe('manufacturer PDF semantic parser',()=>{
  it('reads blind items by semantic line structure and uses the final value',()=>{
    const parsed=parseManufacturerText(`${header}
ROLLUX MOTORIZADA - SCREEN 1% - 167 WHITE M2 1,00 1,310 2,530 0 0 3,3143 3,3143 0 E 102,00 169,500 - 21,5% 1.107,560
(02) TEC DESCENDO P / FRENTE Acresc.: - - UN 0,00
DUAL VISION MANUAL - EVIDENCE - LIGHT GREY M2 1,00 1,370 1,730 0 0 2,3701 2,3701 1,400 D 190,30 22,509 - - 473,540
Total com Impostos: 3.346,66`)
    expect(parsed.items).toHaveLength(2)
    expect(parsed.items[0]).toMatchObject({value:1107.56,operation:'motorized',width:1.31,height:2.53})
    expect(parsed.items[1]).toMatchObject({value:473.54,operation:'manual',width:1.37,height:1.73})
    expect(parsed.total).toBe(3346.66)
  })

  it('groups a curtain and its rail as one commercial item',()=>{
    const parsed=parseManufacturerText(`Data: 20/05/2026 Nro Pedido: #11013707-1 Cód . Interno: 260038 Pág.: 1 de 1
Condição de Pagamento: 30/60/90 DIAS Forma de Pagamento: BOLETO
CORTINA PRONTA - BLACKOUT GIARDINO - 15662 - CINZA UN 1,00 5,810 2,420 14,0602 14,0602 C 1.425,88 - - - 1.425,880
TRILHO MAX REFORÇADO 1 VIA ML 1,00 5,810 1,000 1,0000 0 C 11,57 - - - 67,222
Total com Impostos: 1.493,10`)
    expect(parsed).toMatchObject({documentDate:'2026-05-20',externalNumber:'#11013707-1',internalCode:'260038',paymentTerms:'30/60/90 DIAS',paymentMethod:'BOLETO',total:1493.1})
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0]).toMatchObject({value:1493.1})
    expect(parsed.items[0].description).toContain('TRILHO MAX REFORÇADO 1 VIA')
  })

  it('does not interpret accessory rows as main items',()=>{
    expect(parseManufacturerText(`DL - KIT BARRA NIVELADORA - CINZA Acresc.: 16,43 - L 22,51`).items).toHaveLength(0)
  })
})
