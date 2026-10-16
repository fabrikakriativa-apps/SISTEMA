import {describe,it,expect} from 'vitest'
import {dashboardDate,dashboardPeriod,inDashboardPeriod,validDashboardPeriod} from './dashboardPeriod'
import {summarizeDashboard} from './dashboard'
const now=new Date('2026-10-16T15:00:00Z')
describe('períodos da visão geral',()=>{
  it('esse ano',()=>expect(dashboardPeriod('year',now)).toEqual({from:'2026-01-01',to:'2026-12-31'}))
  it('ano passado',()=>expect(dashboardPeriod('previousYear',now)).toEqual({from:'2025-01-01',to:'2025-12-31'}))
  it('últimos seis meses corridos até hoje',()=>expect(dashboardPeriod('sixMonths',now)).toEqual({from:'2026-04-16',to:'2026-10-16'}))
  it('últimos três meses corridos até hoje',()=>expect(dashboardPeriod('threeMonths',now)).toEqual({from:'2026-07-16',to:'2026-10-16'}))
  it('esse mês',()=>expect(dashboardPeriod('month',now)).toEqual({from:'2026-10-01',to:'2026-10-31'}))
  it('limita o dia ao fim do mês de destino',()=>expect(dashboardPeriod('threeMonths',new Date('2026-05-31T15:00:00Z'))).toEqual({from:'2026-02-28',to:'2026-05-31'}))
  it('respeita ano bissexto',()=>expect(dashboardPeriod('threeMonths',new Date('2024-05-31T15:00:00Z')).from).toBe('2024-02-29'))
  it('usa a data de São Paulo ao cruzar a meia-noite UTC',()=>expect(dashboardDate('2026-01-01T01:00:00Z')).toBe('2025-12-31'))
  it('inclui ambos os limites e exclui datas ausentes no filtro',()=>{
    const range={from:'2026-10-01',to:'2026-10-31'}
    expect(inDashboardPeriod('2026-10-01',range)).toBe(true)
    expect(inDashboardPeriod('2026-10-31T20:00:00Z',range)).toBe(true)
    expect(inDashboardPeriod('2026-11-01',range)).toBe(false)
    expect(inDashboardPeriod(null,range)).toBe(false)
    expect(inDashboardPeriod(null,dashboardPeriod('all',now))).toBe(true)
  })
  it('rejeita intervalo invertido',()=>expect(validDashboardPeriod({from:'2026-10-31',to:'2026-10-01'})).toBe(false))
  it('conversão usa só negociações criadas no mesmo período',()=>{
    const records=[{id:'antigo',created_at:'2025-10-01',document_type:'budget' as const,status:'approved',total:100},{id:'novo',created_at:'2026-10-05',document_type:'pre_budget' as const,status:'sent',total:200}]
    const result=summarizeDashboard(records.filter(item=>inDashboardPeriod(item.created_at,dashboardPeriod('year',now))),[],[],[])
    expect(result.totalBudgetCount).toBe(1)
    expect(result.budgetConversionRate).toBe(0)
    expect(result.negotiatingTotal).toBe(200)
  })
})

