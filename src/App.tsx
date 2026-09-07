import { useState } from 'react'
import type { ModuleKey } from './domain'
import { AuthGate } from './components/AuthorizedAccess'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/ToastProvider'
import { Dashboard } from './pages/Dashboard'
import { Clients } from './pages/Clients'
import { Supplies } from './pages/Supplies'
import { Budgets } from './pages/Budgets'
import { Orders } from './pages/Orders'
import { Finance } from './pages/Finance'
import { PurchasesConnected } from './pages/PurchasesConnected'
import { Suppliers } from './pages/Suppliers'
import { Calendar } from './pages/Calendar'
import { ModulePlaceholder } from './pages/ModulePlaceholder'

export function App() {
  const [active, setActive] = useState<ModuleKey>('inicio')
  const content = active === 'inicio' ? <Dashboard navigate={setActive}/>
    : active === 'clientes' ? <Clients/>
    : active === 'insumos' ? <Supplies/>
    : active === 'orcamentos' ? <Budgets/>
    : active === 'pedidos' ? <Orders/>
    : active === 'financeiro' ? <Finance/>
    : active === 'compras' ? <PurchasesConnected/>
    : active === 'fornecedores' ? <Suppliers/>
    : active === 'agenda' ? <Calendar/>
    : <ModulePlaceholder module={active}/>
  return <ToastProvider><AuthGate><Layout active={active} setActive={setActive}>{content}</Layout></AuthGate></ToastProvider>
}
