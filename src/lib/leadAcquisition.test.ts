import {describe,it,expect} from 'vitest'
import {captureKind,acquisitionLabel,matchesAcquisition,leadOrigins} from './leadAcquisition'
describe('atribuição de captação',()=>{
 it('não presume que Meta ou campanhas antigas sejam mídia paga',()=>{
  expect(captureKind({origin:'Instagram',campaign:'Cabeceiras'})).toBe('unknown')
  expect(matchesAcquisition({origin:'Meta — Instagram/Facebook'},'organic')).toBe(false)
  expect(matchesAcquisition({},'unknown')).toBe(true)
 })
 it('separa orgânico e pago mesmo quando têm a mesma origem',()=>{
  expect(matchesAcquisition({origin:'Instagram',capture_kind:'organic'},'organic')).toBe(true)
  expect(matchesAcquisition({origin:'Instagram',capture_kind:'paid'},'organic')).toBe(false)
  expect(matchesAcquisition({capture_kind:'paid'},'paid')).toBe(true)
  expect(matchesAcquisition({},'')).toBe(true)
 })
 it('mostra a campanha no card e preserva nomes antigos não classificados',()=>{
  expect(acquisitionLabel({capture_kind:'paid',campaign:' Cabeceiras '})).toBe('Campanha: Cabeceiras')
  expect(acquisitionLabel({capture_kind:'paid'})).toBe('Campanha: não informada')
  expect(acquisitionLabel({campaign:'Antiga'})).toBe('Não identificado · Campanha: Antiga')
  expect(leadOrigins).toContain('Meta — Instagram/Facebook')
 })
})

