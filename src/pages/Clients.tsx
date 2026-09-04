import { useState, type FormEvent } from 'react'
import { Plus, Search, UsersRound, X } from 'lucide-react'
import { Page } from '../components/Page'
import { useCatalog } from '../lib/useCatalog'
import { useToast } from '../components/ToastProvider'

type Client = { id:string; name:string; phone:string|null; city:string|null; client_type:string; master_client_id:string|null }
const empty = { name:'', phone:'', city:'', client_type:'Cliente final' }

export function Clients() {
  const catalog = useCatalog<Client>('clients', 'id,name,phone,city,client_type,master_client_id')
  const { items } = catalog
  const [search,setSearch]=useState(''), [open,setOpen]=useState(false), [form,setForm]=useState(empty)
  const { show } = useToast()
  const save = async (event:FormEvent) => {
    event.preventDefault()
    try { if(await catalog.save(form)) { show('Cliente salvo.','success');setForm(empty);setOpen(false) } }
    catch(error) { show(error instanceof Error ? error.message : 'Não foi possível salvar.','error') }
  }
  const filtered=items.filter(x=>`${x.name} ${x.phone??''} ${x.city??''}`.toLowerCase().includes(search.toLowerCase()))
  return <Page title="Clientes" description="Clientes finais e parceiros/master, com vínculos explícitos." action={<button className="button primary" onClick={()=>setOpen(true)}><Plus/>Novo cliente</button>}>
    {catalog.loading && <p role="status">Carregando clientes…</p>}
    {catalog.saving && <p role="status">Salvando cliente…</p>}
    {catalog.error && <p role="alert">{catalog.error} <button className="button secondary" onClick={catalog.reload}>Tentar novamente</button></p>}
    <section className="panel"><div className="toolbar"><label className="search"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nome, telefone ou cidade"/></label><span>{filtered.length} cadastro(s)</span></div>
      <div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Tipo</th><th>Telefone</th><th>Cidade</th><th>Parceiro/master</th></tr></thead><tbody>{filtered.map(item=><tr key={item.id}><td><strong>{item.name}</strong></td><td><span className="badge">{item.client_type}</span></td><td>{item.phone||'—'}</td><td>{item.city||'—'}</td><td>{item.master_client_id?'Vinculado':'—'}</td></tr>)}</tbody></table>{!filtered.length&&<div className="empty-state compact"><UsersRound/><strong>Nenhum cliente encontrado</strong></div>}</div>
    </section>{open&&<div className="dialog-backdrop"><form className="dialog form-dialog" onSubmit={save}><header><div><span className="eyebrow">Cadastro</span><h2>Novo cliente</h2><p>O parceiro/master será opcional e só aparecerá quando houver vínculo.</p></div><button type="button" className="icon-button" disabled={catalog.saving} onClick={()=>setOpen(false)}><X/></button></header><div className="form-grid"><label className="field span-2">Nome<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label className="field">Tipo<select value={form.client_type} onChange={e=>setForm({...form,client_type:e.target.value})}><option>Cliente final</option><option>Parceiro/master</option></select></label><label className="field">Telefone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label className="field span-2">Cidade/UF<input value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label></div><footer><button type="button" className="button secondary" disabled={catalog.saving} onClick={()=>setOpen(false)}>Cancelar</button><button disabled={catalog.saving} className="button primary">{catalog.saving ? 'Salvando…' : 'Salvar cliente'}</button></footer></form></div>}</Page>
}
