export type RevisionReceivable = {id:string;installment:number;installment_count:number;amount:number;paid_amount:number;status:string;due_date:string|null;payment_method:string|null}
export type RevisionPart = {amount:number;due_date:string}
export const editableReceivable = (row:RevisionReceivable) => ['open','overdue'].includes(row.status) && Number(row.paid_amount)===0
export const revisionSnapshot = (rows:RevisionReceivable[]) => rows.filter(row=>row.status!=='cancelled').map(row=>({id:row.id,amount:Number(row.amount),paid_amount:Number(row.paid_amount),status:row.status,due_date:row.due_date,payment_method:row.payment_method,installment:row.installment,installment_count:row.installment_count})).sort((a,b)=>a.id.localeCompare(b.id))
export function distributeRevision(total:number,count:number,firstDue:string):RevisionPart[]{
  const cents=Math.round(total*100),base=Math.floor(cents/count)
  return Array.from({length:count},(_,index)=>{
    const due=new Date(`${firstDue}T12:00:00`),day=due.getDate()
    due.setDate(1);due.setMonth(due.getMonth()+index);due.setDate(Math.min(day,new Date(due.getFullYear(),due.getMonth()+1,0).getDate()))
    return {amount:(base+(index===count-1?cents-base*count:0))/100,due_date:firstDue?`${due.getFullYear()}-${String(due.getMonth()+1).padStart(2,'0')}-${String(due.getDate()).padStart(2,'0')}`:''}
  })
}
