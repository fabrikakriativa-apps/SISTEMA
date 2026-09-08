import { lazy, Suspense, useEffect, useState } from 'react'
import type { ModuleKey } from './domain'
import { AuthGate } from './components/AuthorizedAccess'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/ToastProvider'
import { navigateTo, readRoute } from './lib/navigation'

const Dashboard=lazy(()=>import('./pages/Dashboard').then(module=>({default:module.Dashboard})))
const Prospecting=lazy(()=>import('./pages/Prospecting').then(module=>({default:module.Prospecting})))
const Clients=lazy(()=>import('./pages/Clients').then(module=>({default:module.Clients})))
const Supplies=lazy(()=>import('./pages/Supplies').then(module=>({default:module.Supplies})))
const Budgets=lazy(()=>import('./pages/Budgets').then(module=>({default:module.Budgets})))
const Orders=lazy(()=>import('./pages/Orders').then(module=>({default:module.Orders})))
const Finance=lazy(()=>import('./pages/Finance').then(module=>({default:module.Finance})))
const PurchasesConnected=lazy(()=>import('./pages/PurchasesConnected').then(module=>({default:module.PurchasesConnected})))
const Suppliers=lazy(()=>import('./pages/Suppliers').then(module=>({default:module.Suppliers})))
const Calendar=lazy(()=>import('./pages/Calendar').then(module=>({default:module.Calendar})))
const Administration=lazy(()=>import('./pages/Administration').then(module=>({default:module.Administration})))

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
    : <Administration/>
  return <ToastProvider><AuthGate><Layout active={active} setActive={navigate}><Suspense fallback={<p className="panel-message" role="status">Carregando módulo…</p>}>{content}</Suspense></Layout></AuthGate></ToastProvider>
}
