import { useEffect, useRef, useState } from 'react'
import { useAccess } from '../components/AuthorizedAccess'
import { supabase } from './supabase'
import { catalogPayload } from './catalog'

export function useCatalog<T extends { id: string; name: string }>(table: 'clients' | 'supplies', columns: string) {
  const access = useAccess()
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const lock = useRef(false)
  const pendingId = useRef<string | null>(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  useEffect(() => {
    if (!supabase || !access) return
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    let cancelled = false
    setLoading(true); setError('')
    const load = async () => {
      try {
        let query = supabase!.from(table).select(columns).eq('organization_id', access.organizationId).order('name')
        const { data, error } = await query.abortSignal(controller.signal)
        if (error) throw error
        if (!cancelled) setItems((data ?? []) as unknown as T[])
      } catch { if (!cancelled) setError('Não foi possível carregar os cadastros. Verifique a conexão e tente novamente.') }
      finally { clearTimeout(timer); if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true; clearTimeout(timer); controller.abort() }
  }, [table, columns, access?.organizationId, revision])

  async function save(input: unknown): Promise<boolean> {
    if (lock.current) return false
    const payload = catalogPayload(table, input, access)
    if (!supabase) throw new Error('Banco não configurado.')
    lock.current = true; setSaving(true)
    // Reuse this ID after an uncertain network outcome to prevent duplicate creation.
    const id = pendingId.current ?? crypto.randomUUID()
    pendingId.current = id
    try {
      const result = await supabase.from(table).insert({ ...payload, id }).select(columns).abortSignal(AbortSignal.timeout(15000)).single()
      let record = result.data
      if (result.error) {
        const existing = await supabase.from(table).select(columns).eq('organization_id', payload.organization_id).eq('id', id).abortSignal(AbortSignal.timeout(15000)).maybeSingle()
        if (existing.error || !existing.data) throw new Error(result.error.code === '23505' ? 'Já existe um cadastro com esse código. Confira os dados.' : 'Não foi possível confirmar a gravação. Seus campos foram mantidos; tente novamente para conferir o mesmo registro.')
        record = existing.data
      }
      if (!record) throw new Error('O banco não confirmou o cadastro. Tente novamente.')
      pendingId.current = null
      if (mounted.current) setItems(current => [...current.filter(x => x.id !== id), record as unknown as T].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))
      return true
    } finally { lock.current = false; if (mounted.current) setSaving(false) }
  }
  async function update(id:string,changes:Record<string,unknown>):Promise<boolean>{
    if(lock.current||!supabase||!access)return false
    lock.current=true;setSaving(true)
    try{
      const {data,error}=await supabase.from(table).update(changes).eq('organization_id',access.organizationId).eq('id',id).select(columns).abortSignal(AbortSignal.timeout(15000)).single()
      if(error||!data)throw new Error('Não foi possível confirmar a atualização. Tente novamente.')
      if(mounted.current)setItems(current=>current.map(item=>item.id===id?data as unknown as T:item).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')))
      return true
    }finally{lock.current=false;if(mounted.current)setSaving(false)}
  }
  return { items, loading, saving, error, save, update, reload: () => setRevision(n => n + 1) }
}
