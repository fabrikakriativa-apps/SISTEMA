export type BudgetStatus='draft'|'sent'|'no_response'|'approved'|'rejected'|'cancelled'
export const budgetStatusLabels:Record<BudgetStatus,string>={draft:'Rascunho',sent:'Enviado',no_response:'Sem resposta',approved:'Aprovado',rejected:'Perdido',cancelled:'Cancelado'}
export function budgetStatusOptions(current:BudgetStatus,documentType:'budget'|'pre_budget'='budget'):BudgetStatus[]{
 if(current==='draft')return ['draft','sent','rejected','cancelled']
 if(current==='sent')return documentType==='pre_budget'?['sent','no_response','draft','rejected','cancelled']:['sent','no_response','approved','rejected','cancelled']
 if(current==='no_response')return ['no_response','sent','rejected','cancelled']
 if(current==='rejected')return ['rejected','draft','cancelled']
 return [current]
}
export const statusNeedsReason=(status:BudgetStatus)=>status==='rejected'||status==='cancelled'
