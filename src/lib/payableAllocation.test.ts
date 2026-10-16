import { describe, it, expect } from 'vitest'
import { allocationError } from './payableAllocation'
const row = (order_id: string, amount: number) => ({ order_id, amount, budget_item_id: '', search: order_id })
describe('rateio de conta do fornecedor', () => {
  it('permite conta sem pedido', () => expect(allocationError([], 100)).toBeNull())
  it('fecha o exemplo de dois pedidos sem duplicar total', () => expect(allocationError([row('a', 1072.38), row('b', 671.57)], 1743.95)).toBeNull())
  it('rejeita rateio incompleto', () => expect(allocationError([row('a', 50)], 100)).not.toBeNull())
  it('rejeita pedido digitado sem seleção', () => expect(allocationError([row('', 100)], 100)).not.toBeNull())
  it('rejeita mesmo pedido repetido', () => expect(allocationError([row('a', 50), row('a', 50)], 100)).not.toBeNull())
  it('rejeita valor zero', () => expect(allocationError([row('a', 0)], 0)).not.toBeNull())
  it('compara em centavos', () => expect(allocationError([row('a', .1), row('b', .2)], .3)).toBeNull())
})

