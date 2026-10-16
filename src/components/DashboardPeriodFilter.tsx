import { dashboardPeriod, type DashboardPeriod, type DashboardPreset } from '../lib/dashboardPeriod'
export function DashboardPeriodFilter({ value, preset, onChange }: { value: DashboardPeriod; preset: DashboardPreset; onChange: (value: DashboardPeriod, preset: DashboardPreset) => void }) {
  return <section className="dashboard-period" aria-label="Filtro de período da visão geral">
    <strong>Período</strong><div className="date-range-filter">
      <label>De<input aria-label="Início do período da visão geral" type="date" value={value.from} onChange={event=>onChange({...value,from:event.target.value},'custom')}/></label>
      <label>Até<input aria-label="Fim do período da visão geral" type="date" value={value.to} onChange={event=>onChange({...value,to:event.target.value},'custom')}/></label>
      <select aria-label="Período rápido da visão geral" value={preset} onChange={event=>{const selected=event.target.value as DashboardPreset;onChange(dashboardPeriod(selected),selected)}}>
        <option value="all">Todo o histórico</option><option value="year">Esse ano</option><option value="previousYear">Ano passado</option><option value="sixMonths">Últimos 6 meses</option><option value="threeMonths">Últimos 3 meses</option><option value="month">Esse mês</option><option value="custom" disabled>Personalizado</option>
      </select>
    </div>
    <details className="dashboard-method"><summary>Critérios do período</summary><p>Negociações e pedidos: data de criação.<br/>Conversão: situação atual das negociações criadas no período.<br/>A receber: vencimento.<br/>Agenda: data do compromisso.<br/>Últimos meses: intervalo móvel até hoje.</p></details>
  </section>
}

