import { useMemo, useState } from 'react'
import { Activity, BarChart3, Bot, CalendarDays, Clock3, ExternalLink, Hand, MessageCircle, PauseCircle, RefreshCcw, Search, ShieldAlert, Sparkles, Users, UserRoundCheck } from 'lucide-react'
import type { KiaraConversation } from '../lib/kiaraMetrics'
import { formatLeadResponseTime, leadResponseStats } from '../lib/kiaraMetrics'
import './KiaraAttendance.css'

const labels: Record<KiaraConversation['status'], string> = {
  ai: 'Kiara atendendo', waiting_human: 'Aguardando humano',
  human: 'Atendimento assumido', no_interaction: 'Sem interação',
}
const dateOnly = (iso: string) => iso.slice(0, 10)

export function KiaraAttendance() {
  // V1: interface segura, sem simular dados como se viessem do WhatsApp.
  // As conversas serão carregadas pelo serviço autenticado da Kiara na próxima etapa.
  const [conversations] = useState<KiaraConversation[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = conversations.find(item => item.id === selectedId) ?? null
  const filtered = useMemo(() => conversations.filter(item => {
    const query = search.trim().toLocaleLowerCase('pt-BR')
    return (!query || [item.name, item.phone, item.campaign, item.origin, item.region].some(value => (value || '').toLocaleLowerCase('pt-BR').includes(query)))
      && (status === 'all' || item.status === status)
      && (!from || dateOnly(item.lastInteractionAt) >= from)
      && (!to || dateOnly(item.lastInteractionAt) <= to)
  }), [conversations, search, status, from, to])
  const count = (key: KiaraConversation['status']) => conversations.filter(item => item.status === key).length
  const stats = selected ? leadResponseStats(selected.messages) : null
  const waLink = selected ? `https://wa.me/${selected.phone.replace(/\D/g, '')}` : ''

  return <section className="kiara-page">
    <header className="kiara-page-head">
      <div><span className="kiara-eyebrow"><Sparkles size={16}/> Fábrika Kriativa · Kiara</span>
        <h1>Atendimento IA</h1>
        <p>Acompanhe conversas e leads, e saiba quando sua equipe precisa intervir.</p>
      </div>
      <span className="kiara-mode"><span/> Integração em preparação</span>
    </header>

    <div className="kiara-kpis">
      <div className="kiara-kpi"><span className="kiara-kpi-icon blue"><Users/></span><div><small>Leads recebidos</small><strong>{conversations.length}</strong></div></div>
      <div className="kiara-kpi"><span className="kiara-kpi-icon green"><Bot/></span><div><small>Kiara atendendo</small><strong>{count('ai')}</strong></div></div>
      <div className="kiara-kpi"><span className="kiara-kpi-icon amber"><Hand/></span><div><small>Aguardando humano</small><strong>{count('waiting_human')}</strong></div></div>
      <div className="kiara-kpi"><span className="kiara-kpi-icon purple"><UserRoundCheck/></span><div><small>Assumidos</small><strong>{count('human')}</strong></div></div>
      <div className="kiara-kpi"><span className="kiara-kpi-icon gray"><Clock3/></span><div><small>Sem interação</small><strong>{count('no_interaction')}</strong></div></div>
    </div>

    <div className="kiara-top-row">
      <div className="kiara-control-card">
        <div className="kiara-avatar"><Sparkles size={32}/><Bot size={44}/></div>
        <div className="kiara-control-copy"><h2>Kiara <span className="kiara-preview-badge">Painel em desenvolvimento</span></h2>
          <p>Um lugar para acompanhar a triagem, identificar oportunidades e controlar a atuação da IA.</p>
          <button disabled title="Será habilitado após conexão segura com o Worker" className="kiara-danger"><PauseCircle size={17}/> Parar Kiara</button>
          <small>O botão de emergência só será liberado após o bloqueio real de envios estar implementado e testado.</small>
        </div>
      </div>
      <div className="kiara-funnel-card">
        <h2><BarChart3 size={18}/> Fluxo de atendimento</h2>
        <div className="kiara-funnel-steps">
          <div><span>Recebidos</span><strong>{conversations.length}</strong></div>
          <div><span>IA atendendo</span><strong>{count('ai')}</strong></div>
          <div><span>Aguardando humano</span><strong>{count('waiting_human')}</strong></div>
          <div><span>Assumidos</span><strong>{count('human')}</strong></div>
        </div>
        <p>Indicadores reais serão exibidos após a sincronização da Kiara.</p>
      </div>
    </div>

    <div className="kiara-workspace">
      <div className="kiara-list-card">
        <div className="kiara-list-header"><h2>Atendimentos <span>{filtered.length}</span></h2>
          <p>Selecione um contato para acompanhar a conversa.</p></div>
        <div className="kiara-filters">
          <label className="kiara-search"><Search size={17}/><input aria-label="Buscar atendimentos" placeholder="Buscar nome, número, campanha ou região" value={search} onChange={event=>setSearch(event.target.value)}/></label>
          <select aria-label="Filtrar por status" value={status} onChange={event=>setStatus(event.target.value)}>
            <option value="all">Todos os status</option>
            {Object.entries(labels).map(([key, value])=><option key={key} value={key}>{value}</option>)}
          </select>
          <label className="kiara-date"><CalendarDays size={16}/> De <input type="date" value={from} onChange={event=>setFrom(event.target.value)}/></label>
          <label className="kiara-date">Até <input type="date" value={to} min={from||undefined} onChange={event=>setTo(event.target.value)}/></label>
        </div>
        {filtered.length === 0 ? <div className="kiara-empty"><MessageCircle size={34}/><strong>Nenhum atendimento sincronizado ainda</strong>
          <p>Esta primeira versão prepara a interface. Não há dados fictícios nem acesso ao WhatsApp habilitado.</p></div> :
          <div className="kiara-lead-list">{filtered.map(item=><button key={item.id} className={selected?.id===item.id?'selected':''} onClick={()=>setSelectedId(item.id)}>
            <span className="kiara-initial">{(item.name||item.phone).slice(0,2).toUpperCase()}</span>
            <span className="kiara-lead-main"><strong>{item.name||item.phone}</strong><small>{item.campaign||item.origin||'Origem não identificada'} · {item.region||'Região não informada'}</small></span>
            <span className={`kiara-status ${item.status}`}>{labels[item.status]}</span>
          </button>)}</div>}
      </div>

      <aside className="kiara-conversation-card">
        <div className="kiara-conversation-head">
          <div><h2><MessageCircle size={19}/> Conversa espelhada</h2><p>{selected ? selected.name||selected.phone : 'Selecione um atendimento para visualizar'}</p></div>
          {selected && <a href={waLink} target="_blank" rel="noopener noreferrer" aria-label="Abrir no WhatsApp"><ExternalLink size={20}/></a>}
        </div>
        <div className="kiara-time-card">
          <span><Clock3 size={16}/> Tempo médio de resposta do lead</span>
          <strong>{formatLeadResponseTime(stats?.averageMs??null)}</strong>
          <small>{stats?.samples ? `Calculado com ${stats.samples} resposta(s) do cliente após mensagem da loja.` : 'Aparecerá após haver respostas suficientes para calcular.'}</small>
        </div>
        <div className="kiara-chat" aria-label="Histórico da conversa">
          {!selected ? <div className="kiara-chat-placeholder"><MessageCircle size={34}/><p>As mensagens recebidas, respostas da Kiara e intervenções humanas aparecerão aqui.</p></div> :
          selected.messages.map(msg=><div key={msg.id} className={`kiara-bubble ${msg.direction}`}><span>{msg.text}</span><small>{msg.sender === 'kiara' ? 'Kiara · ' : msg.sender === 'human' ? 'Equipe · ' : ''}{new Date(msg.createdAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</small></div>)}
        </div>
        <div className="kiara-chat-actions">
          <button disabled title="Aguardando implementação do bloqueio por cliente"><Hand size={16}/> Assumir</button>
          <button disabled title="Aguardando implementação da liberação por cliente"><RefreshCcw size={16}/> Devolver à Kiara</button>
        </div>
        <p className="kiara-security"><ShieldAlert size={16}/> Os controles permanecerão desabilitados até poderem parar mensagens pendentes na fila com segurança.</p>
      </aside>
    </div>
    <p className="kiara-footnote"><Activity size={15}/> Primeira etapa de desenvolvimento: layout integrado ao SISTEMA. A conexão com WhatsApp, banco e os botões operacionais virão em uma etapa separada e testada.</p>
  </section>
}
