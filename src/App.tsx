import { useEffect, useState } from 'react'
import type { ModuleKey } from './domain'
import { AuthGate } from './components/AuthorizedAccess'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/ToastProvider'
import { Dashboard } from './pages/Dashboard'
import { Prospecting } from './pages/Prospecting'
import { Clients } from './pages/Clients'
import { Supplies } from './pages/Supplies'
import { Budgets } from './pages/Budgets'
import { Orders } from './pages/Orders'
import { Finance } from './pages/Finance'
import { PurchasesConnected } from './pages/PurchasesConnected'
import { Suppliers } from './pages/Suppliers'
import { Calendar } from './pages/Calendar'
import { ModulePlaceholder } from './pages/ModulePlaceholder'
import { navigateTo, readRoute } from './lib/navigation'

export function App() {
  const [active, setActive] = useState<ModuleKey>(()=>readRoute(window.location.hash).module)
  useEffect(()=>{const sync=()=>setActive(readRoute(window.location.hash).module);window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync)},[])
  const navigate=(module:ModuleKey)=>navigateTo(module)
  const content = active === 'inicio' ? <Dashboard navigate={navigate}/>
    : active === 'prospeccao' ? <Prospecting/>
    : active === 'clientes' ? <Clients/>
    : active === 'insumos' ? <Supplies/>
    : active === 'orcamentos' ? <Budgets/>
    : active === 'pedidos' ? <Orders/>
    : active === 'financeiro' ? <Finance/>
    : active === 'compras' ? <PurchasesConnected/>
    : active === 'fornecedores' ? <Suppliers/>
    : active === 'agenda' ? <Calendar/>
    : <ModulePlaceholder module={active}/>
  return <ToastProvider><AuthGate><Layout active={active} setActive={navigate}>{content}</Layout></AuthGate></ToastProvider>
}
