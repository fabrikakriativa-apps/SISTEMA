export function safeDocumentName(name:string){
  const extension=name.toLowerCase().endsWith('.pdf')?'.pdf':''
  const base=name.replace(/\.pdf$/i,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'documento'
  return `${base}${extension||'.pdf'}`
}

export function budgetDocumentPath(organizationId:string,budgetId:string,fileName:string,id:string=crypto.randomUUID()){
  return `${organizationId}/budgets/${budgetId}/${id}-${safeDocumentName(fileName)}`
}

export function purchaseDocumentPath(organizationId:string,purchaseId:string,fileName:string,id:string=crypto.randomUUID()){
  return `${organizationId}/purchases/${purchaseId}/${id}-${safeDocumentName(fileName)}`
}
