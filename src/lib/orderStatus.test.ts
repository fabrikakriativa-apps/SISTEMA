import { describe, expect, it } from 'vitest'
import { orderStatusOptions } from './orderStatus'

describe('orderStatusOptions', () => {
  it('mantém a configuração financeira como ação própria do pedido', () => {
    expect(orderStatusOptions('awaiting_finance')).toContain('awaiting_purchase')
  })

  it('mantém cancelamento como estado terminal', () => {
    expect(orderStatusOptions('cancelled')).toEqual(['cancelled'])
  })

  it('permite definir o status manualmente, inclusive retornar ao financeiro', () => {
    expect(orderStatusOptions('awaiting_purchase')).toContain('awaiting_finance')
    expect(orderStatusOptions('completed')).toContain('preparing')
  })
})
