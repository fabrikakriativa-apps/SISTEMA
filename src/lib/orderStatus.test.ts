import { describe, expect, it } from 'vitest'
import { orderStatusOptions } from './orderStatus'

describe('orderStatusOptions', () => {
  it('permite somente o avanço financeiro a partir do pedido criado', () => {
    expect(orderStatusOptions('awaiting_finance')).toEqual(['awaiting_finance', 'awaiting_purchase', 'cancelled'])
  })

  it('mantém cancelamento como estado terminal', () => {
    expect(orderStatusOptions('cancelled')).toEqual(['cancelled'])
  })
})
