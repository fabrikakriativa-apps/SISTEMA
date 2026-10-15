import {describe,it,expect} from 'vitest'
import {adjustPayableAmount,payableItemLabel} from './payableEditor'
const part=(amount:number,locked=false)=>({amount,locked,due_date:'2026-10-15'})
describe('contas a pagar',()=>{
 it('redistribui o exemplo informado',()=>expect(adjustPayableAmount([part(871.98),part(871.97)],1743.95,0,1072.38).map(p=>p.amount)).toEqual([1072.38,671.57]))
 it('ajusta ao editar a última parcela',()=>expect(adjustPayableAmount([part(50),part(50)],100,1,60).map(p=>p.amount)).toEqual([40,60]))
 it('fecha os centavos',()=>expect(adjustPayableAmount([part(25),part(25),part(25),part(25)],100,0,50).map(p=>p.amount)).toEqual([50,16.66,16.66,16.68]))
 it('preserva valores pagos e vencimentos',()=>expect(adjustPayableAmount([part(20,true),part(40),part(40)],100,1,50)).toEqual([part(20,true),part(50),part(30)]))
 it('não altera parcelas bloqueadas',()=>expect(adjustPayableAmount([part(20,true)],20,0,40)).toEqual([part(20,true)]))
 it('não cria saldo negativo',()=>expect(adjustPayableAmount([part(50),part(50)],100,0,150).map(p=>p.amount)).toEqual([150,50]))
 it('mostra o item antes do ambiente',()=>expect(payableItemLabel({description:'Cortina blackout',environment:'Sala'})).toBe('Cortina blackout · Ambiente: Sala'))
})

