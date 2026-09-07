import {describe,expect,it} from 'vitest'
import {isOpportunityOverdue,opportunityPayload} from './opportunities'
describe('opportunities',()=>{
 it('exige motivo ao perder',()=>expect(()=>opportunityPayload({name:'Contato',stage:'lost',lost_reason:''})).toThrow('motivo'))
 it('identifica retorno atrasado',()=>expect(isOpportunityOverdue('2026-09-01T10:00:00Z',new Date('2026-09-07T10:00:00Z'))).toBe(true))
})
