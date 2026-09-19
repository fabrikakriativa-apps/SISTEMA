import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarRange, UsersRound } from 'lucide-react'
import { Page } from '../components/Page'
import { useAccess } from '../components/AuthorizedAccess'
import { useToast } from '../components/ToastProvider'
import { money } from '../lib/format'
import { supabase } from '../lib/supabase'

type Assignment={id:string;description:string;planned_start:string|null;planned_end:string|null;labor_days:number;amount:number;status:string;supplier:{name:string}|null;order:{display_number:string}|null}
const labels:Record<string,string>={planned:'Planejado',in_progress:'Em andamento',completed:'Concluído',cancelled:'Cancelado'}
const dateKey=(date:Date)=>date.toISOString().slice(0,10)
const addDays=(date:Date,days:number)=>{const next=new Date(date);next.setDate(next.getDate()+days);return next}
const weekStart=()=>{const date=new Date();const offset=(date.getDay()+6)%7;return addDays(date,-offset)}

export function ProviderWorkload(){
 const access=useAccess(),{show}=useToast(),[items,setItems]=useState<Assignment[]>([]),[loading,setLoading]=useState(true),[provider,setProvider]=useState('')
 const start=useMemo(weekStart,[]),days=useMemo(()=>Array.from({length:21},(_,index)=>addDays(start,index)),[start])
 const load=useCallback(async()=>{if(!supabase||!access)return;setLoading(true);const {data,error}=await supabase.from('provider_assignments').select('id,description,planned_start,planned_end,labor_days,amount,status,supplier:suppliers!provider_assignments_supplier_id_fkey(name),order:orders!provider_assignments_order_id_fkey(display_number)').eq('organization_id',access.organizationId).neq('status','cancelled').order('planned_start',{ascending:true});if(error)show('A visão de prestadores será liberada após aplicar a migração de mão de obra.','info');else setItems((data??[]) as unknown as Assignment[]);setLoading(false)},[access,show])
 useEffect(()=>{void load()},[load])
 const providers=useMemo(()=>Array.from(new Set(items.map(item=>item.supplier?.name).filter(Boolean) as string[])).sort((a,b)=>a.localeCompare(b,'pt-BR')),[items])
 const visible=provider?items.filter(item=>item.supplier?.name===provider):items
 const unplanned=visible.filter(item=>!item.planned_start).length
 const overlaps=(item:Assignment,date:Date)=>!!item.planned_start&&dateKey(date)>=item.planned_start&&dateKey(date)<=(item.planned_end??item.planned_start)
 return <Page title="Carga dos prestadores" description="Acompanhe a distribuição prevista de serviços e identifique sobrecargas antes de confirmar a agenda."><section className="panel provider-workload"><div className="toolbar"><div className="provider-filter"><UsersRound/><select aria-label="Filtrar prestador" value={provider} onChange={event=>setProvider(event.target.value)}><option value="">Todos os prestadores</option>{providers.map(name=><option key={name}>{name}</option>)}</select></div><span>{visible.length} serviço(s) · {unplanned} sem início previsto</span></div>{loading?<p className="panel-message">Carregando carga dos prestadores…</p>:!items.length?<div className="empty-state"><CalendarRange/><strong>Nenhuma mão de obra aprovada</strong><span>Inclua prestador, dias e valor na composição do item. Após a aprovação do orçamento, ela aparecerá aqui.</span></div>:<div className="provider-gantt"><div className="provider-gantt-head"><div>Prestador / serviço</div>{days.map(day=><div key={dateKey(day)} className={day.getDay()===0||day.getDay()===6?'weekend':''}><small>{day.toLocaleDateString('pt-BR',{weekday:'short'})}</small><strong>{day.getDate()}</strong></div>)}</div>{visible.map(item=><div className="provider-gantt-row" key={item.id}><div><strong>{item.supplier?.name??'Prestador não informado'}</strong><span>{item.order?.display_number??'Pedido'} · {item.description} · {item.labor_days} dia(s) · {money.format(Number(item.amount))}</span>{!item.planned_start&&<small>Defina o início previsto no item antes da aprovação.</small>}</div>{days.map(day=><div className={`gantt-cell ${overlaps(item,day)?'occupied':''}`} key={dateKey(day)} title={overlaps(item,day)?`${item.description} · ${labels[item.status]??item.status}`:''}>{overlaps(item,day)&&<i/>}</div>)}</div>)}</div>}</section></Page>
}
