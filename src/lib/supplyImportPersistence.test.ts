import { describe, expect, it } from 'vitest'
import { supplyImportErrorMessage, supplyImportUpsertOptions } from './supplyImportPersistence'

describe('supply import persistence', () => {
  it('uses database defaults and a stable organization/code key for retries', () => {
    expect(supplyImportUpsertOptions).toEqual({ onConflict: 'organization_id,code', defaultToNull: false })
  })
  it('shows database errors returned as plain objects', () => {
    expect(supplyImportErrorMessage({ message: 'Campo obrigatório ausente', code: '23502' })).toBe('Campo obrigatório ausente')
    expect(supplyImportErrorMessage(new Error('Falha de rede'))).toBe('Falha de rede')
    expect(supplyImportErrorMessage(null)).toContain('Tente novamente')
  })
})
