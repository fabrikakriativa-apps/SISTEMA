import {describe,it,expect} from 'vitest'
import {calculateSalesResults,salesOrderIssue,validateLeadTracking,salesDay,type SalesLead,type SalesHistory,type SalesOrder} from './salesResults'
const lead:SalesLead={id:'l',name:'Lead',received_on:'2026-10-05',customer_kind:'new_lead',profile_status:'in_profile',profile_reason:null,capture_source:'Agência',campaign:null,response_status:'active',stage:'budgeting',budget_id:'b',related_budget_ids:[],origin:'Instagram'}
const event=(entity_type:SalesHistory['entity_type'],entity_id:string,recorded_at:string,state:SalesHistory['state']):SalesHistory=>({id:recorded_at+entity_id,entity_type,entity_id,recorded_at,state})
const orders:SalesOrder[]=[{id:'o',display_number:'PED1',budget_id:'b',status:'awaiting_finance',created_at:'2026-12-01T13:00:00Z',total:100},{id:'o2',display_number:'PED2',budget_id:'b',status:'awaiting_finance',created_at:'2026-12-02T13:00:00Z',total:50}]
const history=[event('opportunity','l','2026-10-05T12:00:00Z',{profile_status:'unassessed',stage:'new'}),event('opportunity','l','2026-11-10T12:00:00Z',{profile_status:'in_profile',stage:'budgeting'}),...orders.map(o=>event('order',o.id,o.created_at,{status:o.status,total:o.total}))]
const range={from:'2026-10-01',to:'2026-10-31'}
describe('resultados comerciais',()=>{
 it('explica entrada posterior ao pedido sem confundir com origem comercial',()=>{
  const o={...orders[0],created_at:'2026-10-08T12:00:00Z'}
  const late={...lead,origin:'Indicação',received_on:'2026-10-19'}
  const h=[...history,event('order',o.id,o.created_at,{status:o.status,total:o.total})]
  expect(salesOrderIssue(o,late)).toContain('depois do fechamento')
  const r=calculateSalesResults([late],[],[o],h,range,'2026-10-31')
  expect(r.groups.find(g=>g.key==='unknown')?.orders).toHaveLength(1)
  expect(r.buyers).toHaveLength(0);expect(r.closed).toHaveLength(1)
  expect(salesOrderIssue(o,{...late,received_on:'2026-10-01'})).toBeNull()
 })
 it('distingue vínculo ausente, data ausente e tipo desconhecido',()=>{
  expect(salesOrderIssue(orders[0])).toContain('sem oportunidade')
  expect(salesOrderIssue(orders[0],{...lead,received_on:null})).toContain('Data de entrada')
  expect(salesOrderIssue(orders[0],{...lead,customer_kind:'unknown'})).toContain('Tipo de oportunidade')
 })
 it('retira cancelados dos leads sem apagar pedidos nem a fotografia anterior',()=>{
  const archived={...lead,archived_at:'2026-12-20T12:00:00Z'}
  const h=[...history,event('opportunity','l','2026-12-20T12:00:00Z',{archived_at:archived.archived_at})]
  expect(calculateSalesResults([archived],[],orders,h,range,'2026-12-10').buyers).toHaveLength(1)
  const result=calculateSalesResults([archived],[],orders,h,{from:'2026-12-01',to:'2026-12-31'},'2026-12-31')
  expect(result.rows).toHaveLength(0);expect(result.closed).toHaveLength(2)
  expect(result.groups.find(g=>g.key==='previous')?.buyers).toBe(0)
  expect(result.groups.find(g=>g.key==='unknown')?.orders).toHaveLength(2)
 })
 it('atribui venda de dezembro à captação de outubro apenas na visão acumulada',()=>{
  expect(calculateSalesResults([lead],[],orders,history,range,'2026-10-31').buyers).toHaveLength(0)
  const result=calculateSalesResults([lead],[],orders,history,range,'2026-12-31')
  expect(result.buyers).toHaveLength(1);expect(result.buyers[0].deals).toHaveLength(2);expect(result.immediate).toHaveLength(0)
 })
 it('separa fechamentos de leads antigos e do próprio mês',()=>{
  const r=calculateSalesResults([lead],[],orders,history,{from:'2026-12-01',to:'2026-12-31'},'2026-12-31')
  expect(r.groups.find(g=>g.key==='previous')?.orders).toHaveLength(2);expect(r.groups.find(g=>g.key==='previous')?.buyers).toBe(1)
 })
 it('mantém perfil como era no encerramento do mês, sem inferir compra como qualificação',()=>{
  expect(calculateSalesResults([lead],[],orders,history,range,'2026-10-31').rows[0].profile_status).toBe('unassessed')
  expect(calculateSalesResults([lead],[],orders,history,range,'2026-12-31').qualified).toHaveLength(1)
 })
 it('respeita cancelamento sem apagar a fotografia anterior',()=>{
  const h=[...history,event('order','o','2026-12-20T12:00:00Z',{status:'cancelled',total:100})]
  expect(calculateSalesResults([lead],[],orders,h,range,'2026-12-10').buyers[0].deals).toHaveLength(2)
  expect(calculateSalesResults([lead],[],orders,h,range,'2026-12-31').buyers[0].deals).toHaveLength(1)
 })
 it('não atribui pedidos por coincidência de cliente nem inventa data de entrada',()=>{
  expect(calculateSalesResults([{...lead,budget_id:null}],[],orders,history,range,'2026-12-31').buyers).toHaveLength(0)
  expect(calculateSalesResults([{...lead,received_on:null}],[],orders,history,range,'2026-12-31').unknownEntry).toBe(1)
 })
 it('deduplica propostas e não conta rascunhos',()=>{
  const b={id:'b',display_number:'PRE1',status:'draft',client_id:null,created_at:'2026-10-06T12:00:00Z',total:50}
  expect(calculateSalesResults([lead],[b],[],history,range,'2026-12-31').proposals).toHaveLength(0)
  const h=[...history,event('budget','b','2026-10-10T12:00:00Z',{status:'sent'}),event('budget','b','2026-10-11T12:00:00Z',{status:'sent'})]
  expect(calculateSalesResults([{...lead,related_budget_ids:['b']}],[b],[],h,range,'2026-12-31').proposals[0].proposals).toHaveLength(1)
 })
 it('não mistura sem retorno com fora de perfil',()=>{
  const r=calculateSalesResults([lead],[],[],[event('opportunity','l','2026-10-10T12:00:00Z',{profile_status:'unassessed',response_status:'no_response',stage:'lost'})],range,'2026-10-31')
  expect(r.noResponse).toHaveLength(1);expect(r.outside).toHaveLength(0);expect(r.lost).toHaveLength(0)
 })
 it('valida motivo, tipo de captação e datas',()=>{
  expect(()=>validateLeadTracking({...lead,profile_status:'out_of_profile',profile_reason:''})).toThrow('motivo')
  expect(()=>validateLeadTracking({...lead,customer_kind:'unknown'})).toThrow('recompra')
  expect(()=>validateLeadTracking({...lead,received_on:'2099-01-01'})).toThrow('futura')
  expect(()=>validateLeadTracking({...lead,received_on:'2026-02-30'})).toThrow('válida')
  expect(salesDay('2026-11-01T01:00:00Z')).toBe('2026-10-31')
 })
 it('classifica recompra e vendas sem vínculo sem inflar a conversão',()=>{
  const r=calculateSalesResults([{...lead,customer_kind:'repeat'}],[],[...orders,{...orders[0],id:'unlinked',budget_id:'other'}],[...history,event('order','unlinked','2026-12-01T13:00:00Z',{status:'awaiting_finance',total:100})],{from:'2026-12-01',to:'2026-12-31'},'2026-12-31')
  expect(r.rows).toHaveLength(0);expect(r.groups.find(g=>g.key==='repeat')?.orders).toHaveLength(2);expect(r.groups.find(g=>g.key==='unknown')?.orders).toHaveLength(1)
 })
 it('preserva um negócio reaberto após encerramento sem retorno',()=>{
  const h=[event('opportunity','l','2026-10-10T12:00:00Z',{response_status:'no_response',profile_status:'unassessed'}),event('opportunity','l','2026-11-01T12:00:00Z',{response_status:'active',profile_status:'in_profile'}),...history.filter(e=>e.entity_type==='order')]
  expect(calculateSalesResults([lead],[],orders,h,range,'2026-10-31').noResponse).toHaveLength(1)
  const r=calculateSalesResults([lead],[],orders,h,range,'2026-12-31');expect(r.noResponse).toHaveLength(0);expect(r.buyers).toHaveLength(1)
 })
})

