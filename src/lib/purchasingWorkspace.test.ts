import {describe,it,expect} from 'vitest'
import {purchasingSummary,lineTotal} from './purchasingWorkspace'
describe('compras por item',()=>{
 it('não cria obrigação sem avaliação',()=>expect(purchasingSummary({procurement_review:'pending'},[])).toBe('A avaliar'))
 it('unifica dispensa e estoque sem alterar o histórico',()=>{expect(purchasingSummary({procurement_review:'not_required'},[])).toBe('Não necessita de compra');expect(purchasingSummary({procurement_review:'stock'},[])).toBe('Não necessita de compra')})
 it('conclui apenas quando todas as necessidades ativas foram recebidas',()=>{
  const item={procurement_review:'needed' as const}
  expect(purchasingSummary(item,[])).toBe('Necessidades a informar')
  expect(purchasingSummary(item,[{status:'received'},{status:'cancelled'}])).toBe('Compras concluídas')
  expect(purchasingSummary(item,[{status:'received'},{status:'awaiting_supplier'}])).toBe('Aguardando entrega')
  expect(purchasingSummary(item,[{status:'awaiting_supplier'}],true)).toBe('Compra pendente')
  expect(purchasingSummary(item,[{status:'received'},{status:'awaiting_purchase'}])).toBe('Compra pendente')
 })
 it('arredonda cada linha para centavos',()=>expect(lineTotal({quantity:3.333,unit_cost:12.34})).toBe(41.13))
})

