import { useState, type FormEvent } from 'react'
import { Plus, Search, UsersRound, X } from 'lucide-react'
import { Page } from '../components/Page'
import { useCatalog } from '../lib/useCatalog'
import { useToast } from '../components/ToastProvider'

type Client = { id:string; name:string; phone:string|null; city:string|null; client_type:string; master_client_id:string|null; archived_at:string|null }
type ClientForm={id?:string;name:string;phone:string;city:string;client_type:string}
const empty:ClientForm = { name:'', phone:'', city:'', client_type:'Cliente final' }

export function Clients() {
  const catalog = useCatalog<Client>('clients', 'id,name,phone,city,client_type,master_client_id,archived_at')
  const { items } = catalog
  const [search,setSearch]=useState(''), [open,setOpen]=useState(false), [form,setForm]=useState<ClientForm>(empty),[changingStatus,setChangingStatus]=useState('')
  const { show } = useToast()
  const save = async (event:FormEvent) => {
    event.preventDefault()
    try { const saved=form.id?await catalog.update(form.id,{name:form.name.trim(),phone:form.phone.trim()||null,city:form.city.trim()||null,client_type:form.client_type}):await catalog.save(form);if(saved) { show(form.id?'Cliente atualizado.':'Cliente salvo.','success');setForm(empty);setOpen(false) } }
    catch(error) { show(error instanceof Error ? error.message : 'Não foi possível salvar.','error') }
  }
  const edit=(item?:Client)=>{setForm(item?{id:item.id,name:item.name,phone:item.phone??'',city:item.city??'',client_type:item.client_type}:empty);setOpen(true)}
  const changeStatus=async(item:Client,active:boolean)=>{if(changingStatus||active===!item.archived_at)return;setChangingStatus(item.id);try{if(await catalog.update(item.id,{archived_at:active?null:new Date().toISOString()}))show(`Cliente ${active?'ativado':'inativado'}.`,'success')}catch(error){show(error instanceof Error?error.message:'Não foi possível alterar o status do cliente.','error')}finally{setChangingStatus('')}}
  const filtered=items.filter(x=>`${x.name} ${x.phone??''} ${x.city??''}`.toLowerCase().includes(search.toLowerCase()))
  return <Page title="Clientes" description="Clientes finais e parceiros/master, com vínculos explícitos." action={<button className="button primary" onClick={()=>edit()}><Plus/>Novo cliente</button>}>
    {catalog.loading && <p role="status">Carregando clientes…</p>}
    {catalog.saving && <p role="status">Salvando cliente…</p>}
    {catalog.error && <p role="alert">{catalog.error} <button className="button secondary" onClick={catalog.reload}>Tentar novamente</button></p>}
    <section className="panel"><div className="toolbar"><label className="search"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nome, telefone ou cidade"/></label><span>{filtered.length} cadastro(s)</span></div>
      <div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Tipo</th><th>Telefone</th><th>Cidade</th><th>Parceiro/master</th><th>Status</th></tr></thead><tbody>{filtered.map(item=><tr className="clickable-row" key={item.id} onClick={()=>edit(item)}><td><strong>{item.name}</strong></td><td><span className="badge">{item.client_type}</span></td><td>{item.phone||'—'}</td><td>{item.city||'—'}</td><td>{item.master_client_id?'Vinculado':'—'}</td><td><select className="status-select" aria-label={`Status de ${item.name}`} disabled={changingStatus===item.id} value={item.archived_at?'inactive':'active'} onClick={e=>e.stopPropagation()} onChange={e=>{e.stopPropagation();void changeStatus(item,e.target.value==='active')}}><option value="active">Ativo</option><option value="inactive">Inativo</option></select></td></tr>)}</tbody></table>{!filtered.length&&<div className="empty-state compact"><UsersRound/><strong>Nenhum cliente encontrado</strong></div>}</div>
    </section>{open&&<div className="dialog-backdrop"><form className="dialog form-dialog" onSubmit={save}><header><div><span className="eyebrow">Cadastro</span><h2>{form.id?'Editar cliente':'Novo cliente'}</h2><p>O parceiro/master será opcional e só aparecerá quando houver vínculo.</p></div><button type="button" className="icon-button" disabled={catalog.saving} onClick={()=>setOpen(false)}><X/></button></header><div className="form-grid"><label className="field span-2">Nome<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label className="field">Tipo<select value={form.client_type} onChange={e=>setForm({...form,client_type:e.target.value})}><option>Cliente final</option><option>Parceiro/master</option></select></label><label className="field">Telefone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label className="field span-2">Cidade/UF<input value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label></div><footer><button type="button" className="button secondary" disabled={catalog.saving} onClick={()=>setOpen(false)}>Cancelar</button><button disabled={catalog.saving} className="button primary">{catalog.saving ? 'Salvando…' : 'Salvar cliente'}</button></footer></form></div>}</Page>
}
