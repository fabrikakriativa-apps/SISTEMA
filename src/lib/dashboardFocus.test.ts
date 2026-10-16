import {describe,it,expect} from 'vitest'
import {priorityHash,readDashboardFocus,matchesDashboardFocus} from './dashboardFocus'
import {readRoute} from './navigation'
const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222'
describe('atalhos de prioridades',()=>{
  it('leva o período e exatamente os registros do contador',()=>{
    const hash=priorityHash('awaiting-finance',[a,b,a],{from:'2026-10-01',to:'2026-10-31'})
    expect(readRoute(hash)).toEqual({module:'pedidos',recordId:null})
    expect(readDashboardFocus(hash)).toMatchObject({kind:'awaiting-finance',ids:[a,b],period:{from:'2026-10-01',to:'2026-10-31'}})
    expect(matchesDashboardFocus(a,readDashboardFocus(hash))).toBe(true)
    expect(matchesDashboardFocus('outro',readDashboardFocus(hash))).toBe(false)
  })
  it('leva vencidos diretamente a lançamentos e não ao painel financeiro',()=>expect(readRoute(priorityHash('overdue-receivables',[a],{from:'',to:''})).module).toBe('financeiro-lancamentos'))
  it('distingue rascunhos de pré-orçamento e orçamento',()=>expect(readDashboardFocus(priorityHash('pre-drafts',[a],{from:'',to:''}))?.kind).toBe('pre-drafts'))
  it('remove da prioridade um pedido que mudou de etapa',()=>expect(matchesDashboardFocus(a,readDashboardFocus(priorityHash('awaiting-finance',[a],{from:'',to:''})),{status:'preparing'})).toBe(false))
  it('não mantém uma parcela já liquidada entre as vencidas',()=>expect(matchesDashboardFocus(a,readDashboardFocus(priorityHash('overdue-receivables',[a],{from:'',to:''})),{status:'settled',amount:100,paid_amount:100,due_date:'2025-01-01'})).toBe(false))
  it('não aplica filtro de outro módulo',()=>expect(readDashboardFocus(priorityHash('calendar-sync',[a],{from:'',to:''}).replace('/agenda?','/pedidos?'))).toBeNull())
  it('ignora parâmetros inválidos e preserva rotas de detalhes',()=>{
    expect(readDashboardFocus('#/pedidos?priority=unknown&ids=x')).toBeNull()
    expect(readRoute('#/pedidos/abc?from=2026-10-01')).toEqual({module:'pedidos',recordId:'abc'})
    expect(matchesDashboardFocus(a,null)).toBe(true)
  })
})

