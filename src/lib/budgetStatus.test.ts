import{describe,expect,it}from'vitest'
import{budgetStatusOptions,statusNeedsReason}from'./budgetStatus'
describe('budget status',()=>{
 it('oferece aprovação somente depois do envio',()=>{expect(budgetStatusOptions('draft')).not.toContain('approved');expect(budgetStatusOptions('sent')).toContain('approved')})
 it('mantém aprovado como terminal no orçamento',()=>expect(budgetStatusOptions('approved')).toEqual(['approved']))
 it('exige motivo em rejeição e cancelamento',()=>{expect(statusNeedsReason('rejected')).toBe(true);expect(statusNeedsReason('cancelled')).toBe(true)})
})
