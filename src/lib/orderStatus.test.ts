import { describe, expect, it } from 'vitest'
import { orderStatusOptions } from './orderStatus'

describe('orderStatusOptions', () => {
  it('mantém a configuração financeira como ação própria do pedido', () => {
    expect(orderStatusOptions('awaiting_finance')).toEqual(['awaiting_finance', 'cancelled'])
  })

  it('mantém cancelamento como estado terminal', () => {
    expect(orderStatusOptions('cancelled')).toEqual(['cancelled'])
  })

  it('não permite pular compras pendentes pela interface', () => {
    expect(orderStatusOptions('awaiting_purchase')).toEqual(['awaiting_purchase', 'cancelled'])
    expect(orderStatusOptions('awaiting_supplier')).toEqual(['awaiting_supplier', 'cancelled'])
  })
})
