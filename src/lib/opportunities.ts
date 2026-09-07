export const opportunityStages = ['new','contacted','qualified','budgeting','won','lost'] as const
export type OpportunityStage = typeof opportunityStages[number]
export const opportunityLabels: Record<OpportunityStage,string> = { new:'Novo contato', contacted:'Em contato', qualified:'Qualificado', budgeting:'Em orçamento', won:'Convertido', lost:'Perdido' }
export function isOpportunityOverdue(value:string|null, now=new Date()){ return Boolean(value && new Date(value)<now) }
export function opportunityPayload(input:{name:string;stage:OpportunityStage;lost_reason:string}){
 if(!input.name.trim())throw new Error('Informe o nome do contato.')
 if(input.stage==='lost'&&input.lost_reason.trim().length<5)throw new Error('Informe o motivo da perda.')
 return {...input,name:input.name.trim(),lost_reason:input.stage==='lost'?input.lost_reason.trim():null}
}
