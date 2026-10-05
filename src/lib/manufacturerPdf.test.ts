import {describe,expect,it} from 'vitest'
import {parseManufacturerText} from './manufacturerPdf'

const header=`Data: 02/06/2026 Nro Pedido: #11013707-1 Cód . Interno: 260780 Pág.: 1 de 1
Condição de Pagamento: 30/60/90 DIAS Forma de Pagamento: BOLETO`

describe('manufacturer PDF semantic parser',()=>{
  it('reads compact New York quotations with integer quantities and rail included in item total',()=>{
    const parsed=parseManufacturerText(`Código: #22073855 Cliente: Fabrika
Valor total: R$ 2.527,62
Data: 05/10/2026
Cortina 2 - Wilson - Ambiente: sala Valor do item: R$ 985,54
Medidas: 3,57 x 2,68 m Trilho: Trilho Max Reforçado Branco
Qtd: 1 Acionamento: Sem Corda
Tecido: LINHO MOOREA - 13992 BRANCO Prega/Fita wave: Prega Macho
Posição: Voil Proporção: 3,00
Valor da Cortina: R$ 944,24
Valor do Trilho: R$ 41,30
Cortina 3 - Wilson - Ambiente: Sala Valor do item: R$ 444,58
Medidas: 3,3 x 2,75 m Trilho: Trilho Max Reforçado Branco
Qtd: 2 Acionamento: Sem Corda
Tecido: MICROFIBRA BRANCO Prega/Fita wave: Franzida
Empresa FERREIRA E MAHS`)
    expect(parsed.items).toHaveLength(2)
    expect(parsed.items[0]).toMatchObject({width:3.57,height:2.68,quantity:1,value:985.54,environment:'sala',operation:'manual'})
    expect(parsed.items[0].description).toContain('LINHO MOOREA')
    expect(parsed.items[1].quantity).toBe(2)
    expect(parsed.total).toBe(2527.62)
  })
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

  it('uses the OBS line as the blind item environment',()=>{
    const parsed=parseManufacturerText(`${header}
ROLLUX MANUAL - SCREEN 1% - 167 WHITE M2 1,00 1,150 2,560 0 0 2,9440 2,9440 0 E 102,00 169,500 - 21,5% 300,29
OBS: sacada
Acresc.: - - UN 0,00`)
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0]).toMatchObject({environment:'sacada',width:1.15,height:2.56,quantity:1,value:300.29})
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

  it('reads the New York online quotation layout for curtains',()=>{
    const parsed=parseManufacturerText(`Cotação online New York
Número: #22063075 Cliente: Michelle
Data: 15/07/2026
Descrição da Cortina Sala Largura Altura Quantidade
Ambiente: Sala 2,85 2,66 1
Tecido: ALBUM 04 CORTINAS - LINHO MOOREA - 13992 BRANCO
Posição: Voil
Trilho: Sem Trilho
Acionamento: Sem Corda
Valor do Trilho 0,00
Valor Cortina 457,98
Total 457,98
Cotação válida até 05/08/2026.`)
    expect(parsed).toMatchObject({documentDate:'2026-07-15',externalNumber:'#22063075'})
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0]).toMatchObject({environment:'Sala',width:2.85,height:2.66,quantity:1,value:457.98,operation:'manual'})
    expect(parsed.items[0].description).toContain('LINHO MOOREA')
  })
})
