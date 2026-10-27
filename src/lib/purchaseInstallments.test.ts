import {describe,it,expect} from 'vitest'
import {refreshPurchaseParts,validPurchaseParts} from './purchaseInstallments'
describe('parcelas de compras',()=>{
 it('permite datas a definir sem fabricar vencimentos',()=>expect(refreshPurchaseParts([],100,3,'')).toEqual([{amount:33.33,due_date:''},{amount:33.33,due_date:''},{amount:33.34,due_date:''}]))
 it('preserva os valores ao definir as datas posteriormente',()=>expect(refreshPurchaseParts([{amount:30,due_date:''},{amount:70,due_date:''}],100,2,'2026-01-31')).toEqual([{amount:30,due_date:'2026-01-31'},{amount:70,due_date:'2026-02-28'}]))
 it('limpa somente as datas ao optar por vencimentos depois',()=>expect(refreshPurchaseParts([{amount:30,due_date:'2026-10-15'},{amount:70,due_date:'2026-11-15'}],100,2,'')).toEqual([{amount:30,due_date:''},{amount:70,due_date:''}]))
 it('redistribui se mudar o número de parcelas',()=>expect(refreshPurchaseParts([{amount:100,due_date:''}],100,2,'').map(p=>p.amount)).toEqual([50,50]))
 it('rejeita total divergente, não finito ou parcela zerada',()=>{expect(validPurchaseParts([{amount:99,due_date:''}],100)).toBe(false);expect(validPurchaseParts([{amount:NaN,due_date:''}],100)).toBe(false);expect(validPurchaseParts([{amount:0,due_date:''},{amount:100,due_date:''}],100)).toBe(false)})
 it('aceita valores válidos sem data de vencimento',()=>expect(validPurchaseParts([{amount:100,due_date:''}],100)).toBe(true))
})
