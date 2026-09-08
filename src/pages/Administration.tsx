import {useCallback,useEffect,useState} from 'react'
import {History,RefreshCw,ShieldCheck} from 'lucide-react'
import {Page} from '../components/Page'
import {useAccess} from '../components/AuthorizedAccess'
import {supabase} from '../lib/supabase'

type Identity={organization:string;name:string;email:string}
type Audit={id:number;entity_type:string;action:string;reason:string|null;created_at:string}
const roleLabels:Record<string,string>={admin:'Administrador',comercial:'Comercial',compras:'Compras',financeiro:'Financeiro',operacao:'Operação'}
const entityLabels:Record<string,string>={clients:'Clientes',supplies:'Insumos',suppliers:'Fornecedores',budgets:'Orçamentos',orders:'Pedidos',purchases:'Compras',receivables:'Contas a receber',payables:'Contas a pagar',calendar_events:'Agenda'}

export function Administration(){
 const access=useAccess(),[identity,setIdentity]=useState<Identity>({organization:'—',name:'—',email:'—'}),[audit,setAudit]=useState<Audit[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 const load=useCallback(async()=>{if(!supabase||!access)return;setLoading(true);setError('');const [organization,profile,history]=await Promise.all([
  supabase.from('organizations').select('name').eq('id',access.organizationId).single(),
  supabase.from('profiles').select('full_name,email').eq('id',access.userId).single(),
  access.role==='admin'?supabase.from('audit_log').select('id,entity_type,action,reason,created_at').eq('organization_id',access.organizationId).order('created_at',{ascending:false}).limit(50):Promise.resolve({data:[],error:null})
 ]);if(organization.error||profile.error){setError('Não foi possível carregar os dados administrativos.');setLoading(false);return}setIdentity({organization:organization.data.name,name:profile.data.full_name||'Nome não informado',email:profile.data.email||'E-mail não informado'});setAudit((history.data??[]) as Audit[]);setLoading(false)},[access])
 useEffect(()=>{void load()},[load])
 return <Page title="Administração" description="Identidade da empresa, acesso atual e histórico de alterações." action={<button className="button secondary" disabled={loading} onClick={()=>void load()}><RefreshCw/>Atualizar</button>}>
  {error&&<p role="alert">{error}</p>}
  <section className="status-grid"><article><span>Empresa</span><strong>{identity.organization}</strong></article><article><span>Usuário conectado</span><strong>{identity.name}</strong></article><article><span>Perfil de acesso</span><strong>{roleLabels[access?.role??'']??'—'}</strong></article><article><span>Sessão</span><strong>{access?'Protegida':'Indisponível'}</strong></article></section>
  <section className="panel"><div className="panel-heading"><div><ShieldCheck/><h2>Acesso atual</h2></div></div><div className="detail-grid"><div><span>Nome</span><strong>{identity.name}</strong></div><div><span>E-mail</span><strong>{identity.email}</strong></div><div><span>Empresa</span><strong>{identity.organization}</strong></div><div><span>Permissão</span><strong>{roleLabels[access?.role??'']??'—'}</strong></div></div></section>
  <section className="panel"><div className="panel-heading"><div><History/><h2>Alterações recentes</h2></div><span>{access?.role==='admin'?'Últimos 50 registros':'Visível somente para administradores'}</span></div>{loading?<p className="panel-message">Carregando administração…</p>:access?.role!=='admin'?<div className="empty-state compact"><ShieldCheck/><strong>Acesso restrito</strong><span>Seu perfil continua operacional, mas o histórico completo exige permissão de administrador.</span></div>:audit.length?<div className="table-wrap"><table><thead><tr><th>Data</th><th>Área</th><th>Ação</th><th>Motivo</th></tr></thead><tbody>{audit.map(item=><tr key={item.id}><td>{new Date(item.created_at).toLocaleString('pt-BR')}</td><td>{entityLabels[item.entity_type]??item.entity_type}</td><td>{item.action}</td><td>{item.reason||'—'}</td></tr>)}</tbody></table></div>:<div className="empty-state compact"><History/><strong>Nenhuma alteração registrada</strong></div>}</section>
 </Page>
}
