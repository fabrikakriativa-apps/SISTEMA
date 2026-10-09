import {describe,it,expect} from 'vitest'
import {catalogSearchFilter} from './catalogSearch'
describe('catalog search',()=>{
 it('searches all three columns',()=>expect(catalogSearchFilter(' FK-3000 ')).toBe('code.ilike."%FK-3000%",name.ilike."%FK-3000%",category.ilike."%FK-3000%"'))
 it('quotes commas and parentheses',()=>expect(catalogSearchFilter('Tecido (azul, verde)')).toContain('name.ilike."%Tecido (azul, verde)%"'))
 it('escapes wildcard characters and quotes',()=>expect(catalogSearchFilter('50%_"')).toContain('50\\%\\_\\"'))
})
