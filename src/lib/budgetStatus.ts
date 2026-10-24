export type BudgetStatus='draft'|'sent'|'approved'|'rejected'|'cancelled'
export const budgetStatusLabels:Record<BudgetStatus,string>={draft:'Rascunho',sent:'Enviado',approved:'Aprovado',rejected:'Perdido',cancelled:'Cancelado'}
export function budgetStatusOptions(current:BudgetStatus,documentType:'budget'|'pre_budget'='budget'):BudgetStatus[]{
 if(current==='draft')return ['draft','sent','rejected','cancelled']
 if(current==='sent')return documentType==='pre_budget'?['sent','draft','rejected','cancelled']:['sent','approved','rejected','cancelled']
 if(current==='rejected')return ['rejected','draft','cancelled']
 return [current]
}
export const statusNeedsReason=(status:BudgetStatus)=>status==='rejected'||status==='cancelled'
