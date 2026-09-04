export type ItemCosts = {
  manufacturer_cost:number
  installation_cost:number
  additional_cost:number
  margin_percent:number
}

const positive=(value:number)=>Number.isFinite(value)?Math.max(0,value):0

export function itemCostTotal(item:ItemCosts) {
  return Number((positive(item.manufacturer_cost)+positive(item.installation_cost)+positive(item.additional_cost)).toFixed(2))
}

export function salePriceFromMargin(item:ItemCosts) {
  return Number((itemCostTotal(item)*(1+positive(item.margin_percent)/100)).toFixed(2))
}
