import { describe,expect,it } from 'vitest'
import { composedItemCost,itemCostTotal,marginFromSalePrice,salePriceFromCostAndMargin,salePriceFromMargin,supplyCostTotal } from './budgetItems'

describe('budget item totals',()=>{
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

