export type LeadResponse='active'|'waiting'|'no_interaction'|'pre_proposal_no_response'|'proposal_no_response'|'no_response'
export const responseLabels:Record<LeadResponse,string>={active:'Em atendimento',waiting:'Aguardando resposta',no_interaction:'Sem interação',pre_proposal_no_response:'Sem retorno antes da proposta',proposal_no_response:'Proposta sem resposta',no_response:'Sem resposta — classificação anterior'}
export const responseHelp:Record<LeadResponse,string>={active:'Há conversa em andamento.',waiting:'Aguardando um retorno; ainda não classifique como ausência de resposta.',no_interaction:'Enviou somente a mensagem automática do anúncio e não respondeu ao atendimento.',pre_proposal_no_response:'Houve conversa, mas o contato sumiu antes de fornecer o necessário para uma proposta.',proposal_no_response:'Recebeu pré-orçamento ou orçamento, mas não deu uma decisão.',no_response:'Registro anterior: escolha a situação adequada. A falta de histórico não prova ausência de interação.'}
// Old automatic document updates use no_response. A sent proposal is positive
// evidence; missing activity records are never evidence of no interaction.
export function resolvedResponse(status:LeadResponse,hasProposal:boolean):LeadResponse{
 return status==='no_response'&&hasProposal?'proposal_no_response':status
}
export const stalledResponses:LeadResponse[]=['no_interaction','pre_proposal_no_response','proposal_no_response','no_response']
