import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

type Kind = 'success' | 'error' | 'info'
type Toast = { id: number; message: string; kind: Kind }
type ToastApi = { show: (message: string, kind?: Kind) => void }
const Context = createContext<ToastApi>({ show: () => undefined })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const timers=useRef(new Map<number,number>())
  const close = useCallback((id: number) => {const timer=timers.current.get(id);if(timer)window.clearTimeout(timer);timers.current.delete(id);setItems(current => current.filter(item => item.id !== id))}, [])
  const show = useCallback((message: string, kind: Kind = 'info') => {
    const id = Date.now() + Math.random()
    setItems(current => [...current.slice(-2), { id, message, kind }])
    timers.current.set(id,window.setTimeout(() => close(id), 5000))
  }, [close])
  useEffect(()=>()=>{timers.current.forEach(timer=>window.clearTimeout(timer));timers.current.clear()},[])
  const api = useMemo(() => ({ show }), [show])
  return <Context.Provider value={api}>{children}<div className="toast-stack" aria-live="polite">
    {items.map(item => <div className={`toast ${item.kind}`} role={item.kind==='error'?'alert':'status'} key={item.id}>
      {item.kind === 'success' ? <CheckCircle2/> : item.kind === 'error' ? <AlertCircle/> : <Info/>}
      <span>{item.message}</span><button aria-label="Fechar mensagem" onClick={() => close(item.id)}><X/></button>
    </div>)}
  </div></Context.Provider>
}

export const useToast = () => useContext(Context)
