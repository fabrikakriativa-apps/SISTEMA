import {describe,it,expect} from 'vitest'
import {resolveOpportunityOrigins} from './opportunityOrigin'
describe('origem vinculada ao cadastro',()=>{
 const lead={id:'l',client_id:'c' as string|null,origin:null as string|null,stage:'budgeting'}
 it('mostra a origem complementada no cadastro sem modificar a oportunidade',()=>{
  expect(resolveOpportunityOrigins([lead],[{id:'c',origin:'Porta de loja'}])[0]).toEqual({...lead,origin:'Porta de loja'})
  expect(lead.origin).toBeNull()
 })
 it('acompanha novas alterações do cadastro sem congelar uma cópia',()=>{
  expect(resolveOpportunityOrigins([lead],[{id:'c',origin:'Google'}])[0].origin).toBe('Google')
  expect(resolveOpportunityOrigins([lead],[{id:'c',origin:'Instagram'}])[0].origin).toBe('Instagram')
 })
 it('preserva origem específica e informações comerciais',()=>{
  const explicit={...lead,origin:'Indicação'}
  expect(resolveOpportunityOrigins([explicit],[{id:'c',origin:'Google'}])[0]).toBe(explicit)
 })
 it('não cruza vínculos e trata valores vazios',()=>{
  expect(resolveOpportunityOrigins([{...lead,client_id:null},{...lead,client_id:'other'},{...lead,origin:' '}],[{id:'c',origin:' Google '}]).map(x=>x.origin)).toEqual([null,null,'Google'])
 })
})
