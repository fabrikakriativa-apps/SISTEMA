import {describe,expect,it} from 'vitest'
import {purchaseStatusOptions} from './purchaseStatus'

describe('fluxo de status da compra',()=>{
 it('permite confirmar ou cancelar um rascunho',()=>expect(purchaseStatusOptions('draft')).toEqual(['draft','awaiting_delivery','cancelled']))
 it('permite receber ou cancelar uma encomenda em andamento',()=>expect(purchaseStatusOptions('delayed')).toEqual(['delayed','completed','cancelled']))
 it('não reabre compras encerradas',()=>{
  expect(purchaseStatusOptions('cancelled')).toEqual(['cancelled'])
  expect(purchaseStatusOptions('returned')).toEqual(['returned'])
 })
})
