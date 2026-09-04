import { describe, expect, it } from 'vitest'
import { resolveAccess, withTimeout } from './access'

const membership = { user_id: 'user', organization_id: 'org', role: 'admin', active: true }
describe('autorização da empresa', () => {
  it('aceita um vínculo ativo da identidade confirmada', () => {
    expect(resolveAccess('user', [membership])).toEqual({ userId: 'user', organizationId: 'org', role: 'admin' })
  })
  it('bloqueia conta sem vínculo', () => expect(() => resolveAccess('user', [])).toThrow('não tem acesso'))
  it('bloqueia vínculo inativo', () => expect(() => resolveAccess('user', [{ ...membership, active: false }])).toThrow())
  it('ignora vínculo de outra pessoa', () => expect(() => resolveAccess('other', [membership])).toThrow())
  it('não escolhe empresa arbitrariamente', () => expect(() => resolveAccess('user', [membership, { ...membership, organization_id: 'other' }])).toThrow('mais de uma'))
  it('recusa papel desconhecido', () => expect(() => resolveAccess('user', [{ ...membership, role: 'owner' }])).toThrow('incompleto'))
})
describe('limite de espera', () => {
  it('retorna resultado normal', async () => expect(await withTimeout(Promise.resolve(42))).toBe(42))
  it('preserva falhas', async () => expect(withTimeout(Promise.reject(new Error('falha')))).rejects.toThrow('falha'))
  it('interrompe espera sem resposta', async () => expect(withTimeout(new Promise(() => {}), 5)).rejects.toThrow('demorou'))
})
