import type { SupabaseClient } from '@supabase/supabase-js'

export type Membership = { organization_id: string; user_id: string; role: string; active: boolean }
export type Access = { userId: string; organizationId: string; role: string }

export function resolveAccess(userId: string, memberships: Membership[]): Access {
  const allowed = memberships.filter(m => m.user_id === userId && m.active)
  if (!allowed.length) throw new Error('Sua conta não tem acesso autorizado à empresa. Solicite a liberação ao administrador.')
  if (allowed.length !== 1) throw new Error('Sua conta tem mais de uma empresa vinculada. A seleção de empresa ainda precisa ser configurada.')
  const member = allowed[0]
  if (!member.organization_id || !['admin', 'comercial', 'compras', 'financeiro', 'operacao'].includes(member.role)) {
    throw new Error('O vínculo da sua conta está incompleto. Contate o administrador.')
  }
  return { userId, organizationId: member.organization_id, role: member.role }
}

export async function withTimeout<T>(operation: PromiseLike<T>, milliseconds = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('A conexão demorou mais que o esperado. Verifique sua internet e tente novamente.')), milliseconds)
    })])
  } finally { clearTimeout(timer) }
}

// This gate complements, but never replaces, the database RLS policies.
export async function verifyAccess(client: SupabaseClient, expectedUserId: string): Promise<Access> {
  return withTimeout((async () => {
    const { data: identity, error: identityError } = await client.auth.getUser()
    if (identityError || !identity.user || identity.user.id !== expectedUserId || identity.user.is_anonymous) {
      throw new Error('Não foi possível confirmar sua identidade. Saia e entre novamente.')
    }
    const { data, error } = await client.from('memberships')
      .select('organization_id,user_id,role,active').eq('user_id', identity.user.id).eq('active', true)
      .abortSignal(AbortSignal.timeout(15000))
    if (error) throw new Error('Não foi possível consultar suas permissões. Verifique a conexão e a configuração do novo banco.')
    return resolveAccess(identity.user.id, data ?? [])
  })())
}
