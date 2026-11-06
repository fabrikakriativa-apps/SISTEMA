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
 it('usa a origem compartilhada mesmo quando havia uma cópia antiga',()=>{
  const explicit={...lead,origin:'Indicação'}
  expect(resolveOpportunityOrigins([explicit],[{id:'c',origin:'Google'}])[0]).toEqual({...explicit,origin:'Google'})
 })
 it('não cruza vínculos e trata valores vazios',()=>{
  expect(resolveOpportunityOrigins([{...lead,client_id:null},{...lead,client_id:'other'},{...lead,origin:' '}],[{id:'c',origin:' Google '}]).map(x=>x.origin)).toEqual([null,null,'Google'])
 })
})

describe('origem única sem mudar a captação',()=>{
 it('preserva campanha e mídia paga ao atualizar somente o canal',()=>{
  const lead={client_id:'c',origin:'Instagram',capture_kind:'paid',campaign:'PB3',stage:'budgeting'}
  expect(resolveOpportunityOrigins([lead],[{id:'c',origin:'Meta — Instagram/Facebook'}])[0]).toEqual({...lead,origin:'Meta — Instagram/Facebook'})
 })
 it('permite limpar a origem compartilhada',()=>expect(resolveOpportunityOrigins([{client_id:'c',origin:'Instagram'}],[{id:'c',origin:null}])[0].origin).toBeNull())
 it('preserva o histórico dos lançamentos cancelados',()=>{
  const lead={client_id:'c',origin:'Indicação',archived_at:'2026-11-01'}
  expect(resolveOpportunityOrigins([lead],[{id:'c',origin:'Google'}])[0]).toBe(lead)
 })
})
