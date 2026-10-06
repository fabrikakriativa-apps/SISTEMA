import { describe, expect, it } from 'vitest'
import { itemFieldRules } from './itemFieldRules'
describe('campos por tipo de item', () => {
  it.each(['confection', 'upholstery', 'upholstery_reform'])('simplifica %s', key => {
    expect(itemFieldRules(key)).toEqual({environment:false,manufacturerCost:false,additionalCost:false})
  })
  it('mantém ambiente no papel de parede, sem custos avulsos', () => {
    expect(itemFieldRules('wallpaper')).toEqual({environment:true,manufacturerCost:false,additionalCost:false})
  })
  it('preserva custos do fabricante para cortinas', () => {
    expect(itemFieldRules('curtain')).toEqual({environment:true,manufacturerCost:true,additionalCost:true})
  })
})
