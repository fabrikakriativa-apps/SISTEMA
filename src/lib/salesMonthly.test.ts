import {describe,it,expect} from 'vitest'
import {monthlyClosings} from './salesMonthly'
import type {SalesLead,SalesOrder} from './salesResults'
const lead:SalesLead={id:'l',name:'Lead',received_on:'2026-10-05',customer_kind:'new_lead',profile_status:'unassessed',profile_reason:null,capture_source:null,campaign:null,response_status:'active',stage:'new',budget_id:'b',related_budget_ids:[],origin:null}
const order:SalesOrder={id:'o',display_number:'PED1',budget_id:'b',status:'active',created_at:'2026-12-01T13:00:00Z',total:100}
describe('fechamentos mensais',()=>{
 it('classifica pela distância entre meses e não pelo período selecionado',()=>{
  const r=monthlyClosings([order],[lead],{from:'2026-10-01',to:'2026-12-31'})
  expect(r.map(m=>m.total)).toEqual([0,0,1]);expect(r[2].groups.find(g=>g.key==='older')?.orders).toHaveLength(1)
 })
 it('separa próprio mês, anterior e a virada do ano',()=>{
  for(const [received_on,key] of [['2026-12-01','current'],['2026-11-30','previous'],['2026-10-31','older']]){
   expect(monthlyClosings([order],[{...lead,received_on}],{from:'2026-12-01',to:'2026-12-31'})[0].groups.find(g=>g.key===key)?.orders).toHaveLength(1)
  }
  expect(monthlyClosings([{...order,created_at:'2027-01-02T12:00:00Z'}],[{...lead,received_on:'2026-12-31'}],{from:'2027-01-01',to:'2027-01-31'})[0].groups.find(g=>g.key==='previous')?.orders).toHaveLength(1)
 })
 it('conta dois pedidos sem alterar conversão e separa recompra e pendências',()=>{
  const r=monthlyClosings([order,{...order,id:'o2'},{...order,id:'x',budget_id:'x'}],[{...lead,customer_kind:'repeat'}],{from:'2026-12-01',to:'2026-12-31'})[0]
  expect(r.total).toBe(3);expect(r.groups.find(g=>g.key==='repeat')?.value).toBe(200);expect(r.groups.find(g=>g.key==='unknown')?.orders).toHaveLength(1)
  expect(monthlyClosings([order],[{...lead,received_on:'2026-12-02'}],{from:'2026-12-01',to:'2026-12-31'})[0].groups.find(g=>g.key==='unknown')?.orders).toHaveLength(1)
 })
 it('usa o mês no fuso de São Paulo',()=>{
  expect(monthlyClosings([{...order,created_at:'2026-12-01T01:00:00Z'}],[lead],{from:'2026-11-01',to:'2026-12-31'}).map(m=>m.total)).toEqual([1,0])
 })
})
