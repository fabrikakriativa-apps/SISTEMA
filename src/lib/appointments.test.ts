import {describe,it,expect} from 'vitest'
import {appointmentTimes,appointmentLocal,appointmentDescriptionParts} from './appointments'
describe('compromissos no fuso de Brasília',()=>{
 it('converte sem depender do fuso do navegador',()=>expect(appointmentTimes('2026-10-29','10:00',60)).toEqual({starts_at:'2026-10-29T13:00:00.000Z',ends_at:'2026-10-29T14:00:00.000Z'}))
 it('preserva data e horário ao reabrir',()=>expect(appointmentLocal('2026-10-30T01:30:00Z')).toEqual({date:'2026-10-29',time:'22:30'}))
 it('preserva virada de dia na duração',()=>expect(appointmentTimes('2026-10-29','23:30',120).ends_at).toBe('2026-10-30T04:30:00.000Z'))
 it('valida datas, horários e duração',()=>{for(const v of [['2026-02-30','10:00',60],['2026-01-01','25:00',60],['2026-01-01','10:00',0]] as const)expect(()=>appointmentTimes(v[0],v[1],v[2])).toThrow()})
 it('separa endereço das observações sem duplicação',()=>expect(appointmentDescriptionParts('Endereço: Rua A\nMedir cortinas')).toEqual({address:'Rua A',notes:'Medir cortinas'}))
})
