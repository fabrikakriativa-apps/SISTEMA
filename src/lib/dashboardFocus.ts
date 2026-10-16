import type { ModuleKey } from '../domain'
import { readRoute } from './navigation'
import type { DashboardPeriod } from './dashboardPeriod'
import { dashboardDate } from './dashboardPeriod'
import { needsCalendarSync } from './calendarStatus'
export const priorityTargets = {
  'pre-drafts': { module:'orcamentos', label:'Pré-orçamentos em rascunho' },
  'budget-drafts': { module:'orcamentos', label:'Orçamentos em rascunho' },
  'awaiting-finance': { module:'pedidos', label:'Pedidos aguardando financeiro' },
  'overdue-receivables': { module:'financeiro-lancamentos', label:'Parcelas a receber vencidas' },
  'calendar-sync': { module:'agenda', label:'Compromissos para sincronizar' },
} as const
export type PriorityKind = keyof typeof priorityTargets
export type DashboardFocus = { kind: PriorityKind; ids: string[]; period: DashboardPeriod; module:ModuleKey; label:string }
export function priorityHash(kind:PriorityKind, ids:string[], period:DashboardPeriod) {
  const query=new URLSearchParams({priority:kind,ids:[...new Set(ids)].join(',')})
  if(period.from)query.set('from',period.from)
  if(period.to)query.set('to',period.to)
  return `#/${priorityTargets[kind].module}?${query}`
}
export function readDashboardFocus(hash:string):DashboardFocus|null {
  const query=new URLSearchParams(hash.split('?')[1]??'')
  const kind=query.get('priority') as PriorityKind
  if(!Object.prototype.hasOwnProperty.call(priorityTargets,kind))return null
  const target=priorityTargets[kind]
  if(readRoute(hash).module!==target.module)return null
  const ids=[...new Set((query.get('ids')??'').split(',').filter(id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))].slice(0,1000)
  if(!ids.length)return null
  const date=(name:string)=>/^\d{4}-\d{2}-\d{2}$/.test(query.get(name)??'')?query.get(name)!:''
  return {kind,ids,period:{from:date('from'),to:date('to')},...target}
}
type PriorityRecord={status?:string;document_type?:string;amount?:number|string;paid_amount?:number|string;due_date?:string|null;sync_status?:string;cancelled_at?:string|null}
export function matchesDashboardFocus(id:string,focus:DashboardFocus|null,record?:PriorityRecord){
  if(!focus)return true
  if(!focus.ids.includes(id))return false
  if(!record)return true
  if(focus.kind==='awaiting-finance')return record.status==='awaiting_finance'
  if(focus.kind==='pre-drafts')return record.status==='draft'&&record.document_type==='pre_budget'
  if(focus.kind==='budget-drafts')return record.status==='draft'&&record.document_type==='budget'
  if(focus.kind==='calendar-sync')return !record.cancelled_at&&needsCalendarSync(record.sync_status??'')
  return ['open','partial','overdue'].includes(record.status??'')&&Number(record.amount)>Number(record.paid_amount)&&(record.status==='overdue'||!!(record.due_date&&record.due_date<dashboardDate(new Date().toISOString())))
}

