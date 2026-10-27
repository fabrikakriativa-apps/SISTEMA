import {describe,it,expect} from 'vitest'
import {catalogSearchFilter,supplyCategoryOptions} from './catalogSearch'
describe('catalog search',()=>{
 it('lists all distinct material types, independently of matching names',()=>{
  expect(supplyCategoryOptions([{category:'Tecido'},{category:'Papel de parede'},{category:'Tecido'},{category:''},{category:null}])).toEqual(['Papel de parede','Tecido'])
 })
 it('preserves exact category values used by the server filter',()=>expect(supplyCategoryOptions([{category:'Tecido (externo)'},{category:'Papel, vinílico'}])).toEqual(['Papel, vinílico','Tecido (externo)']))
 it('searches all three columns',()=>expect(catalogSearchFilter(' FK-3000 ')).toBe('code.ilike."%FK-3000%",name.ilike."%FK-3000%",category.ilike."%FK-3000%"'))
 it('quotes commas and parentheses',()=>expect(catalogSearchFilter('Tecido (azul, verde)')).toContain('name.ilike."%Tecido (azul, verde)%"'))
 it('escapes wildcard characters and quotes',()=>expect(catalogSearchFilter('50%_"')).toContain('50\\%\\_\\"'))
})
