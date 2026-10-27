import {describe,it,expect} from 'vitest'
import {purchaseStatusAction as action} from './purchaseRowActions'
describe('status na lista de compras',()=>{
 it('abre cadastro e conferência para uma necessidade ainda não comprada',()=>{expect(action('draft','awaiting_delivery',false,false)).toBe('create');expect(action('draft','completed',false,false)).toBe('create')})
 it('exige conferência financeira em uma compra pendente',()=>expect(action('draft','completed',true,true)).toBe('confirm'))
 it('exige recebimento ao concluir uma compra confirmada',()=>expect(action('awaiting_delivery','completed',true,true)).toBe('receive'))
 it('mantém a conferência de compras anteriores',()=>expect(action('draft','awaiting_delivery',true,false)).toBe('legacy'))
 it('não reabre nem cancela compras pelo seletor',()=>{expect(action('completed','draft',true,true)).toBeNull();expect(action('awaiting_delivery','cancelled',true,true)).toBeNull();expect(action('draft','draft',false,false)).toBeNull()})
})
