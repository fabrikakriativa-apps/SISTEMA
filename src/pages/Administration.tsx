import {useCallback,useEffect,useMemo,useState} from 'react'
import {History,RefreshCw,ShieldCheck,UserRoundPlus} from 'lucide-react'
import {Page} from '../components/Page'
import {useAccess} from '../components/AuthorizedAccess'
import {supabase} from '../lib/supabase'
import {SortableHeader,compareValues,type SortState} from '../components/SortableHeader'

type Identity={organization:string;name:string;email:string}
type Audit={id:number;entity_type:string;action:string;reason:string|null;created_at:string}
type Member={user_id:string;role:string;active:boolean;profile:{full_name:string|null;email:string|null}|null}
const roleLabels:Record<string,string>={admin:'Administrador',comercial:'Comercial',compras:'Compras',financeiro:'Financeiro',operacao:'Operação'}
const entityLabels:Record<string,string>={clients:'Clientes',supplies:'Insumos',suppliers:'Fornecedores',budgets:'Orçamentos',orders:'Pedidos',purchases:'Compras',receivables:'Contas a receber',payables:'Contas a pagar',calendar_events:'Agenda'}

export function Administration(){
 const access=useAccess(),[identity,setIdentity]=useState<Identity>({organization:'—',name:'—',email:'—'}),[audit,setAudit]=useState<Audit[]>([]),[members,setMembers]=useState<Member[]>([]),[memberSort,setMemberSort]=useState<SortState<'user'|'role'|'status'>>({key:'user',direction:'asc'}),[auditSort,setAuditSort]=useState<SortState<'date'|'area'|'action'|'reason'>>({key:'date',direction:'desc'}),[email,setEmail]=useState(''),[role,setRole]=useState('comercial'),[saving,setSaving]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('')
 const load=useCallback(async()=>{if(!supabase||!access)return;setLoading(true);setError('');const [organization,profile,history,memberList]=await Promise.all([
  supabase.from('organizations').select('name').eq('id',access.organizationId).single(),
  supabase.from('profiles').select('full_name,email').eq('id',access.userId).single(),
  access.role==='admin'?supabase.from('audit_log').select('id,entity_type,action,reason,created_at').eq('organization_id',access.organizationId).order('created_at',{ascending:false}).limit(50):Promise.resolve({data:[],error:null}),
  access.role==='admin'?supabase.from('memberships').select('user_id,role,active,profile:profiles!memberships_user_id_fkey(full_name,email)').eq('organization_id',access.organizationId).order('role'):Promise.resolve({data:[],error:null})
 ]);if(organization.error||profile.error||history.error||memberList.error){setError('Não foi possível carregar os dados administrativos.');setLoading(false);return}setIdentity({organization:organization.data.name,name:profile.data.full_name||'Nome não informado',email:profile.data.email||'E-mail não informado'});setAudit((history.data??[]) as Audit[]);setMembers((memberList.data??[]) as unknown as Member[]);setLoading(false)},[access])
 const saveMember=async(targetEmail:string,targetRole:string,active:boolean)=>{if(!supabase||!access||saving)return;setSaving(true);const {error}=await supabase.rpc('manage_membership',{org_id:access.organizationId,target_email:targetEmail,new_role:targetRole,new_active:active});if(error)setError(error.code==='23503'?'Essa conta precisa entrar uma vez com o Google antes de ser autorizada.':error.code==='23514'?'Você não pode remover o próprio acesso administrativo.':'Não foi possível atualizar esse acesso.');else{setEmail('');setError('');await load()}setSaving(false)}
 useEffect(()=>{void load()},[load])
 const sortedMembers=useMemo(()=>[...members].sort((a,b)=>{const values={user:[a.profile?.full_name??a.profile?.email??'',b.profile?.full_name??b.profile?.email??''],role:[roleLabels[a.role]??a.role,roleLabels[b.role]??b.role],status:[a.active?'Ativo':'Inativo',b.active?'Ativo':'Inativo']}[memberSort.key];return compareValues(values[0],values[1])*(memberSort.direction==='asc'?1:-1)}),[members,memberSort])
 const sortedAudit=useMemo(()=>[...audit].sort((a,b)=>{const values={date:[a.created_at,b.created_at],area:[entityLabels[a.entity_type]??a.entity_type,entityLabels[b.entity_type]??b.entity_type],action:[a.action,b.action],reason:[a.reason??'',b.reason??'']}[auditSort.key];return compareValues(values[0],values[1])*(auditSort.direction==='asc'?1:-1)}),[audit,auditSort])
 return <Page title="Administração" description="Identidade da empresa, acesso atual e histórico de alterações." action={<button className="button secondary" disabled={loading} onClick={()=>void load()}>
<RefreshCw/>Atualizar</button>}>
  {error&&<p role="alert">{error}</p>}
  <section className="status-grid">
<article>
<span>Empresa</span>
<strong>{identity.organization}</strong>
</article>
<article>
<span>Usuário conectado</span>
<strong>{identity.name}</strong>
</article>
<article>
<span>Perfil de acesso</span>
<strong>{roleLabels[access?.role??'']??'—'}</strong>
</article>
<article>
<span>Sessão</span>
<strong>{access?'Protegida':'Indisponível'}</strong>
</article>
</section>
  <section className="panel">
<div className="panel-heading">
<div>
<ShieldCheck/>
<h2>Acesso atual</h2>
</div>
</div>
<div className="detail-grid">
<div>
<span>Nome</span>
<strong>{identity.name}</strong>
</div>
<div>
<span>E-mail</span>
<strong>{identity.email}</strong>
</div>
<div>
<span>Empresa</span>
<strong>{identity.organization}</strong>
</div>
<div>
<span>Permissão</span>
<strong>{roleLabels[access?.role??'']??'—'}</strong>
</div>
</div>
</section>
  {access?.role==='admin'&&<section className="panel">
<div className="panel-heading">
<div>
<UserRoundPlus/>
<h2>Usuários e permissões</h2>
</div>
<span>A conta precisa ter entrado uma vez com o Google</span>
</div>
<div className="access-form">
<label className="field">E-mail da conta Google<input type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="usuario@empresa.com"/>
</label>
<label className="field">Perfil<select value={role} onChange={event=>setRole(event.target.value)}>{Object.entries(roleLabels).map(([value,label])=>
<option value={value} key={value}>{label}</option>)}</select>
</label>
<button className="button primary" disabled={saving||!email.trim()} onClick={()=>void saveMember(email,role,true)}>Autorizar acesso</button>
</div>{members.length?<div className="table-wrap">
<table>
<thead>
<tr>
<SortableHeader label="Usuário" column="user" sort={memberSort} onChange={setMemberSort}/>
<SortableHeader label="Perfil" column="role" sort={memberSort} onChange={setMemberSort}/>
<SortableHeader label="Status" column="status" sort={memberSort} onChange={setMemberSort}/>
</tr>
</thead>
<tbody>{sortedMembers.map(member=>
<tr key={member.user_id}>
<td>
<strong>{member.profile?.full_name||'Nome não informado'}</strong>
<small className="table-subline">{member.profile?.email||'E-mail não informado'}</small>
</td>
<td>
<select className="status-select" aria-label={`Perfil de ${member.profile?.email}`} disabled={saving} value={member.role} onChange={event=>void saveMember(member.profile?.email??'',event.target.value,member.active)}>{Object.entries(roleLabels).map(([value,label])=>
<option value={value} key={value}>{label}</option>)}</select>
</td>
<td>
<select className="status-select" aria-label={`Status de acesso de ${member.profile?.email}`} disabled={saving} value={member.active?'active':'inactive'} onChange={event=>void saveMember(member.profile?.email??'',member.role,event.target.value==='active')}>
<option value="active">Ativo</option>
<option value="inactive">Inativo</option>
</select>
</td>
</tr>)}</tbody>
</table>
</div>:<div className="empty-state compact">
<UserRoundPlus/>
<strong>Nenhum usuário vinculado</strong>
</div>}</section>}
  <section className="panel">
<div className="panel-heading">
<div>
<History/>
<h2>Alterações recentes</h2>
</div>
<span>{access?.role==='admin'?'Últimos 50 registros':'Visível somente para administradores'}</span>
</div>{loading?<p className="panel-message">Carregando administração…</p>:access?.role!=='admin'?<div className="empty-state compact">
<ShieldCheck/>
<strong>Acesso restrito</strong>
<span>Seu perfil continua operacional, mas o histórico completo exige permissão de administrador.</span>
</div>:audit.length?<div className="table-wrap">
<table>
<thead>
<tr>
<SortableHeader label="Data" column="date" sort={auditSort} onChange={setAuditSort}/>
<SortableHeader label="Área" column="area" sort={auditSort} onChange={setAuditSort}/>
<SortableHeader label="Ação" column="action" sort={auditSort} onChange={setAuditSort}/>
<SortableHeader label="Motivo" column="reason" sort={auditSort} onChange={setAuditSort}/>
</tr>
</thead>
<tbody>{sortedAudit.map(item=>
<tr key={item.id}>
<td>{new Date(item.created_at).toLocaleString('pt-BR')}</td>
<td>{entityLabels[item.entity_type]??item.entity_type}</td>
<td>{item.action}</td>
<td>{item.reason||'—'}</td>
</tr>)}</tbody>
</table>
</div>:<div className="empty-state compact">
<History/>
<strong>Nenhuma alteração registrada</strong>
</div>}</section>
 </Page>
}
