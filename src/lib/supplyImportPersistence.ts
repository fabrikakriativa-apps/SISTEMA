export const supplyImportUpsertOptions = {
  onConflict: 'organization_id,code',
  defaultToNull: false,
} as const

export function supplyImportErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return 'Erro de comunicação com o cadastro. Tente novamente.'
}
