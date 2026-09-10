export type AppRole = 'admin' | 'comercial' | 'compras' | 'financeiro' | 'operacao'

export type ModuleKey =
  | 'inicio' | 'prospeccao' | 'clientes' | 'insumos' | 'orcamentos'
  | 'pedidos' | 'compras' | 'financeiro' | 'agenda' | 'fornecedores' | 'administracao'

export type Metric = { label: string; value: string; helper: string; tone?: 'gold' | 'green' | 'rose' }

export const orderStatuses = [
  'Aguardando confirmação financeira', 'Aguardando compra', 'Aguardando fornecedor',
  'Em preparação', 'Pronto para agendar', 'Agendado', 'Parcialmente concluído',
  'Concluído', 'Com pendência', 'Cancelado',
] as const

export const knownItemFamilies = [
  'Cortina', 'Persiana', 'Confecção', 'Reforma de estofados', 'Papel de parede',
] as const

export const confectionSubitems = ['Cabeceira', 'Sofá', 'Estofado para bancos', 'Outros'] as const
