import { describe, expect, it } from 'vitest'
import { catalogPayload } from './catalog'
const access = { userId: 'user', organizationId: 'org', role: 'admin' }
const client = { name: ' Ana ', phone: '', city: '', client_type: 'Cliente final' }
const supply = { code: '001', name: 'Tecido', category: '', purchase_unit: 'm', usage_unit: 'm', current_cost: 10 }
describe('cadastros vinculados', () => {
  it('não grava na prévia', () => expect(() => catalogPayload('clients', client, null)).toThrow('Prévia'))
  it('normaliza o nome e adiciona empresa e autor', () => expect(catalogPayload('clients', client, access)).toMatchObject({ name: 'Ana', organization_id: 'org', created_by: 'user' }))
  it('preserva origem, endereço e observação do cliente', () => expect(catalogPayload('clients', { ...client, address:' Rua A ', origin:'Instagram', notes:' primeiro contato ' }, access)).toMatchObject({ address:'Rua A', origin:'Instagram', notes:'primeiro contato' }))
  it('não permite injetar outra empresa pelo formulário', () => expect(catalogPayload('clients', { ...client, organization_id: 'other', created_by: 'other' }, access)).toMatchObject({ organization_id: 'org', created_by: 'user' }))
  it('rejeita nome em branco', () => expect(() => catalogPayload('clients', { ...client, name: '  ' }, access)).toThrow())
  it('rejeita tipo de cliente desconhecido', () => expect(() => catalogPayload('clients', { ...client, client_type: 'x' }, access)).toThrow())
  it('adiciona empresa ao insumo sem coluna de autor inexistente', () => { const result = catalogPayload('supplies', supply, access); expect(result.organization_id).toBe('org'); expect(result).not.toHaveProperty('created_by') })
  it.each([-1, NaN, Infinity])('rejeita custo inválido %s', current_cost => expect(() => catalogPayload('supplies', { ...supply, current_cost }, access)).toThrow())
  it('rejeita unidade vazia', () => expect(() => catalogPayload('supplies', { ...supply, usage_unit: '' }, access)).toThrow())
})
