import { useMemo } from 'react'
import { readDashboardFocus, type DashboardFocus } from '../lib/dashboardFocus'
import { navigateTo } from '../lib/navigation'
export function useDashboardFocus(){const hash=window.location.hash;return useMemo(()=>readDashboardFocus(hash),[hash])}
export function DashboardFocusNotice({focus}:{focus:DashboardFocus|null}) {
  if(!focus)return null
  const format=(date:string)=>date.split('-').reverse().join('/')
  return <div className="inline-warning" role="status" style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'center',marginBottom:14}}><span><strong>Filtro da Visão geral:</strong> {focus.label}{(focus.period.from||focus.period.to)&&<> · {focus.period.from?format(focus.period.from):'Início'} a {focus.period.to?format(focus.period.to):'hoje'}</>}</span><button type="button" className="button secondary" onClick={()=>navigateTo(focus.module)}>Mostrar todos</button></div>
}

