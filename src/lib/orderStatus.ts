export type OrderStatus='awaiting_finance'|'awaiting_purchase'|'awaiting_supplier'|'preparing'|'ready_to_schedule'|'scheduled'|'partially_completed'|'completed'|'pending_issue'|'cancelled'
export const orderStatusLabels:Record<OrderStatus,string>={awaiting_finance:'Aguardando financeiro',awaiting_purchase:'Aguardando compra',awaiting_supplier:'Aguardando fornecedor',preparing:'Em preparação',ready_to_schedule:'Para agendar',scheduled:'Agendado',partially_completed:'Parcialmente concluído',completed:'Concluído',pending_issue:'Com pendência',cancelled:'Cancelado'}
export const operationalStatuses=['preparing','ready_to_schedule','scheduled','completed','pending_issue'] as const
export function orderStatusOptions(current:OrderStatus):OrderStatus[]{
 if(current==='completed'||current==='cancelled')return[current]
 if(current==='awaiting_finance')return[current,'cancelled']
 if(current==='awaiting_purchase'||current==='awaiting_supplier')return[current,'cancelled']
 return Array.from(new Set([current,...operationalStatuses,'cancelled'])) as OrderStatus[]
}
