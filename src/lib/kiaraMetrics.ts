export type KiaraMessage = {
  id: string
  direction: 'incoming' | 'outgoing'
  sender: 'customer' | 'kiara' | 'human'
  createdAt: string
  text: string
}
export type KiaraConversation = {
  id: string
  name: string | null
  phone: string
  status: 'ai' | 'waiting_human' | 'human' | 'no_interaction'
  origin: string | null
  campaign: string | null
  region: string | null
  lastInteractionAt: string
  messages: KiaraMessage[]
}

// Mede apenas quanto tempo o CLIENTE leva para responder a uma mensagem da loja.
// Não conta mensagens consecutivas dele nem atrasos da Kiara.
// Respostas com intervalo superior a 7 dias são excluídas por poderem ser novos atendimentos.
export function leadResponseStats(messages: KiaraMessage[]) {
  const chronological = [...messages].filter(m => Number.isFinite(Date.parse(m.createdAt)))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  const delays: number[] = []
  let lastBusinessAt: number | null = null
  for (const message of chronological) {
    const at = Date.parse(message.createdAt)
    if (message.direction === 'outgoing') {
      // Se a loja enviar mais de uma mensagem, conta a partir da última.
      lastBusinessAt = at
    } else if (lastBusinessAt !== null) {
      const delay = at - lastBusinessAt
      if (delay >= 0 && delay <= 7 * 24 * 60 * 60 * 1000) delays.push(delay)
      // Mensagens consecutivas do cliente não contam como novas respostas.
      lastBusinessAt = null
    }
  }
  return {
    samples: delays.length,
    averageMs: delays.length ? Math.round(delays.reduce((sum, value) => sum + value, 0) / delays.length) : null,
  }
}

export function formatLeadResponseTime(ms: number | null) {
  if (ms === null) return 'Sem dados'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return 'menos de 1 min'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60), remaining = minutes % 60
  return remaining ? `${hours}h ${remaining}min` : `${hours}h`
}
