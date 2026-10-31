import {describe,it,expect} from 'vitest'
import {resolvedResponse,responseLabels} from './leadResponse'
describe('situação do retorno',()=>{
 it('não deduz falta de interação pelo histórico ausente',()=>{expect(resolvedResponse('active',false)).toBe('active');expect(resolvedResponse('no_response',false)).toBe('no_response')})
 it('reconhece a classificação antiga quando há proposta comprovada',()=>{expect(resolvedResponse('no_response',true)).toBe('proposal_no_response')})
 it('preserva classificações explícitas e oferece os três motivos',()=>{for(const key of ['no_interaction','pre_proposal_no_response','proposal_no_response'] as const){expect(resolvedResponse(key,false)).toBe(key);expect(responseLabels[key]).toBeTruthy()}})
})
