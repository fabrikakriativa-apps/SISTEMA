import { useEffect, useMemo, useState } from 'react'
import { Activity, BarChart3, Bot, CalendarDays, Clock3, ExternalLink, Hand, MessageCircle, PauseCircle, RefreshCcw, Search, ShieldAlert, Sparkles, Users, UserRoundCheck } from 'lucide-react'
import type { KiaraConversation, KiaraMessage } from '../lib/kiaraMetrics'
import { supabase } from '../lib/supabase'
import { commandKiara, kiaraControlConfigured, readKiaraControl, type KiaraOperatorAction } from '../lib/kiaraControl'
import { useAccess } from '../components/AuthorizedAccess'
import { formatLeadResponseTime, leadResponseStats, leadAwaitingResponseMs, leadLastInboundMs } from '../lib/kiaraMetrics'
import { KiaraCoaching } from './KiaraCoaching'
import { kiaraCoachConfigured, readKiaraHold, setKiaraHold } from '../lib/kiaraCoachingControl'
import './KiaraAttendance.css'

const labels: Record<KiaraConversation['status'], string> = {
  ai: 'Kiara atendendo', waiting_human: 'Aguardando humano',
  human: 'Atendimento assumido', no_interaction: 'Sem interação',
}
const dateOnly = (iso: string) => iso.slice(0, 10)

export function KiaraAttendance() {
  // V1: interface segura, sem simular dados como se viessem do WhatsApp.
  // As conversas serão carregadas pelo serviço autenticado da Kiara na próxima etapa.
  const access = useAccess()
  const [conversations, setConversations] = useState<KiaraConversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [coachingMessage, setCoachingMessage] = useState<KiaraMessage|null>(null)
  const [showCoaching,setShowCoaching] = useState(false)
  const [holdReady,setHoldReady] = useState(false)
  const [replyHeld,setReplyHeld] = useState(false)
  const [holdBusy,setHoldBusy] = useState(false)
  const [holdFeedback,setHoldFeedback] = useState('')
  useEffect(()=>{
    setHoldReady(false);setReplyHeld(false)
    if(!selectedId || !kiaraCoachConfigured || !access || !['admin','comercial'].includes(access.role)) return
    let cancelled=false
    void readKiaraHold(selectedId).then(result=>{if(!cancelled){setReplyHeld(result.held);setHoldReady(true)}})
      .catch(()=>{if(!cancelled)setHoldFeedback('Segurar resposta ainda não está habilitado no servidor.')})
    return ()=>{cancelled=true}
  },[selectedId,access?.organizationId,access?.role,refresh])
  const toggleHold=async()=>{
    if(!selectedId || !holdReady || holdBusy) return
    setHoldBusy(true);setHoldFeedback('')
    try{
      const result=await setKiaraHold(selectedId,!replyHeld)
      setReplyHeld(result.held)
      setHoldFeedback(result.held?'Kiara aguardando sua orientação.':'Resposta liberada para a fila da Kiara.')
    }catch(err){setHoldFeedback(err instanceof Error?err.message:'Não foi possível confirmar a alteração.')}
    finally{setHoldBusy(false)}
  }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState('')
  const [controlReady, setControlReady] = useState(false)
  const [kiaraEnabled, setKiaraEnabled] = useState(false)
  const [controlBusy, setControlBusy] = useState(false)
  const [controlFeedback, setControlFeedback] = useState('')
  useEffect(() => {
    if (!kiaraControlConfigured || !access || !['admin','comercial'].includes(access.role)) return
    let cancelled=false
    void readKiaraControl().then(result=>{if(!cancelled){setControlReady(true);setKiaraEnabled(result.enabled);setControlFeedback('')}})
      .catch(()=>{if(!cancelled){setControlReady(false);setControlFeedback('Controle operacional indisponível. Nenhuma ação foi habilitada.')}})
    return ()=>{cancelled=true}
  },[access?.organizationId,access?.role,refresh])
  const runCommand = async (action:KiaraOperatorAction,id?:string) => {
    if(!controlReady || controlBusy) return
    if(action==='pause_all' && !window.confirm('Parar todas as respostas automáticas da Kiara, inclusive as que estiverem na fila?')) return
    if(action==='resume_all' && !window.confirm('Reativar o atendimento automático da Kiara para conversas liberadas?')) return
    setControlBusy(true);setControlFeedback('')
    try {
      await commandKiara(action,id)
      if(action==='pause_all') setKiaraEnabled(false)
      if(action==='resume_all') setKiaraEnabled(true)
      setControlFeedback('Comando confirmado pelo servidor.')
      setRefresh(value=>value+1)
    } catch(error){setControlFeedback(error instanceof Error ? error.message : 'Não foi possível confirmar a alteração.')}
    finally{setControlBusy(false)}
  }
  // Atualiza somente enquanto este módulo está montado e a aba visível.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') { setNowMs(Date.now());setRefresh(value => value + 1) }
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!supabase || !access || !['admin','comercial'].includes(access.role)) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const { data, error: fetchError } = await supabase!.from('kiara_conversations')
          .select('id,contact_name,contact_phone,status,origin,campaign,region,last_interaction_at')
          .eq('organization_id', access.organizationId)
          .order('last_interaction_at', { ascending: false }).limit(100)
        if (fetchError) throw fetchError
        const mapped: KiaraConversation[] = (data ?? []).map(row => ({
          id: row.id, name: row.contact_name, phone: row.contact_phone,
          status: row.status as KiaraConversation['status'], origin: row.origin,
          campaign: row.campaign, region: row.region, lastInteractionAt: row.last_interaction_at,
          messages: []
        }))
        if (!cancelled) {
          setConversations(previous => mapped.map(item => ({...item, messages: previous.find(old => old.id === item.id)?.messages ?? []})))
          setSelectedId(current => current && mapped.some(item=>item.id===current) ? current : mapped[0]?.id ?? null)
          setError('')
        }
      } catch {
        if (!cancelled) setError('Ainda não foi possível consultar as conversas. A estrutura do banco deve ser revisada e ativada antes da sincronização.')
      } finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [access?.organizationId, access?.role, refresh])
  useEffect(() => {
    if (!selectedId || !access || !supabase) return
    let cancelled = false
    const loadMessages = async () => {
      setMessagesLoading(true)
      setMessagesError('')
      const { data, error: fetchError } = await supabase!.from('kiara_messages')
        .select('id,direction,sender,occurred_at,text_body')
        .eq('organization_id',access.organizationId)
        .eq('conversation_id',selectedId)
        .order('occurred_at',{ascending:false}).limit(100)
      if (cancelled) return
      setMessagesLoading(false)
      if (fetchError) { setMessagesError('Não foi possível atualizar as mensagens desta conversa.'); return }
      const messages: KiaraMessage[] = (data??[]).map(row=>({id:row.id,direction:row.direction,sender:row.sender,createdAt:row.occurred_at,text:row.text_body||'[Mensagem não textual]'})).reverse()
      setConversations(current=>current.map(item=>item.id===selectedId?{...item,messages}:item))
    }
    void loadMessages()
    return ()=>{cancelled=true}
  },[selectedId,access?.organizationId,refresh])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [campaignFilter, setCampaignFilter] = useState('all')
  const [regionFilter, setRegionFilter] = useState('all')
  const campaigns = useMemo(() => [...new Set(conversations.map(item => item.campaign).filter((value): value is string => Boolean(value)))].sort(), [conversations])
  const regions = useMemo(() => [...new Set(conversations.map(item => item.region).filter((value): value is string => Boolean(value)))].sort(), [conversations])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const selected = conversations.find(item => item.id === selectedId) ?? null
  const filtered = useMemo(() => conversations.filter(item => {
    const query = search.trim().toLocaleLowerCase('pt-BR')
    return (!query || [item.name, item.phone, item.campaign, item.origin, item.region].some(value => (value || '').toLocaleLowerCase('pt-BR').includes(query)))
      && (status === 'all' || item.status === status)
      && (campaignFilter === 'all' || item.campaign === campaignFilter)
      && (regionFilter === 'all' || item.region === regionFilter)
      && (!from || dateOnly(item.lastInteractionAt) >= from)
      && (!to || dateOnly(item.lastInteractionAt) <= to)
  }), [conversations, search, status, campaignFilter, regionFilter, from, to])
  const count = (key: KiaraConversation['status']) => conversations.filter(item => item.status === key).length
  const stats = selected ? leadResponseStats(selected.messages) : null
  const pendingMs = selected ? leadAwaitingResponseMs(selected.messages, nowMs) : null
  const lastInboundMs = selected ? leadLastInboundMs(selected.messages, nowMs) : null
  const waLink = selected ? `https://wa.me/${selected.phone.replace(/\D/g, '')}` : ''

  return <section className="kiara-page">
    <header className="kiara-page-head">
      <div><span className="kiara-eyebrow"><Sparkles size={16}/> Fábrika Kriativa · Kiara</span>
        <h1>Atendimento IA</h1>
        <p>Acompanhe conversas e leads, e saiba quando sua equipe precisa intervir.</p>
      </div>
      <span className="kiara-mode"><span/> {loading ? 'Atualizando…' : error ? 'Falha ao sincronizar' : conversations.length ? 'Conversas sincronizadas' : 'Aguardando conversas'}</span>
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
          <button disabled={!controlReady || controlBusy || !kiaraEnabled} onClick={()=>void runCommand('pause_all')} className="kiara-danger"><PauseCircle size={17}/> Parar Kiara</button>
          {controlReady && !kiaraEnabled && <button disabled={controlBusy || access?.role !== 'admin'} onClick={()=>void runCommand('resume_all')} className="kiara-refresh">Reativar Kiara</button>}
          <small>{controlReady ? (kiaraEnabled ? 'Controle geral confirmado pelo servidor.' : 'Atendimento automático desativado.') : 'O controle será liberado depois da integração segura.'}</small>
          {controlFeedback && <small role="status">{controlFeedback}</small>}
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
        <p>Indicadores baseados nos registros sincronizados. O funil comercial completo permanece no módulo Prospecção.</p>
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
          <select aria-label="Filtrar por campanha" value={campaignFilter} onChange={event=>setCampaignFilter(event.target.value)}><option value="all">Todas as campanhas</option>{campaigns.map(value=><option key={value} value={value}>{value}</option>)}</select>
          <select aria-label="Filtrar por região" value={regionFilter} onChange={event=>setRegionFilter(event.target.value)}><option value="all">Todas as regiões</option>{regions.map(value=><option key={value} value={value}>{value}</option>)}</select>
          <label className="kiara-date"><CalendarDays size={16}/> De <input type="date" value={from} onChange={event=>setFrom(event.target.value)}/></label>
          <label className="kiara-date">Até <input type="date" value={to} min={from||undefined} onChange={event=>setTo(event.target.value)}/></label>
        </div>
        {error && <p role="alert" className="kiara-data-error">{error}</p>}
        <button className="kiara-refresh" type="button" onClick={()=>setRefresh(value=>value+1)} disabled={loading}>Atualizar atendimentos</button>
        {filtered.length === 0 ? <div className="kiara-empty"><MessageCircle size={34}/><strong>Nenhum atendimento sincronizado ainda</strong>
          <p>A lista mostrará os atendimentos reais assim que a sincronização segura estiver configurada. Nenhum contato fictício será exibido.</p></div> :
          <div className="kiara-lead-list">{filtered.map(item=><button key={item.id} className={selected?.id===item.id?'selected':''} onClick={()=>{setSelectedId(item.id);setCoachingMessage(null)}}>
            <span className="kiara-initial">{(item.name||item.phone).slice(0,2).toUpperCase()}</span>
            <span className="kiara-lead-main"><strong>{item.name||item.phone}</strong><small>{item.campaign||item.origin||'Origem não identificada'} · {item.region||'Região não informada'}</small></span>
            <span className="kiara-lead-meta"><span className={`kiara-status ${item.status}`}>{labels[item.status]}</span><small>{new Date(item.lastInteractionAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</small></span>
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
          <small>{stats?.samples ? `Calculado com ${stats.samples} resposta(s) do cliente após mensagem da loja (últimas 100 mensagens sincronizadas).` : 'Aparecerá quando houver respostas registradas.'}</small>
          <div className="kiara-time-divider"/>
          <span><Clock3 size={16}/> {pendingMs !== null ? 'Aguardando resposta do lead há' : 'Última mensagem do cliente'}</span>
          <strong>{pendingMs !== null ? formatLeadResponseTime(pendingMs) : lastInboundMs !== null ? `há ${formatLeadResponseTime(lastInboundMs)}` : 'Sem dados'}</strong>
          <small>{pendingMs !== null ? 'Contagem desde a última mensagem enviada pela Kiara ou pela equipe.' : 'O cliente não tem uma resposta pendente à última mensagem da loja.'}</small>
        </div>
        {messagesError && <p className="kiara-data-error" role="alert">{messagesError}</p>}
        <div className="kiara-chat" aria-label="Histórico da conversa">
          {messagesLoading && <p className="kiara-chat-loading" role="status">Atualizando mensagens…</p>}
          {!selected ? <div className="kiara-chat-placeholder"><MessageCircle size={34}/><p>As mensagens recebidas, respostas da Kiara e intervenções humanas aparecerão aqui.</p></div> :
          selected.messages.length===0 && !messagesLoading ? <div className="kiara-chat-placeholder"><MessageCircle size={26}/><p>Sem mensagens registradas para esta conversa.</p></div> : selected.messages.map(msg=><div key={msg.id} className={`kiara-bubble ${msg.direction}`}><span>{msg.text}</span><small>{msg.sender === 'kiara' ? 'Kiara · ' : msg.sender === 'human' ? 'Equipe · ' : ''}{new Date(msg.createdAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</small>{msg.sender==='kiara'&&<button type="button" className="kiara-correct-msg" onClick={()=>{setCoachingMessage(msg);setShowCoaching(true)}}><Sparkles size={13}/> Corrigir resposta</button>}</div>)}
        </div>
        <div className="kiara-coach-toggle"><div className="kiara-coach-control">
          <button type="button" disabled={!selected || !holdReady || holdBusy} className={replyHeld?'kiara-hold-on':''} onClick={()=>void toggleHold()}>
            <PauseCircle size={17}/>{replyHeld?'Liberar resposta':'Segurar próxima resposta'}
          </button>
          {replyHeld&&<strong className="kiara-hold-warning">Resposta automática suspensa nesta conversa</strong>}
          {holdFeedback&&<small role="status">{holdFeedback}</small>}
        </div><button type="button" onClick={()=>setShowCoaching(value=>!value)}><Sparkles size={17}/> {showCoaching?'Fechar orientação':'Orientar Kiara'} <span>Interno</span></button></div>
        {showCoaching&&<KiaraCoaching conversationId={selectedId} selectedMessage={coachingMessage} clearSelectedMessage={()=>setCoachingMessage(null)}/>}
        <div className="kiara-chat-actions">
          <button disabled={!selected || !controlReady || controlBusy || selected.status==='human'} onClick={()=>selected && void runCommand('assume',selected.id)}><Hand size={16}/> Assumir</button>
          <button disabled={!selected || !controlReady || controlBusy || selected.status==='ai'} onClick={()=>selected && void runCommand('return_to_ai',selected.id)}><RefreshCcw size={16}/> Devolver à Kiara</button>
        </div>
        <p className="kiara-security"><ShieldAlert size={16}/> As ações só são liberadas após confirmação da autorização pelo servidor. A proteção contra envios pendentes também precisa ser validada.</p>
      </aside>
    </div>
    <p className="kiara-footnote"><Activity size={15}/> O espelhamento depende de mensagens sincronizadas pelo Worker; a autorização dos comandos também depende da configuração segura do servidor.</p>
  </section>
}
