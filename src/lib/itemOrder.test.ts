import {describe,it,expect} from 'vitest'
import {moveItem,documentItemOrder} from './itemOrder'
describe('ordem livre dos itens',()=>{
 const items=[{id:'a',position:1,sale:100},{id:'b',position:2,sale:200},{id:'c',position:3,sale:300}]
 it('move para cima e para baixo sem alterar os dados',()=>{expect(moveItem(items,'c','a').map(i=>i.id)).toEqual(['c','a','b']);expect(moveItem(items,'a','c').map(i=>i.id)).toEqual(['b','c','a']);expect(items.map(i=>i.id)).toEqual(['a','b','c']);expect(moveItem(items,'c','a')[0].sale).toBe(300)})
 it('ignora item ausente e mesma posição',()=>{expect(moveItem(items,'x','a')).toBe(items);expect(moveItem(items,'a','a')).toBe(items)})
 it('ordena documentos por posição e desempata de forma estável',()=>{expect(documentItemOrder([{id:'b',position:2},{id:'c',position:1},{id:'a',position:1}]).map(i=>i.id)).toEqual(['a','c','b'])})
})

