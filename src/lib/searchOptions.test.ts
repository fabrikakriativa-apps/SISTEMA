import {describe,it,expect} from 'vitest'
import {searchOptions} from './searchOptions'
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
