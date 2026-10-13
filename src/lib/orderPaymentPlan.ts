import {distributeRevision,type RevisionPart} from './receivableRevision'
export type PaymentGroup={method:string;amount:number;installments:number;fee:number;due_date:string;parts:RevisionPart[]}
export const paymentMethods=['PIX','Transferência bancária','Boleto','Cartão de crédito','Cartão de débito','Dinheiro','A combinar']
export const isCredit=(method:string)=>method==='Cartão de crédito'
export const groupParts=(group:PaymentGroup)=>isCredit(group.method)?[{amount:group.amount,due_date:group.due_date}]:group.parts
export const newPaymentGroup=(amount:number,due_date:string,method='PIX'):PaymentGroup=>({method,amount,installments:1,fee:0,due_date,parts:distributeRevision(amount,1,due_date)})
export const customerPaymentLabel=(group:PaymentGroup)=>`${group.method} · ${group.installments}x`
export function validPaymentPlan(groups:PaymentGroup[],total:number){
 return groups.length>=1&&groups.length<=2&&groups.reduce((s,g)=>s+groupParts(g).length,0)<=60&&Math.round(groups.reduce((s,g)=>s+g.amount,0)*100)===Math.round(total*100)&&groups.every(g=>paymentMethods.includes(g.method)&&Number.isFinite(g.amount)&&g.amount>0&&Number.isInteger(g.installments)&&g.installments>=1&&g.installments<=60&&Number.isFinite(g.fee)&&g.fee>=0&&g.fee<g.amount&&(isCredit(g.method)||g.fee===0)&&groupParts(g).every(p=>p.amount>0&&p.due_date)&&Math.round(groupParts(g).reduce((s,p)=>s+p.amount,0)*100)===Math.round(g.amount*100))
}
