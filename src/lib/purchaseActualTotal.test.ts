import {describe,it,expect} from 'vitest'
import {lineTotal} from './purchasingWorkspace'
import {refreshPurchaseParts,validPurchaseParts} from './purchaseInstallments'
describe('valor real de compra',()=>{
 it('troca previsão de 663 por valor fechado de 598',()=>expect(lineTotal({quantity:13,unit_cost:51,actual_total:598})).toBe(598))
 it('preserva centavos que não cabem no custo por metro',()=>expect(lineTotal({quantity:13,unit_cost:46,actual_total:598.01})).toBe(598.01))
 it('mantém compras antigas sem valor fechado',()=>expect(lineTotal({quantity:13,unit_cost:51})).toBe(663))
 it('recalcula parcelas a partir do total real',()=>{const parts=refreshPurchaseParts([{amount:663,due_date:'2026-11-26'}],598,1,'2026-11-26');expect(parts[0].amount).toBe(598);expect(validPurchaseParts(parts,598)).toBe(true)})
 it('preserva centavos no parcelamento',()=>{const parts=refreshPurchaseParts([],598.01,2,'2026-11-26');expect(validPurchaseParts(parts,598.01)).toBe(true);expect(parts.reduce((s,p)=>s+Math.round(p.amount*100),0)).toBe(59801)})
})

