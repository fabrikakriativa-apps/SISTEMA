import { describe, expect, it } from 'vitest'
import { calculateUpholsteryEstimate, upholsteryDescription, type UpholsteryEstimate } from './upholsteryEstimate'

describe('calculateUpholsteryEstimate',()=>{
  it('uses manually entered rates and editable foam without changing the service area',()=>{
    const estimate:UpholsteryEstimate={pieces:[{id:'1',name:'Cabeceira',width:2,height:1,thickness:3,density:'d28',fabric_reference:'',cost_per_square_meter:100},{id:'2',name:'Painel',width:1,height:1,thickness:5,density:'d28_soft',fabric_reference:'',cost_per_square_meter:250}],fabric_width:1.4,fabric_estimate:0,labor_estimate:0,additional_estimate:0,margin_percent:50}
    expect(calculateUpholsteryEstimate(estimate).pricing_ready).toBe(true)
    expect(calculateUpholsteryEstimate(estimate).upholstery_cost).toBe(450)
    expect(calculateUpholsteryEstimate(estimate).sale_total).toBe(675)
    const changed=calculateUpholsteryEstimate({...estimate,pieces:estimate.pieces.map(p=>({...p,foam_quantity_manual:4,density:'d23',thickness:8}))})
    expect(changed.foam_quantity).toBe(8)
    expect(changed.upholstery_cost).toBe(450)
    expect(calculateUpholsteryEstimate({...estimate,pieces:estimate.pieces.map(p=>({...p,foam_quantity_manual:0}))}).foam_quantity).toBe(0)
    expect(calculateUpholsteryEstimate({...estimate,pieces:estimate.pieces.map(p=>({...p,foam_quantity_manual:null}))}).foam_quantity).toBe(3)
  })
  it('does not invent a price for legacy estimates without manual rates',()=>{
    const estimate:UpholsteryEstimate={pieces:[{id:'1',name:'Cabeceira',width:2,height:1,thickness:3,density:'d28',fabric_reference:''}],fabric_width:1.4,fabric_estimate:0,labor_estimate:0,additional_estimate:0,margin_percent:70}
    expect(calculateUpholsteryEstimate(estimate).pricing_ready).toBe(false)
    expect(calculateUpholsteryEstimate(estimate).upholstery_cost).toBe(0)
  })
  it('multiplies the entered value by manual meters and preserves legacy calculation without override',()=>{
    const estimate:UpholsteryEstimate={pieces:[],fabric_width:1.4,fabric_estimate:87,labor_estimate:100,additional_estimate:10,margin_percent:45}
    expect(calculateUpholsteryEstimate(estimate).base_total).toBe(197)
    const manual=calculateUpholsteryEstimate({...estimate,fabric_meters_manual:5})
    expect(manual.fabric_cost).toBe(435)
    expect(manual.base_total).toBe(545)
    expect(manual.sale_total).toBe(790.25)
    expect(calculateUpholsteryEstimate({...estimate,fabric_meters_manual:0}).fabric_cost).toBe(0)
    expect(calculateUpholsteryEstimate({...estimate,fabric_meters_manual:null}).base_total).toBe(197)
  })
  it('calculates foam and combines only pieces with the same fabric reference',()=>{
    const estimate:UpholsteryEstimate={fabric_width:1.4,fabric_estimate:80,labor_estimate:100,additional_estimate:0,margin_percent:50,pieces:[
      {id:'1',name:'Cabeceira',width:2,height:1,thickness:3,density:'d28',fabric_reference:'Linho',cost_per_square_meter:372},
      {id:'2',name:'Assento',width:1,height:.5,thickness:3,density:'d28',fabric_reference:'Linho',cost_per_square_meter:372},
      {id:'3',name:'Encosto',width:1,height:.5,thickness:3,density:'d28',fabric_reference:'Veludo',cost_per_square_meter:372},
    ]}
    const result=calculateUpholsteryEstimate(estimate)
    expect(result.upholstery_cost).toBe(1116)
    expect(result.foam_quantity).toBe(3)
    expect(result.fabric_groups).toEqual([{reference:'Linho',meters:3.5,piece_count:2},{reference:'Veludo',meters:1.5,piece_count:1}])
    expect(result.base_total).toBe(1296)
    expect(result.sale_total).toBe(1944)
    expect(upholsteryDescription(estimate,result)).toContain('Item: Cabeceira')
    expect(upholsteryDescription(estimate,result)).toContain('Medidas aproximadas: 2 m x 1 m\n')
    expect(upholsteryDescription(estimate,result)).not.toContain('x 0,03 m')
    expect(upholsteryDescription(estimate,result)).toContain('Espuma: D28 — espessura: 3 cm')
    expect(upholsteryDescription(estimate,result)).toContain('Espuma: D28')
    expect(upholsteryDescription(estimate,result)).toContain('Tecido: Linho')
    expect(upholsteryDescription(estimate,result)).not.toContain('metragem estimada')
  })
  it('keeps piece thickness separate from foam thickness and cost',()=>{
    const estimate:UpholsteryEstimate={pieces:[{id:'1',name:'Cabeceira',width:2,height:1,piece_thickness:10,thickness:3,density:'d28',fabric_reference:''}],fabric_width:1.4,fabric_estimate:0,labor_estimate:0,additional_estimate:0,margin_percent:0}
    expect(upholsteryDescription(estimate)).toContain('Medidas aproximadas: 2 m x 1 m x 0,1 m')
    expect(upholsteryDescription(estimate)).toContain('Espuma: D28 — espessura: 3 cm')
    expect(calculateUpholsteryEstimate(estimate).base_total).toBe(calculateUpholsteryEstimate({...estimate,pieces:estimate.pieces.map(p=>({...p,piece_thickness:20}))}).base_total)
  })
})

