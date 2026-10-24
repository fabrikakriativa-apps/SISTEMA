export type ShoppingMaterial={description:string;quantity:number;unit:string;supplier:string}
export function shoppingListText(materials:ShoppingMaterial[]){
 const vendors=new Map<string,Map<string,ShoppingMaterial>>()
 for(const line of materials){
  const supplier=line.supplier.trim()||'Fornecedor a definir',key=line.description.trim().toLocaleLowerCase('pt-BR')+'\u0000'+line.unit.trim().toLocaleLowerCase('pt-BR')
  const group=vendors.get(supplier)??new Map<string,ShoppingMaterial>(),previous=group.get(key)
  group.set(key,{...line,description:line.description.trim(),quantity:(previous?.quantity??0)+Number(line.quantity)});vendors.set(supplier,group)
 }
 return [...vendors].map(([supplier,lines])=>`LISTA DE COMPRAS — ${supplier}\n\n`+[...lines.values()].map(line=>`• ${line.quantity.toLocaleString('pt-BR',{maximumFractionDigits:3})} ${line.unit} — ${line.description}`).join('\n')+'\n\nPor favor, confirmar disponibilidade para separação e retirada.').join('\n\n──────────\n\n')
}

