import {it,expect} from 'vitest'
import {newPaymentGroup,groupParts,validPaymentPlan,customerPaymentLabel} from './orderPaymentPlan'
it('keeps six customer card payments as one financial entry',()=>{
 const card={...newPaymentGroup(2000,'2026-11-01','Cartão de crédito'),installments:6,fee:100}
 expect(groupParts(card)).toEqual([{amount:2000,due_date:'2026-11-01'}])
 expect(customerPaymentLabel(card)).toBe('Cartão de crédito · 6x')
 expect(validPaymentPlan([newPaymentGroup(1000,'2026-10-15'),card],3000)).toBe(true)
 expect(validPaymentPlan([newPaymentGroup(900,'2026-10-15'),card],3000)).toBe(false)
 expect(validPaymentPlan([{...card,fee:2000}],2000)).toBe(false)
})
