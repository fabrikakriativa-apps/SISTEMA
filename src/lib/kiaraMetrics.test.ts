import { describe, expect, it } from 'vitest'
import { formatLeadResponseTime, leadResponseStats, leadAwaitingResponseMs, leadLastInboundMs, type KiaraMessage } from './kiaraMetrics'
const msg = (id: string, min: number, direction: 'incoming'|'outgoing', sender: 'customer'|'kiara'|'human'): KiaraMessage =>
  ({id, direction, sender, text: '', createdAt: new Date(Date.UTC(2026, 10, 1, 12, min)).toISOString()})
describe('tempo medio de resposta do lead', () => {
  it('calcula apenas a primeira resposta do cliente depois da loja', () => {
    const items=[msg('1',0,'outgoing','kiara'),msg('2',5,'incoming','customer'),msg('3',6,'incoming','customer'),msg('4',10,'outgoing','human'),msg('5',25,'incoming','customer')]
    expect(leadResponseStats(items)).toEqual({samples:2,averageMs:600_000})
    expect(formatLeadResponseTime(600_000)).toBe('10 min')
  })
  it('nao inventa media sem resposta nem confunde mensagens consecutivas', () => {
    expect(leadResponseStats([msg('1',0,'incoming','customer')])).toEqual({samples:0,averageMs:null})
    expect(formatLeadResponseTime(null)).toBe('Sem dados')
  })
  it('mostra tempo de espera apenas quando a loja foi a última a falar', () => {
    const now=Date.UTC(2026,10,1,12,30)
    expect(leadAwaitingResponseMs([msg('1',0,'outgoing','kiara')],now)).toBe(30*60_000)
    expect(leadAwaitingResponseMs([msg('1',0,'outgoing','kiara'),msg('2',5,'incoming','customer')],now)).toBeNull()
    expect(leadLastInboundMs([msg('1',0,'outgoing','kiara'),msg('2',5,'incoming','customer')],now)).toBe(25*60_000)
  })
})
