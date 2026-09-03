import { ArrowRight, CalendarClock, CircleDollarSign, FileText, PackageCheck } from 'lucide-react'
import type { ModuleKey } from '../domain'
import { money } from '../lib/format'
import { Page } from '../components/Page'

export function Dashboard({ navigate }: { navigate: (key: ModuleKey) => void }) {
  const metrics = [
    { label:'Em negociação', value:money.format(0), helper:'Orçamentos ativos', icon:FileText },
    { label:'Pedidos ativos', value:'0', helper:'Acompanhados por status', icon:PackageCheck },
    { label:'A receber', value:money.format(0), helper:'Parcelas em aberto', icon:CircleDollarSign },
    { label:'Próximos compromissos', value:'0', helper:'Agenda dos próximos 7 dias', icon:CalendarClock },
  ]
  return <Page title="Visão geral" description="Um retrato claro da operação, sem dados duplicados ou cálculos ocultos.">
    <section className="metric-grid">{metrics.map(metric => <article className="metric-card" key={metric.label}><div><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.helper}</small></div><metric.icon/></article>)}</section>
    <section className="dashboard-grid"><article className="panel"><header><div><h2>Prioridades</h2><p>O que precisa de atenção agora.</p></div></header><div className="empty-state"><PackageCheck/><strong>Nenhuma pendência carregada</strong><span>Os dados aparecerão após a conexão do banco.</span></div></article>
      <article className="panel quick-actions"><header><h2>Acessos rápidos</h2></header>
        <button onClick={() => navigate('orcamentos')}><span><FileText/>Novo orçamento</span><ArrowRight/></button>
        <button onClick={() => navigate('clientes')}><span><FileText/>Cadastrar cliente</span><ArrowRight/></button>
        <button onClick={() => navigate('insumos')}><span><FileText/>Cadastrar insumo</span><ArrowRight/></button>
      </article></section>
  </Page>
}
