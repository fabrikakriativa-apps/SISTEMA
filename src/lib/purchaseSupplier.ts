import {normalizeSearchText} from './searchOptions'
export type SupplierOption={id:string;name:string;active?:boolean}
export type SupplierMaterial={supplier_name?:string; supply?:{primary_supplier_id?:string|null;import_details?:Record<string,unknown>|null}|null}
export function materialSupplier(material:SupplierMaterial,vendors:SupplierOption[]){
 const imported=String(material.supply?.import_details?.Fornecedor??'').trim(),manual=material.supplier_name?.trim()??''
 const primaryId=material.supply?.primary_supplier_id,primary=vendors.find(v=>v.id===primaryId&&v.active!==false)
 const overridden=manual&&normalizeSearchText(manual)!==normalizeSearchText(imported)&&(!primary||normalizeSearchText(manual)!==normalizeSearchText(primary.name))
 if(primary&&!overridden)return {id:primary.id,name:primary.name}
 const name=manual||primary?.name||imported
 const matches=vendors.filter(v=>v.active!==false&&normalizeSearchText(v.name)===normalizeSearchText(name))
 return {id:matches.length===1?matches[0].id:'',name}
}
export function commonMaterialSupplier(materials:SupplierMaterial[],vendors:SupplierOption[]){
 const resolved=materials.map(n=>materialSupplier(n,vendors))
 if(!resolved.length)return {id:'',name:''}
 if(resolved.every(n=>n.id&&n.id===resolved[0].id))return resolved[0]
 if(resolved.every(n=>n.name&&normalizeSearchText(n.name)===normalizeSearchText(resolved[0].name)))return {id:'',name:resolved[0].name}
 return {id:'',name:''}
}
