export type SupplyRecord={id:string;code:string;name:string;category:string;purchase_unit:string;usage_unit:string;current_cost:number;active:boolean;brand?:string|null;reference?:string|null;notes?:string|null;primary_supplier_id?:string|null;import_details?:Record<string,string|number>|null;supplier_name?:string|null;collection_name?:string|null}
export type SupplyForm={id?:string;code:string;name:string;category:string;purchase_unit:string;usage_unit:string;current_cost:number;active:boolean;brand:string;reference:string;notes:string;primary_supplier_id:string;collection:string;color:string;width:number;length:number;import_details:Record<string,string|number>}
export const emptySupplyForm:SupplyForm={code:'',name:'',category:'',purchase_unit:'un',usage_unit:'un',current_cost:0,active:true,brand:'',reference:'',notes:'',primary_supplier_id:'',collection:'',color:'',width:0,length:0,import_details:{}}
const number=(v:unknown)=>{const s=String(v??'').trim();return Number(s.includes(',')?s.replace(/\./g,'').replace(',','.'):s)||0}
export function supplyToForm(item:SupplyRecord,duplicate=false):SupplyForm{
 const d={...item.import_details}
 return {...emptySupplyForm,...item,id:duplicate?undefined:item.id,code:duplicate?'':item.code,name:duplicate?item.name+' (cópia)':item.name,current_cost:Number(item.current_cost),active:duplicate?true:item.active,brand:item.brand??String(d.Marca??''),reference:item.reference??String(d['Código fornecedor']??''),notes:item.notes??'',primary_supplier_id:item.primary_supplier_id??'',collection:String(d['Catálogo']??d.Coleção??''),color:String(d.Cor??''),width:number(d.Largura),length:number(d.Comprimento),import_details:d}
}
export function supplyFormPayload(form:SupplyForm){
 for(const v of [form.width,form.length,form.current_cost])if(!Number.isFinite(v)||v<0)throw new Error('Medidas e custo devem ser números válidos, iguais ou maiores que zero.')
 const details={...form.import_details}
 for(const [key,value] of Object.entries({'Código fornecedor':form.reference,'Catálogo':form.collection,Cor:form.color,Largura:form.width||'',Comprimento:form.length||''})){if(value!=='')details[key]=typeof value==='string'?value.trim():value;else delete details[key]}
 // Keep imported technical fields, but do not carry stale identity fields into a copy.
 for(const key of Object.keys(details)){const k=key.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();if(['codigo interno','codigo','nome','descricao','preco de compra','custo atual','status','situacao','colecao'].includes(k))delete details[key]}
 return {code:form.code.trim(),name:form.name.trim(),category:form.category.trim(),purchase_unit:form.purchase_unit.trim(),usage_unit:form.usage_unit.trim(),current_cost:form.current_cost,active:form.active,brand:form.brand.trim()||null,reference:form.reference.trim()||null,notes:form.notes.trim()||null,primary_supplier_id:form.primary_supplier_id||null,import_details:details}
}
