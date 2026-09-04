import { describe,expect,it } from 'vitest'
import { itemCostTotal,salePriceFromMargin } from './budgetItems'

describe('budget item totals',()=>{
  it('includes manufacturer, installation and additional costs',()=>{
    expect(itemCostTotal({manufacturer_cost:100,installation_cost:60,additional_cost:40,margin_percent:50})).toBe(200)
  })
  it('applies margin over the consolidated cost',()=>{
    expect(salePriceFromMargin({manufacturer_cost:100,installation_cost:60,additional_cost:40,margin_percent:50})).toBe(300)
  })
  it('does not allow invalid or negative inputs to reduce the total',()=>{
    expect(salePriceFromMargin({manufacturer_cost:-100,installation_cost:Number.NaN,additional_cost:20,margin_percent:-10})).toBe(20)
  })
})
