import { describe,expect,it } from 'vitest'
import { adjustmentFromFinalValue,finalValueFromAdjustment,optionFinalValue,standardItemPaymentOptions,paymentOptionsForQuantity } from './paymentOptions'

describe('item commercial payment options',()=>{
  it('rescales fixed totals with quantity without changing percentage discounts',()=>{
    const options=standardItemPaymentOptions();options[0].final_value=1062
    const changed=paymentOptionsForQuantity(options,1,2)
    expect(changed[0].final_value).toBe(2124)
    expect(changed[1].final_value).toBeNull()
    expect(changed[1].adjustment_percent).toBe(-3)
    expect(optionFinalValue(2360,changed[1])).toBe(2289.2)
    expect(options[0].final_value).toBe(1062)
  })
  it('starts each new item with the three commercial options used by the business',()=>{
    expect(standardItemPaymentOptions()).toEqual([
      {position:1,description:'À vista (PIX)',adjustment_percent:-6,final_value:null,observation:'No ato da aprovação do orçamento'},
      {position:2,description:'Em até 3x no cartão de crédito',adjustment_percent:-3,final_value:null,observation:'No ato da aprovação do orçamento'},
      {position:3,description:'Em até 6x no cartão de crédito',adjustment_percent:0,final_value:null,observation:'No ato da aprovação do orçamento'}
    ])
  })
  it('keeps the customer value as the source of truth when it is edited',()=>{
    expect(finalValueFromAdjustment(1170,-6)).toBe(1099.8)
    expect(adjustmentFromFinalValue(1170,1111.5)).toBe(-5)
    expect(optionFinalValue(1170,{adjustment_percent:-5,final_value:1111.5})).toBe(1111.5)
  })
})
