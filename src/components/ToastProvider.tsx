import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

type Kind = 'success' | 'error' | 'info'
type Toast = { id: number; message: string; kind: Kind }
type ToastApi = { show: (message: string, kind?: Kind) => void }
const Context = createContext<ToastApi>({ show: () => undefined })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const close = useCallback((id: number) => setItems(current => current.filter(item => item.id !== id)), [])
  const show = useCallback((message: string, kind: Kind = 'info') => {
    const id = Date.now() + Math.random()
    setItems(current => [...current.slice(-2), { id, message, kind }])
    window.setTimeout(() => close(id), 5000)
  }, [close])
  const api = useMemo(() => ({ show }), [show])
  return <Context.Provider value={api}>{children}<div className="toast-stack" aria-live="polite">
    {items.map(item => <div className={`toast ${item.kind}`} key={item.id}>
      {item.kind === 'success' ? <CheckCircle2/> : item.kind === 'error' ? <AlertCircle/> : <Info/>}
      <span>{item.message}</span><button aria-label="Fechar mensagem" onClick={() => close(item.id)}><X/></button>
    </div>)}
  </div></Context.Provider>
}

export const useToast = () => useContext(Context)
