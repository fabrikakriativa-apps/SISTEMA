import { describe,expect,it } from 'vitest'
import { adjustmentFromFinalValue,finalValueFromAdjustment,optionFinalValue,standardItemPaymentOptions } from './paymentOptions'

describe('item commercial payment options',()=>{
  it('starts each new item with the two commercial options used by the business',()=>{
    expect(standardItemPaymentOptions()).toEqual([
      {position:1,description:'À vista (PIX)',adjustment_percent:-6,final_value:null,observation:'No ato da aprovação do orçamento'},
      {position:2,description:'Em até 3x no cartão de crédito',adjustment_percent:0,final_value:null,observation:'No ato da aprovação do orçamento'}
    ])
  })
  it('keeps the customer value as the source of truth when it is edited',()=>{
    expect(finalValueFromAdjustment(1170,-6)).toBe(1099.8)
    expect(adjustmentFromFinalValue(1170,1111.5)).toBe(-5)
    expect(optionFinalValue(1170,{adjustment_percent:-5,final_value:1111.5})).toBe(1111.5)
  })
})
