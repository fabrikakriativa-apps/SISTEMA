import { describe,expect,it } from 'vitest'
import { composedItemCost,itemCostTotal,marginFromSalePrice,salePriceFromCostAndMargin,salePriceFromMargin,supplyCostTotal } from './budgetItems'

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
  it('uses registered supply quantities in the item cost',()=>{
    expect(supplyCostTotal([{quantity:2.5,unit_cost:40},{quantity:1,unit_cost:15}])).toBe(115)
    expect(composedItemCost({manufacturer_cost:100,installation_cost:60,additional_cost:0,margin_percent:50},[{quantity:2,unit_cost:20}])).toBe(200)
  })
  it('keeps margin and sale price synchronized in both directions',()=>{
    expect(salePriceFromCostAndMargin(200,50)).toBe(300)
    expect(marginFromSalePrice(200,300)).toBe(50)
    expect(marginFromSalePrice(0,300)).toBe(0)
  })
})
