import {describe,it,expect} from 'vitest'
import {searchOptions,matchesSearch,normalizeSearchText} from './searchOptions'
describe('complete search suggestions',()=>{
  it('keeps matches beyond the first eight suggestions',()=>{
    const options=Array.from({length:20},(_,id)=>({id:String(id),label:`Cliente ${id}`}))
    expect(searchOptions(options,'Cliente')).toHaveLength(20)
    expect(searchOptions(options,'Cliente 19')[0].id).toBe('19')
  })
  it('ignores accents, letter case and extra spaces',()=>{
    const client={id:'1',label:'AMÉLIA BRETAS',detail:'São Caetano do Sul'}
    expect(searchOptions([client],'  amelia   bretas ')).toEqual([client])
    expect(searchOptions([client],'sao caetano')).toEqual([client])
  })
  it('accepts multiple name parts without requiring adjacent words',()=>{
    const client={id:'1',label:'MARIA DA CONCEIÇÃO SILVA'}
    expect(searchOptions([client],'maria silva')).toEqual([client])
  })
})

describe('unified typed search',()=>{
 it('finds accented names with unaccented fragments in any order',()=>{
  expect(matchesSearch('MARIA DA CONCEIÇÃO SILVA',' silva   conceicao MAR ')).toBe(true)
  expect(matchesSearch('João Gonçalves','goncalves joao')).toBe(true)
 })
 it('matches decomposed Unicode accents and ç',()=>{
  expect(matchesSearch('Confecção São José','confeccao jose sao')).toBe(true)
  expect(normalizeSearchText(' AÇÚCAR ')).toBe('acucar')
 })
 it('keeps every term required, including codes',()=>{
  expect(matchesSearch('Maria Silva PED-2026-000128','silva 000128')).toBe(true)
  expect(matchesSearch('Maria Silva PED-2026-000128','silva 000129')).toBe(false)
  expect(matchesSearch('João','maria')).toBe(false)
 })
 it('keeps all results for a blank query and preserves record identity',()=>{
  const rows=[{id:'1',label:'JOSÉ'},{id:'2',label:'JOSE'}]
  expect(searchOptions(rows,'  ')).toEqual(rows)
  expect(searchOptions(rows,'jose')).toEqual(rows)
 })
})
