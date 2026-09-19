import { describe,expect,it } from 'vitest'
import { optionFinalValue,standardItemPaymentOptions } from './paymentOptions'

describe('item commercial payment options',()=>{
  it('starts each new item with the two commercial options used by the business',()=>{
    expect(standardItemPaymentOptions()).toEqual([
      {position:1,description:'À vista (PIX)',adjustment_percent:-6,observation:'No ato da aprovação do orçamento'},
      {position:2,description:'Em até 3x no cartão de crédito',adjustment_percent:0,observation:'No ato da aprovação do orçamento'}
    ])
  })
  it('calculates the displayed value without changing the item value',()=>{
    expect(optionFinalValue(1170,-6)).toBe(1099.8)
    expect(optionFinalValue(1170,0)).toBe(1170)
  })
})
