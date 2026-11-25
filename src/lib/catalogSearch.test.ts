import {describe,it,expect} from 'vitest'
import {catalogSearchFilter,supplyCategoryOptions,catalogSearchPatterns,supplySearchOptions} from './catalogSearch'
describe('catalog search',()=>{
 it('lists all distinct material types, independently of matching names',()=>{
  expect(supplyCategoryOptions([{category:'Tecido'},{category:'Papel de parede'},{category:'Tecido'},{category:''},{category:null}])).toEqual(['Papel de parede','Tecido'])
 })
 it('preserves exact category values used by the server filter',()=>expect(supplyCategoryOptions([{category:'Tecido (externo)'},{category:'Papel, vinílico'}])).toEqual(['Papel, vinílico','Tecido (externo)']))
 it('searches all three columns',()=>expect(catalogSearchFilter(' FK-3000 ')).toBe('code.ilike."%FK-3000%",name.ilike."%FK-3000%",category.ilike."%FK-3000%"'))
 it('quotes commas and parentheses',()=>expect(catalogSearchFilter('Tecido (azul, verde)')).toContain('name.ilike."%Tecido (azul, verde)%"'))
 it('escapes wildcard characters and quotes',()=>expect(catalogSearchFilter('50%_"')).toContain('50\\%\\_\\"'))
})

describe('accent-free paginated catalog search',()=>{
 it('normalizes each fragment separately',()=>expect(catalogSearchPatterns('  JOSÉ   Algodão  ')).toEqual(['%jose%','%algodao%']))
 it('preserves literal wildcard characters',()=>expect(catalogSearchPatterns('50%_')).toEqual(['%50\\%\\_%']))
 it('does not create a filter for blank input',()=>expect(catalogSearchPatterns('   ')).toEqual([]))
})


describe('search across supply fields',()=>{
 it('combines collection, cost and exact active status',()=>expect(supplySearchOptions('SIENA R$ 26,90 ativo')).toEqual({active:true,patterns:['%siena%','%26,90%']}))
 it('does not match inactive items when active is requested',()=>expect(supplySearchOptions('Ativos')).toEqual({active:true,patterns:[]}))
 it('searches inactive status and supplier together',()=>expect(supplySearchOptions('ANTUARTE inativos')).toEqual({active:false,patterns:['%antuarte%']}))
 it('normalizes formatted currency with thousands',()=>expect(supplySearchOptions('R$1.400,00')).toEqual({active:undefined,patterns:['%1400,00%']}))
 it('keeps accent normalization and fragment order independence',()=>expect(supplySearchOptions('Coleção algodão')).toEqual({active:undefined,patterns:['%colecao%','%algodao%']}))
 it('does not interpolate filter syntax',()=>expect(supplySearchOptions('50%_')).toEqual({active:undefined,patterns:['%50\\%\\_%']}))
})
