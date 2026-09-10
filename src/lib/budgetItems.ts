export type ItemCosts = {
  manufacturer_cost:number
  installation_cost:number
  additional_cost:number
  margin_percent:number
}

export type SupplyCost={quantity:number;unit_cost:number}

const positive=(value:number)=>Number.isFinite(value)?Math.max(0,value):0

export function itemCostTotal(item:ItemCosts) {
  return Number((positive(item.manufacturer_cost)+positive(item.installation_cost)+positive(item.additional_cost)).toFixed(2))
}

export function salePriceFromMargin(item:ItemCosts) {
  return Number((itemCostTotal(item)*(1+positive(item.margin_percent)/100)).toFixed(2))
}

export function supplyCostTotal(lines:SupplyCost[]){
  return Number(lines.reduce((sum,line)=>sum+positive(line.quantity)*positive(line.unit_cost),0).toFixed(2))
}

export function composedItemCost(item:ItemCosts,lines:SupplyCost[]){
  return Number((itemCostTotal(item)+supplyCostTotal(lines)).toFixed(2))
}

export function salePriceFromCostAndMargin(cost:number,marginPercent:number){
  return Number((positive(cost)*(1+positive(marginPercent)/100)).toFixed(2))
}

export function marginFromSalePrice(cost:number,salePrice:number){
  const safeCost=positive(cost)
  return safeCost>0?Number((((positive(salePrice)/safeCost)-1)*100).toFixed(2)):0
}
