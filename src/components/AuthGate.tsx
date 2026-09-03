import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { LogIn, ShieldCheck } from 'lucide-react'
import { supabase, supabaseConfigured } from '../lib/supabase'

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(supabaseConfigured)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setLoading(false) })
    return () => data.subscription.unsubscribe()
  }, [])

  if (!supabaseConfigured && !preview) return <main className="auth-page"><section className="auth-card">
    <div className="brand-mark">FK</div><span className="eyebrow">Novo sistema</span><h1>Base segura, sem planilhas como banco.</h1>
    <p>O projeto está pronto para ser conectado a um ambiente Supabase. Esta prévia não grava dados e serve apenas para validar a estrutura.</p>
    <button className="button primary wide" onClick={() => setPreview(true)}>Visualizar estrutura</button>
    <small>Para ativar o login, copie <b>.env.example</b> para <b>.env.local</b> e informe as chaves do projeto.</small>
  </section></main>

  if (loading) return <main className="auth-page"><section className="auth-card"><div className="loader"/><h1>Confirmando acesso</h1></section></main>

  if (!session && !preview) return <main className="auth-page"><section className="auth-card">
    <div className="brand-mark">FK</div><ShieldCheck className="auth-shield"/><span className="eyebrow">Acesso protegido</span>
    <h1>Gestão Fábrika Kriativa</h1><p>Entre com uma conta Google autorizada pela empresa.</p>
    <button className="button google wide" onClick={() => supabase!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })}><LogIn/> Entrar com Google</button>
  </section></main>

  return <>{children}</>
}
