import { describe, expect, it } from 'vitest'
import { calculateUpholsteryEstimate, type UpholsteryEstimate } from './upholsteryEstimate'

describe('calculateUpholsteryEstimate',()=>{
  it('calculates foam and combines only pieces with the same fabric reference',()=>{
    const estimate:UpholsteryEstimate={fabric_width:1.4,fabric_estimate:80,labor_estimate:100,additional_estimate:0,margin_percent:50,pieces:[
      {id:'1',name:'Cabeceira',width:2,height:1,thickness:3,density:'d28',fabric_reference:'Linho'},
      {id:'2',name:'Assento',width:1,height:.5,thickness:3,density:'d28',fabric_reference:'Linho'},
      {id:'3',name:'Encosto',width:1,height:.5,thickness:3,density:'d28',fabric_reference:'Veludo'},
    ]}
    const result=calculateUpholsteryEstimate(estimate)
    expect(result.foam_total).toBe(1116)
    expect(result.fabric_groups).toEqual([{reference:'Linho',meters:3.5,piece_count:2},{reference:'Veludo',meters:1.5,piece_count:1}])
    expect(result.base_total).toBe(1296)
    expect(result.sale_total).toBe(1944)
  })
})
