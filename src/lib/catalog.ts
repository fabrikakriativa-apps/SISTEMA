import { z } from 'zod'
import type { Access } from './access'

const required = z.string().trim().min(1, 'Preencha os campos obrigatórios.').max(200)
const client = z.object({ name: required, phone: z.string().trim().max(50), city: z.string().trim().max(200), client_type: z.enum(['Cliente final', 'Parceiro/master']) })
const supply = z.object({ code: required, name: required, category: z.string().trim().max(200), purchase_unit: required, usage_unit: required, current_cost: z.number().finite().nonnegative('O custo não pode ser negativo.') })

export function catalogPayload(table: 'clients' | 'supplies', input: unknown, access: Access | null) {
  if (!access?.organizationId || !access.userId) throw new Error('Prévia: conecte o banco e entre com uma conta autorizada para gravar.')
  const data = (table === 'clients' ? client : supply).safeParse(input)
  if (!data.success) throw new Error(data.error.issues[0].message)
  return { ...data.data, organization_id: access.organizationId, ...(table === 'clients' ? { created_by: access.userId } : {}) }
}
