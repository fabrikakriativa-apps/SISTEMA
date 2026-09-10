import { z } from 'zod'
import type { Access } from './access'

const required = z.string().trim().min(1, 'Preencha os campos obrigatórios.').max(200)
const optionalText = (maximum:number) => z.string().trim().max(maximum).nullish().transform(value => value || null)
const client = z.object({ name: required, phone: optionalText(50), address: optionalText(300), city: optionalText(200), origin: optionalText(100), notes: optionalText(1000), client_type: z.enum(['Cliente final', 'Parceiro/master']) })
const supply = z.object({ code: required, name: required, category: z.string().trim().max(200), purchase_unit: required, usage_unit: required, current_cost: z.number().finite().nonnegative('O custo não pode ser negativo.') })

export function catalogPayload(table: 'clients' | 'supplies', input: unknown, access: Access | null) {
  if (!access?.organizationId || !access.userId) throw new Error('Prévia: conecte o banco e entre com uma conta autorizada para gravar.')
  const data = (table === 'clients' ? client : supply).safeParse(input)
  if (!data.success) throw new Error(data.error.issues[0].message)
  return { ...data.data, organization_id: access.organizationId, ...(table === 'clients' ? { created_by: access.userId } : {}) }
}
