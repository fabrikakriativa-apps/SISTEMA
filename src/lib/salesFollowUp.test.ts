import {describe,it,expect} from 'vitest'
import {phaseForLead,contactSummary,matchesFollowUp,type FollowUpLead,type ContactActivity} from './salesFollowUp'
const lead:FollowUpLead={id:'l',name:'Lead',received_on:'2026-10-01',customer_kind:'new_lead',profile_status:'unassessed',profile_reason:null,capture_source:null,campaign:null,response_status:'active',stage:'new',budget_id:'b',related_budget_ids:[],origin:null,next_follow_up_at:'2026-10-21T12:00:00Z'}
describe('follow-up comercial',()=>{
 it('pedido confirmado prevalece sem mudar perfil, orçamento ou contato',()=>{
  expect(phaseForLead(lead,[{id:'o',display_number:'PED1',budget_id:'b',status:'awaiting_finance',created_at:'2026-10-21',total:100}],[])).toBe('won')
  expect(lead.profile_status).toBe('unassessed')
  expect(phaseForLead({...lead,commercial_phase:'negotiating'},[],[])).toBe('negotiating')
  expect(phaseForLead(lead,[],[{id:'b',display_number:'ORC1',client_id:null,status:'sent',created_at:'2026-10-01',total:100}])).toBe('proposal_sent')
 })
 it('separa tentativas, respostas e eventos automáticos',()=>{
  const base:ContactActivity={id:'a',opportunity_id:'l',kind:'contact',occurred_at:'2026-10-21T12:00:00Z',channel:'whatsapp',direction:'outbound',outcome:'no_response',notes:null,next_follow_up_at:null,created_by:'u'}
  const s=contactSummary([base,{...base,id:'b',direction:'inbound',outcome:'answered'},{...base,id:'c',outcome:'requested_return'},{...base,id:'d',kind:'system'}])
  expect(s.attempts).toBe(2);expect(s.responses).toBe(2)
  expect(contactSummary([]).last).toBeNull()
 })
 it('filtra hoje, atrasados e sem agenda sem cobrar oportunidades encerradas',()=>{
  const now=new Date('2026-10-21T15:00:00Z')
  expect(matchesFollowUp(lead,'new','today',now)).toBe(true)
  expect(matchesFollowUp(lead,'new','overdue',now)).toBe(true)
  expect(matchesFollowUp(lead,'won','overdue',now)).toBe(false)
  expect(matchesFollowUp({...lead,next_follow_up_at:null},'new','unscheduled',now)).toBe(true)
  expect(matchesFollowUp({...lead,archived_at:'2026-10-20'},'new','today',now)).toBe(false)
 })
 it('sem resposta continua aguardando retorno, não significa perda',()=>{
  const pending={...lead,response_status:'no_response' as const}
  expect(matchesFollowUp(pending,'proposal_sent','waiting')).toBe(true)
  expect(phaseForLead(pending,[],[{id:'b',display_number:'ORC1',client_id:null,status:'no_response',created_at:'2026-10-01',total:100}])).toBe('proposal_sent')
 })
})
