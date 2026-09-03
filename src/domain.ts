export type AppRole = 'admin' | 'comercial' | 'compras' | 'financeiro' | 'operacao'

export type ModuleKey =
  | 'inicio' | 'prospeccao' | 'clientes' | 'insumos' | 'orcamentos'
  | 'pedidos' | 'compras' | 'financeiro' | 'agenda' | 'administracao'

export type Metric = { label: string; value: string; helper: string; tone?: 'gold' | 'green' | 'rose' }

export const orderStatuses = [
  'Aguardando confirmação financeira', 'Aguardando compra', 'Aguardando fornecedor',
  'Em preparação', 'Pronto para agendar', 'Agendado', 'Parcialmente concluído',
  'Concluído', 'Com pendência', 'Cancelado',
] as const

export const knownItemFamilies = [
  'Cortina', 'Persiana', 'Papel de parede', 'Cabeceira', 'Confecção',
  'Reforma de estofados', 'Diversos',
] as const
