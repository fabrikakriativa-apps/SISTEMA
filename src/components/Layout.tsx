import { useState, type ReactNode } from 'react'
import { CalendarDays, ChevronDown, ChevronRight, CircleDollarSign, ContactRound, FileText, Handshake, Home, LogOut, Menu, PackageCheck, PanelLeftClose, Settings, ShoppingCart, UsersRound } from 'lucide-react'
import type { ModuleKey } from '../domain'
import { supabase } from '../lib/supabase'

type NavItem = { key: ModuleKey; label: string; icon: typeof Home }
const groups: { label: string; items: NavItem[] }[] = [
  { label: 'Principal', items: [
    { key:'inicio', label:'Visão geral', icon:Home }, { key:'prospeccao', label:'Prospecção', icon:Handshake },
    { key:'clientes', label:'Clientes', icon:UsersRound }, { key:'orcamentos', label:'Orçamentos', icon:FileText },
    { key:'pedidos', label:'Pedidos', icon:PackageCheck }, { key:'agenda', label:'Agenda', icon:CalendarDays },
  ]},
  { label: 'Operação', items: [{ key:'compras', label:'Compras', icon:ShoppingCart }] },
  { label: 'Financeiro', items: [{ key:'financeiro', label:'Gestão financeira', icon:CircleDollarSign }] },
  { label: 'Cadastros', items: [{ key:'insumos', label:'Insumos e produtos', icon:ContactRound }] },
  { label: 'Administração', items: [{ key:'administracao', label:'Configurações', icon:Settings }] },
]

export function Layout({ active, setActive, children }: { active: ModuleKey; setActive: (key: ModuleKey) => void; children: ReactNode }) {
  const [compact, setCompact] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({ Principal:true, Operação:true, Financeiro:true, Cadastros:true, Administração:false })
  return <div className={`app-shell ${compact ? 'compact' : ''} ${mobile ? 'mobile-open' : ''}`}>
    <aside className="sidebar"><div className="brand"><div className="brand-mark small">FK</div><div><strong>Fábrika Kriativa</strong><span>Gestão comercial</span></div></div>
      <nav>{groups.map(group => <section className="nav-group" key={group.label}><button className="nav-group-title" onClick={() => setOpen(current => ({...current,[group.label]:!current[group.label]}))}><span>{group.label}</span>{open[group.label] ? <ChevronDown/> : <ChevronRight/>}</button>
        {open[group.label] && group.items.map(item => <button className={`nav-item ${active === item.key ? 'active' : ''}`} key={item.key} onClick={() => { setActive(item.key); setMobile(false) }}><item.icon/><span>{item.label}</span></button>)}</section>)}</nav>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => supabase?.auth.signOut()}><LogOut/><span>Sair</span></button><button className="collapse-button" onClick={() => setCompact(value => !value)}><PanelLeftClose/></button></div>
    </aside>
    <header className="mobile-header"><button className="icon-button" onClick={() => setMobile(value => !value)}><Menu/></button><strong>Fábrika Kriativa</strong></header>
    <main className="main-content">{children}</main>
  </div>
}
