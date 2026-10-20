import {describe,it,expect} from 'vitest'
import {matchesOpportunitySearch} from './opportunitySearch'
import type {SalesLead,SalesOrder} from './salesResults'
const lead:SalesLead={id:'l',name:'Sílvia',received_on:'2026-10-19',profile_status:'in_profile',profile_reason:null,capture_source:'Indicação',campaign:null,customer_kind:'new_lead',response_status:'active',stage:'budgeting',budget_id:'b',related_budget_ids:['other'],origin:null}
const order:SalesOrder={id:'o',display_number:'PED-2026-000125',budget_id:'b',status:'awaiting_finance',created_at:'2026-10-08T12:00:00Z',total:5000}
describe('busca da prospecção',()=>{
 it('localiza pedido por código completo, sufixo e sem zeros à esquerda',()=>{
  for(const q of ['PED-2026-000125','000125','125','Pedido 125','Pedido 000125'])expect(matchesOpportunitySearch(lead,[order],q)).toBe(true)
 })
 it('pesquisa vínculos adicionais sem associar pedidos de outro atendimento',()=>{
  expect(matchesOpportunitySearch(lead,[{...order,budget_id:'other'}],'125')).toBe(true)
  expect(matchesOpportunitySearch(lead,[{...order,budget_id:'unrelated'}],'125')).toBe(false)
  expect(matchesOpportunitySearch(lead,[{...order,status:'cancelled'}],'125')).toBe(false)
 })
 it('preserva busca textual, aceita acentos e consulta vazia',()=>{
  for(const q of ['silvia','indicacao',''])expect(matchesOpportunitySearch(lead,[],q)).toBe(true)
  expect(matchesOpportunitySearch(lead,[],'126')).toBe(false)
 })
})

