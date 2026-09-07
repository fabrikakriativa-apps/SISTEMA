import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { LogIn, ShieldCheck } from 'lucide-react'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { verifyAccess, withTimeout, type Access } from '../lib/access'
import { cleanAuthenticationFragment } from '../lib/authUrl'

const AccessContext = createContext<Access | null>(null)
export const useAccess = () => useContext(AccessContext)

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabaseConfigured)
  const [preview, setPreview] = useState(false)
  const [access, setAccess] = useState<Access | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const userId = session?.user.id

  useEffect(() => {
    if (!supabase) return
    const timer = setTimeout(() => {
      setError('A sessão demorou para carregar. Verifique sua conexão e tente novamente.')
      setReady(true)
    }, 15000)
    // Never await another Supabase call inside this synchronous auth callback.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (next?.provider_token) sessionStorage.setItem('fk_google_provider_token', next.provider_token)
      const cleanUrl=cleanAuthenticationFragment(window.location);if(next&&cleanUrl)window.history.replaceState({},document.title,cleanUrl)
      if (event === 'SIGNED_OUT') sessionStorage.removeItem('fk_google_provider_token')
      clearTimeout(timer); setSession(next); setReady(true)
    })
    return () => { clearTimeout(timer); data.subscription.unsubscribe() }
  }, [attempt])

  useEffect(() => {
    setAccess(null)
    if (!supabase || !userId) return
    let cancelled = false
    setError('')
    void verifyAccess(supabase, userId).then(result => {
      if (!cancelled) setAccess(result)
    }).catch(reason => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível confirmar o acesso. Tente novamente.')
    })
    return () => { cancelled = true }
  }, [userId, attempt])

  const signIn = async () => {
    if (!supabase || busy) return
    setBusy(true); setError('')
    try {
      const { error } = await withTimeout(supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }))
      if (error) throw error
    } catch { setError('Não foi possível iniciar o login Google. Tente novamente ou contate o administrador.') }
    finally { setBusy(false) }
  }
  const signOut = async () => {
    if (!supabase || busy) return
    setBusy(true)
    try {
      const { error } = await withTimeout(supabase.auth.signOut())
      if (error) throw error
      setAccess(null); setSession(null); setError('')
      sessionStorage.removeItem('fk_google_provider_token')
    } catch { setError('Não foi possível sair. Verifique a conexão e tente novamente.') }
    finally { setBusy(false) }
  }

  if (preview && !supabaseConfigured) return <AccessContext.Provider value={null}>{children}</AccessContext.Provider>
  if (access && access.userId === userId) return <AccessContext.Provider value={access}><div key={access.userId + access.organizationId}>{children}</div></AccessContext.Provider>
  return <main className="auth-page"><section className="auth-card">
    <div className="brand-mark">FK</div><ShieldCheck className="auth-shield"/><span className="eyebrow">Novo sistema · acesso protegido</span>
    <h1>Gestão Fábrika Kriativa</h1>
    {error ? <><p role="alert">{error}</p><button className="button secondary wide" onClick={() => { setError(''); setAttempt(n => n + 1) }}>Tentar novamente</button>{session && <button className="button secondary wide" disabled={busy} onClick={signOut}>Sair desta conta</button>}</>
      : !supabaseConfigured ? <><p>Prévia da estrutura, sem acesso a dados reais e sem gravação. O novo banco ainda precisa ser configurado e validado.</p><button className="button primary wide" onClick={() => setPreview(true)}>Visualizar estrutura</button></>
      : !ready || userId ? <><div className="loader"/><p role="status">Confirmando identidade e autorização da empresa…</p></>
      : <><p>Entre com uma conta Google autorizada pela empresa.</p><button className="button google wide" disabled={busy} onClick={signIn}><LogIn/>{busy ? 'Conectando…' : 'Entrar com Google'}</button></>}
  </section></main>
}
