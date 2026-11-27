import {describe,it,expect} from 'vitest'
import {materialSupplier,commonMaterialSupplier} from './purchaseSupplier'
describe('fornecedor da compra',()=>{
 const vendors=[{id:'a',name:'Antuarte'},{id:'b',name:'Outro fornecedor'}]
 it('usa o vínculo do cadastro do insumo',()=>expect(materialSupplier({supply:{primary_supplier_id:'a',import_details:{Fornecedor:'ANTUARTE'}}},vendors)).toEqual({id:'a',name:'Antuarte'}))
 it('aproveita fornecedor importado ainda sem vínculo',()=>expect(materialSupplier({supply:{import_details:{Fornecedor:' ANTUARTE '}}},vendors).id).toBe('a'))
 it('mantém o nome quando falta cadastro, permitindo completar na tela',()=>expect(commonMaterialSupplier([{supplier_name:'ANTUARTE'}],[])).toEqual({id:'',name:'ANTUARTE'}))
 it('não escolhe arbitrariamente quando há fornecedores diferentes',()=>expect(commonMaterialSupplier([{supplier_name:'ANTUARTE'},{supplier_name:'Outro fornecedor'}],vendors).id).toBe(''))
 it('não substitui uma escolha manual diferente',()=>expect(materialSupplier({supplier_name:'Outro fornecedor',supply:{primary_supplier_id:'a',import_details:{Fornecedor:'ANTUARTE'}}},vendors).id).toBe('b'))
 it('não escolhe fornecedor inativo ou nomes duplicados',()=>{expect(materialSupplier({supplier_name:'ANTUARTE'},[{id:'a',name:'ANTUARTE',active:false}]).id).toBe('');expect(materialSupplier({supplier_name:'ANTUARTE'},[...vendors,{id:'c',name:'ANTUARTE'}]).id).toBe('')})
})
