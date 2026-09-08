export type PurchaseStatus='draft'|'awaiting_delivery'|'delayed'|'completed'|'cancelled'|'returned'

export const purchaseStatusLabels:Record<PurchaseStatus,string>={
 draft:'Rascunho',awaiting_delivery:'Aguardando entrega',delayed:'Atrasado',completed:'Recebido',cancelled:'Cancelado',returned:'Devolvido'
}

export const purchaseStatusOptions=(current:PurchaseStatus):PurchaseStatus[]=>{
 if(current==='draft')return ['draft','awaiting_delivery','cancelled']
 if(current==='awaiting_delivery'||current==='delayed')return [current,'completed','cancelled']
 if(current==='completed')return ['completed','returned']
 return [current]
}
