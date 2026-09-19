export type BudgetStatus='draft'|'sent'|'approved'|'rejected'|'cancelled'
export const budgetStatusLabels:Record<BudgetStatus,string>={draft:'Rascunho',sent:'Enviado',approved:'Aprovado',rejected:'Reprovado',cancelled:'Cancelado'}
export function budgetStatusOptions(current:BudgetStatus):BudgetStatus[]{
 if(current==='draft')return ['draft','sent','cancelled']
 if(current==='sent')return ['sent','approved','rejected','cancelled']
 if(current==='rejected')return ['rejected','draft','cancelled']
 return [current]
}
export const statusNeedsReason=(status:BudgetStatus)=>status==='rejected'||status==='cancelled'
