import { describe,expect,it } from 'vitest'
import { composedItemCost,itemCostTotal,marginFromSalePrice,salePriceFromCostAndMargin,salePriceFromMargin,supplyCostTotal,itemUnitSalePrice,itemSaleTotal,saleTotalForQuantity } from './budgetItems'

describe('budget item totals',()=>{
  it('multiplies unit sale by quantity once and preserves existing stored totals',()=>{
    expect(itemSaleTotal(1180,2)).toBe(2360)
    expect(itemSaleTotal(1602.8,2)).toBe(3205.6)
    expect(itemUnitSalePrice(2360,2)).toBe(1180)
    expect(itemUnitSalePrice(1180,2)).toBe(590)
    expect(saleTotalForQuantity(1180,1,2)).toBe(2360)
    expect(saleTotalForQuantity(2360,2,3)).toBe(3540)
    expect(saleTotalForQuantity(100,3,3)).toBe(100)
    expect(saleTotalForQuantity(100,3,6)).toBe(200)
    expect(itemSaleTotal(19.9,2.5)).toBe(49.75)
  })
  it('keeps imported PDF cost separate from sale and recalculates margin',()=>{
    const imported={manufacturer_cost:818,additional_cost:0,margin_percent:50}
    expect(salePriceFromMargin(imported)).toBe(1227)
    expect(imported.manufacturer_cost).toBe(818)
    expect(marginFromSalePrice(itemCostTotal(imported),1308.8)).toBe(60)
    expect(salePriceFromMargin({...imported,additional_cost:100})).toBe(1377)
  })
  it('includes manufacturer and additional costs',()=>{
    expect(itemCostTotal({manufacturer_cost:100,additional_cost:40,margin_percent:50})).toBe(140)
  })
  it('applies margin over the consolidated cost',()=>{
    expect(salePriceFromMargin({manufacturer_cost:100,additional_cost:40,margin_percent:50})).toBe(210)
  })
  it('does not allow invalid or negative inputs to reduce the total',()=>{
    expect(salePriceFromMargin({manufacturer_cost:-100,additional_cost:20,margin_percent:-10})).toBe(20)
  })
  it('uses registered supply quantities in the item cost',()=>{
    expect(supplyCostTotal([{quantity:2.5,unit_cost:40},{quantity:1,unit_cost:15}])).toBe(115)
    expect(composedItemCost({manufacturer_cost:100,additional_cost:0,margin_percent:50},[{quantity:2,unit_cost:20}])).toBe(140)
  })
  it('keeps margin and sale price synchronized in both directions',()=>{
    expect(salePriceFromCostAndMargin(200,50)).toBe(300)
    expect(marginFromSalePrice(200,300)).toBe(50)
    expect(marginFromSalePrice(0,300)).toBe(0)
  })
})
