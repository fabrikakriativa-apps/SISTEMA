export type Review='pending'|'needed'|'not_required'|'stock'
export type WorkspaceNeed={id:string;order_item_id:string;description:string;quantity:number;unit:string;unit_cost:number;supply_id:string|null;deadline:string|null;supplier_name:string;status:string}
export type WorkspaceItem={id:string;order_id:string;status:string;procurement_review:Review;snapshot:{description?:string;environment?:string};order:{display_number:string;status:string;created_at:string;client:{name:string}|null}|null}
export function purchasingSummary(item:Pick<WorkspaceItem,'procurement_review'>,needs:Pick<WorkspaceNeed,'status'>[],hasPendingPurchase=false){
 const active=needs.filter(n=>n.status!=='cancelled')
 if(item.procurement_review==='not_required')return 'Não necessita de compra'
 if(item.procurement_review==='stock')return 'Material disponível'
 if(item.procurement_review==='pending')return 'A avaliar'
 if(!active.length)return 'Necessidades a informar'
 if(active.every(n=>n.status==='received'))return 'Compras concluídas'
 if(hasPendingPurchase)return 'Compra pendente'
 if(active.some(n=>['awaiting_finance','awaiting_purchase'].includes(n.status)))return 'Compra pendente'
 return 'Aguardando entrega'
}
export const workspacePurchaseLabels:Record<string,string>={draft:'Compra pendente',awaiting_delivery:'Aguardando entrega',delayed:'Aguardando entrega (atrasada)',completed:'Concluído',cancelled:'Cancelado',returned:'Devolvido'}
export const lineTotal=(n:{quantity:number;unit_cost:number})=>Math.round((Number(n.quantity)*Number(n.unit_cost)+Number.EPSILON)*100)/100
