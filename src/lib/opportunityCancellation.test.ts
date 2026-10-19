import {describe,it,expect} from 'vitest'
import {cancellationNote} from './opportunityCancellation'
describe('cancelamento de oportunidade',()=>{
 it('exige motivo e preserva as observações existentes',()=>{
  expect(()=>cancellationNote('Histórico',' ','2026-10-19T15:00:00Z')).toThrow('motivo')
  const note=cancellationNote('Histórico',' Duplicidade ','2026-10-19T15:00:00Z')
  expect(note).toContain('Histórico\nCancelado em');expect(note).toContain(': Duplicidade')
 })
})

