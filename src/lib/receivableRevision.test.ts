import {describe,it,expect} from 'vitest'
import {distributeRevision,editableReceivable,revisionSnapshot} from './receivableRevision'
describe('receivable revision',()=>{
 it('changes count without changing total, handling cents and month end',()=>{
  const parts=distributeRevision(500,3,'2026-01-31')
  expect(parts.map(x=>x.amount)).toEqual([166.66,166.66,166.68])
  expect(parts.map(x=>x.due_date)).toEqual(['2026-01-31','2026-02-28','2026-03-31'])
  expect(distributeRevision(500,1,'2026-10-09')).toEqual([{amount:500,due_date:'2026-10-09'}])
 })
 it('protects receipts and normalizes the concurrency snapshot',()=>{
  const row={id:'a',installment:1,installment_count:1,amount:500,paid_amount:0,status:'open',due_date:'2026-10-09',payment_method:'PIX'}
  expect(editableReceivable(row)).toBe(true)
  expect(editableReceivable({...row,paid_amount:100})).toBe(false)
  expect(editableReceivable({...row,status:'paid'})).toBe(false)
  expect(revisionSnapshot([row,{...row,id:'b',status:'cancelled'}])).toEqual([row])
 })
})
