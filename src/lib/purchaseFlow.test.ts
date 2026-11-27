import {describe,it,expect} from 'vitest'
import {distributePurchaseTotal,purchaseFinancialLabel,purchaseDeliveryLabel} from './purchaseFlow'
describe('pedido único ao fornecedor',()=>{
 it('distribui desconto sem perder centavos nem alterar a previsão',()=>{
  const lines=[{id:'a',quantity:13,unit_cost:51},{id:'b',quantity:1,unit_cost:100}]
  const result=distributePurchaseTotal(598.01,lines)
  expect(Math.round(Object.values(result).reduce((s,v)=>s+v,0)*100)).toBe(59801)
  expect(lines[0].unit_cost).toBe(51)
 })
 it('distribui inclusive quando a previsão não existe',()=>expect(distributePurchaseTotal(.01,[{id:'a',quantity:1,unit_cost:0},{id:'b',quantity:1,unit_cost:0}])).toEqual({a:.01,b:0}))
 it('aceita valor maior que o previsto e valor zero por item',()=>expect(distributePurchaseTotal(900,[{id:'a',quantity:1,unit_cost:100}])).toEqual({a:900}))
 it('não confunde recebimento com pagamento',()=>{
  expect(purchaseDeliveryLabel('completed')).toBe('Concluído')
  expect(purchaseFinancialLabel({invoice_on_delivery:true,payables:[],purchase_items:[{}]})).toBe('A faturar na entrega')
  expect(purchaseFinancialLabel({invoice_on_delivery:true,payables:[{status:'open',amount:100,paid_amount:0}],purchase_items:[{invoice_id:'x'},{}]})).toBe('Faturado parcialmente')
  expect(purchaseFinancialLabel({payables:[{status:'settled',amount:100,paid_amount:100}],purchase_items:[{}]})).toBe('Pago')
 })
 it('recusa totais não finitos',()=>expect(()=>distributePurchaseTotal(NaN,[{id:'a',quantity:1,unit_cost:1}])).toThrow())
})
