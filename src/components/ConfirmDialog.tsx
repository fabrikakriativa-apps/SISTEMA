import { AlertTriangle, X } from 'lucide-react'

export function ConfirmDialog(props: { open: boolean; title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  if (!props.open) return null
  return <div className="dialog-backdrop" role="presentation"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
    <header><div className="dialog-icon"><AlertTriangle/></div><div><h2 id="confirm-title">{props.title}</h2><p>{props.message}</p></div><button className="icon-button" aria-label="Fechar" onClick={props.onClose}><X/></button></header>
    <footer><button className="button secondary" onClick={props.onClose}>Voltar</button><button className={`button ${props.danger ? 'danger' : 'primary'}`} onClick={props.onConfirm}>{props.confirmLabel ?? 'Confirmar'}</button></footer>
  </section></div>
}
