import {describe,it,expect} from 'vitest'
import {matchesOrderSearch} from './orderSearch'
const order={display_number:'PED-2026-000138',client:{name:'Luciana'},budget:{display_number:'ORC-2026-000333'},notes:'Confirmar instalação',order_items:[{snapshot:{environment:'Sala',description:'Cortina de linho azul com prega macho'}},{snapshot:{environment:'Quarto',description:'Revisão de sofá com tecido MALVA'}}]}
describe('order item search',()=>{
 it('finds item descriptions',()=>expect(matchesOrderSearch(order,'cortina')).toBe(true))
 it('finds fabric and specifications',()=>expect(matchesOrderSearch(order,'macho linho')).toBe(true))
 it('finds item environments',()=>expect(matchesOrderSearch(order,'quarto')).toBe(true))
 it('ignores accents and case',()=>expect(matchesOrderSearch(order,'REVISAO SOFA')).toBe(true))
 it('combines client and item fragments',()=>expect(matchesOrderSearch(order,'luciana cortina azul')).toBe(true))
 it('preserves order, budget and status search',()=>{expect(matchesOrderSearch(order,'000138')).toBe(true);expect(matchesOrderSearch(order,'000333')).toBe(true);expect(matchesOrderSearch(order,'aguardando compra','Aguardando compra')).toBe(true)})
 it('includes order notes',()=>expect(matchesOrderSearch(order,'instalacao')).toBe(true))
 it('does not return unrelated orders',()=>expect(matchesOrderSearch(order,'persiana')).toBe(false))
 it('handles missing item descriptions and legacy snapshots',()=>{expect(matchesOrderSearch({display_number:'PED-1',order_items:[{}, {snapshot:null}]},'cortina')).toBe(false);expect(matchesOrderSearch({display_number:'PED-1'},'')).toBe(true)})
})
