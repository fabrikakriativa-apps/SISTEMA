import {describe,it,expect} from 'vitest'
import {shoppingListText} from './shoppingList'
describe('lista para fornecedor',()=>{
 it('inclui valores previstos apenas quando solicitado e soma itens agrupados',()=>{
  const lines=[{supplier:'Loja',description:'Tecido',unit:'m',quantity:2,estimated_total:100},{supplier:'Loja',description:'Tecido',unit:'m',quantity:1,estimated_total:50}]
  expect(shoppingListText(lines)).not.toContain('R$')
  expect(shoppingListText(lines,true)).toContain('150,00')
  expect(shoppingListText(lines,true)).toContain('3 m — Tecido')
 })
 it('agrupa materiais iguais sem misturar fornecedor, referência ou unidade',()=>{
  const text=shoppingListText([{supplier:'A',description:'Tecido 01',unit:'m',quantity:2},{supplier:'A',description:'Tecido 01',unit:'m',quantity:1.5},{supplier:'A',description:'Tecido 02',unit:'m',quantity:1},{supplier:'B',description:'Tecido 01',unit:'m',quantity:7}])
  expect(text).toContain('3,5 m — Tecido 01');expect(text).toContain('1 m — Tecido 02');expect(text).toContain('7 m — Tecido 01');expect(text).toContain('LISTA DE COMPRAS — B')
 })
 it('não inclui dados comerciais ou pessoais',()=>{
  const text=shoppingListText([{supplier:'Loja',description:'Espuma D28',unit:'m²',quantity:2}]);expect(text).not.toContain('R$');expect(text).not.toContain('PED-');expect(text).not.toContain('Cliente')
 })
})
