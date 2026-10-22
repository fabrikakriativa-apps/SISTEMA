import {describe,it,expect} from 'vitest'
import {supplyToForm,supplyFormPayload,type SupplyRecord} from './supplyForm'
const item:SupplyRecord={id:'original',code:'FK-100',name:'Papel',category:'Papel de parede',purchase_unit:'rolo',usage_unit:'rolo',current_cost:200,active:false,primary_supplier_id:'supplier',brand:'Marca',reference:'REF1',notes:'Nota',import_details:{Fornecedor:'Fornecedor',Largura:'0,53',Comprimento:10,'Catálogo':'Coleção','Campo técnico':'Preservar','Código Interno':'FK-100'}}
describe('formulário de insumos',()=>{
 it('duplica sem ID nem código interno e preserva dados úteis sem compartilhar objeto',()=>{
  const f=supplyToForm(item,true);expect(f.id).toBeUndefined();expect(f.code).toBe('');expect(f.active).toBe(true);expect(f.primary_supplier_id).toBe('supplier');expect(f.width).toBe(.53);expect(f.length).toBe(10);expect(f.name).toContain('cópia');f.import_details.Fornecedor='Novo';expect(item.import_details?.Fornecedor).toBe('Fornecedor')
 })
 it('salva campos novos com as chaves já usadas pelo calculador e preserva extras',()=>{
  const f=supplyToForm(item);f.code='FK-200';f.width=.7;f.collection='Nova';const p=supplyFormPayload(f)
  expect(p.import_details).toMatchObject({Largura:.7,Comprimento:10,'Catálogo':'Nova','Código fornecedor':'REF1','Campo técnico':'Preservar'});expect(p.import_details).not.toHaveProperty('Código Interno');expect(p).not.toHaveProperty('id');expect(p.code).toBe('FK-200')
 })
 it('permite limpar medidas e campos opcionais',()=>{const f=supplyToForm(item);f.width=0;f.length=0;f.collection='';f.reference='';f.primary_supplier_id='';const p=supplyFormPayload(f);expect(p.import_details).not.toHaveProperty('Largura');expect(p.import_details).not.toHaveProperty('Catálogo');expect(p.reference).toBeNull();expect(p.primary_supplier_id).toBeNull()})
 it.each([-1,NaN,Infinity])('rejeita medida inválida %s',width=>expect(()=>supplyFormPayload({...supplyToForm(item),width})).toThrow('válidos'))
})
