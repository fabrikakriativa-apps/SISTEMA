import{describe,expect,it}from'vitest'
import{budgetStatusOptions,statusNeedsReason,budgetStatusLabels}from'./budgetStatus'
describe('budget status',()=>{
 it('oferece aprovação somente depois do envio',()=>{expect(budgetStatusOptions('draft')).not.toContain('approved');expect(budgetStatusOptions('sent')).toContain('approved')})
 it('mantém aprovado como terminal no orçamento',()=>expect(budgetStatusOptions('approved')).toEqual(['approved']))
 it('exige motivo em rejeição e cancelamento',()=>{expect(statusNeedsReason('rejected')).toBe(true);expect(statusNeedsReason('cancelled')).toBe(true)})
 it('oferece perdido e cancelado nos dois documentos sem exigir envio',()=>{
  for(const kind of ['budget','pre_budget'] as const)for(const status of ['draft','sent'] as const){expect(budgetStatusOptions(status,kind)).toContain('rejected');expect(budgetStatusOptions(status,kind)).toContain('cancelled')}
  expect(budgetStatusLabels.rejected).toBe('Perdido')
  expect(budgetStatusOptions('sent','pre_budget')).not.toContain('approved')
 })
 it('permite reabrir perdido e mantém cancelamento terminal',()=>{expect(budgetStatusOptions('rejected','pre_budget')).toContain('draft');expect(budgetStatusOptions('cancelled')).toEqual(['cancelled'])})
 it('sem resposta mantém a negociação pendente, sem motivo de perda',()=>{
  for(const kind of ['pre_budget','budget'] as const){expect(budgetStatusOptions('sent',kind)).toContain('no_response');expect(budgetStatusOptions('no_response',kind)).toEqual(['no_response','sent','rejected','cancelled'])}
  expect(budgetStatusOptions('draft')).not.toContain('no_response')
  expect(statusNeedsReason('no_response')).toBe(false)
 })
})
