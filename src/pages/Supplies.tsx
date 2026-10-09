import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Boxes, FileUp, Plus, Search, Upload, X } from 'lucide-react'
import { Page } from '../components/Page'
import { useCatalog } from '../lib/useCatalog'
import { money } from '../lib/format'
import { useToast } from '../components/ToastProvider'
import {useAccess} from '../components/AuthorizedAccess'
import {supabase} from '../lib/supabase'
import { previewSupplyImport, readSupplyWorkbook, type SupplyImportMode, type SupplyImportRow } from '../lib/supplyImport'
import {SortableHeader,type SortState} from '../components/SortableHeader'
import {supplyImportErrorMessage,supplyImportUpsertOptions} from '../lib/supplyImportPersistence'

type Supply={id:string;code:string;name:string;category:string;purchase_unit:string;usage_unit:string;current_cost:number;active:boolean;supplier_name?:string|null}
type SupplyForm={id?:string;code:string;name:string;category:string;purchase_unit:string;usage_unit:string;current_cost:number}
type PriceHistory={id:string;value:number;effective_at:string;source:string|null}
const empty:SupplyForm={code:'',name:'',category:'',purchase_unit:'un',usage_unit:'un',current_cost:0}
type ImportSource={rowNumber:number;values:Partial<Omit<Supply,'id'>>}
const chunks=<T,>(items:T[],size:number)=>Array.from({length:Math.ceil(items.length/size)},(_,index)=>items.slice(index*size,index*size+size))
export function Supplies(){
 const [page,setPage]=useState(0),[query,setQuery]=useState(''),[serverSort,setServerSort]=useState({order:'name',ascending:true})
 const catalog=useCatalog<Supply & {import_details?:Record<string,string|number>}>('supplies','id,code,name,category,purchase_unit,usage_unit,current_cost,active,supplier_name:import_details->>Fornecedor',{page,pageSize:50,search:query,...serverSort})
 const {items}=catalog
 const access=useAccess(),[search,setSearch]=useState(''),[sort,setSort]=useState<SortState<'code'|'name'|'category'|'purchase'|'usage'|'cost'|'status'>>({key:'name',direction:'asc'}),[open,setOpen]=useState(false),[form,setForm]=useState<SupplyForm>(empty),[changingStatus,setChangingStatus]=useState(''),[history,setHistory]=useState<PriceHistory[]>([]),[historyLoading,setHistoryLoading]=useState(false),[importOpen,setImportOpen]=useState(false),[importMode,setImportMode]=useState<SupplyImportMode>('merge'),[importRows,setImportRows]=useState<ImportSource[]>([]),[importFile,setImportFile]=useState(''),[importSheet,setImportSheet]=useState(''),[importing,setImporting]=useState(false);const {show}=useToast()
 const edit=(item?:Supply)=>{setForm(item?{id:item.id,code:item.code,name:item.name,category:item.category,purchase_unit:item.purchase_unit,usage_unit:item.usage_unit,current_cost:Number(item.current_cost)}:empty);setOpen(true)}
 useEffect(()=>{let cancelled=false;if(!open||!form.id||!supabase||!access){setHistory([]);setHistoryLoading(false);return}setHistoryLoading(true);void supabase.from('supply_price_history').select('id,value,effective_at,source').eq('organization_id',access.organizationId).eq('supply_id',form.id).order('effective_at',{ascending:false}).order('created_at',{ascending:false}).limit(20).then(({data})=>{if(!cancelled){setHistory((data??[]) as PriceHistory[]);setHistoryLoading(false)}},()=>{if(!cancelled)setHistoryLoading(false)});return()=>{cancelled=true}},[open,form.id,access?.organizationId])
 const save=async(e:FormEvent)=>{e.preventDefault();try{const{id,...payload}=form;const saved=id?await catalog.update(id,payload):await catalog.save(payload);if(saved){show(id?'Insumo atualizado.':'Insumo salvo.','success');setOpen(false);setForm(empty)}}catch(error){show(error instanceof Error?error.message:'Não foi possível salvar.','error')}}
 const changeStatus=async(item:Supply,active:boolean)=>{if(!supabase||!access||changingStatus||active===item.active)return;setChangingStatus(item.id);const {error}=await supabase.from('supplies').update({active}).eq('organization_id',access.organizationId).eq('id',item.id);if(error)show('Não foi possível alterar o status do insumo.','error');else{catalog.reload();show(`Insumo ${active?'ativado':'inativado'}.`,'success')}setChangingStatus('')}
 useEffect(()=>{const timer=setTimeout(()=>{setQuery(search);setPage(0)},300);return()=>clearTimeout(timer)},[search])
 useEffect(()=>{setServerSort({order:{code:'code',name:'name',category:'category',purchase:'purchase_unit',usage:'import_details->>Fornecedor',cost:'current_cost',status:'active'}[sort.key],ascending:sort.direction==='asc'});setPage(0)},[sort])
 const filtered=items
 const importCatalog=useCatalog<Supply & {import_details?:Record<string,string|number>}>('supplies','id,code,name,category,purchase_unit,usage_unit,current_cost,active,import_details',{enabled:importOpen})
 const [details,setDetails]=useState<Record<string,string|number>|null>(null)
 useEffect(()=>{setDetails(null);if(!open||!form.id||!supabase||!access)return;let active=true;void supabase.from('supplies').select('import_details').eq('organization_id',access.organizationId).eq('id',form.id).single().then(({data,error})=>{if(active){if(error)show('Não foi possível carregar os dados complementares.','error');else setDetails(data?.import_details??null)}});return()=>{active=false}},[open,form.id,access?.organizationId,show])
 const importPreview=useMemo<SupplyImportRow[]>(()=>previewSupplyImport(importRows,importCatalog.items,importMode),[importRows,importCatalog.items,importMode])
 const importCounts=useMemo(()=>({create:importPreview.filter(row=>row.action==='create').length,update:importPreview.filter(row=>row.action==='update').length,ignore:importPreview.filter(row=>row.action==='ignore').length,invalid:importPreview.filter(row=>row.action==='invalid').length}),[importPreview])
 const closeImport=()=>{if(importing)return;setImportOpen(false);setImportRows([]);setImportFile('');setImportSheet('');setImportMode('merge')}
 const readFile=async(event:ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{const parsed=readSupplyWorkbook(await file.arrayBuffer());if(parsed.error){show(parsed.error,'error');return}setImportRows(parsed.rows);setImportFile(file.name);setImportSheet('sheetName' in parsed?parsed.sheetName:'');if(!parsed.rows.length)show('A planilha não possui linhas preenchidas para importar.','error')}catch{show('Não foi possível ler esta planilha. Use um arquivo Excel ou CSV com cabeçalhos.','error')}}
 const applyImport=async()=>{if(!supabase||!access||importing)return;const applicable=importPreview.filter((row):row is SupplyImportRow&{result:NonNullable<SupplyImportRow['result']>}=>(row.action==='create'||row.action==='update')&&Boolean(row.result));if(!applicable.length){show('Não há linhas válidas para importar.','error');return}setImporting(true);let completed=0;try{const payloads=applicable.map(row=>({organization_id:access.organizationId,...row.result}));for(const batch of chunks(payloads,100)){const {error}=await supabase.from('supplies').upsert(batch,supplyImportUpsertOptions);if(error)throw error;completed+=batch.length}catalog.reload();setImportOpen(false);setImportRows([]);setImportFile('');setImportSheet('');show(`${importCounts.create} adicionados e ${importCounts.update} atualizados. Nenhum cadastro existente foi excluído.`,'success')}catch(error){catalog.reload();show(`Não foi possível concluir a importação: ${supplyImportErrorMessage(error)}${completed?` ${completed} linhas já foram gravadas. Você pode tentar novamente sem duplicar os códigos.`:''}`,'error')}finally{setImporting(false)}}
 return <Page title="Insumos e produtos" description="Materiais usados diretamente nos itens, compras e custos." action={<div className="page-actions">
<button className="button secondary" onClick={()=>setImportOpen(true)}>
<FileUp/>Importar planilha</button>
<button className="button primary" onClick={()=>edit()}>
<Plus/>Novo insumo</button>
</div>}>
  {catalog.loading && <p role="status">Carregando insumos…</p>}
  {catalog.error && <p role="alert">{catalog.error} <button className="button secondary" onClick={catalog.reload}>Tentar novamente</button>
</p>}
  <section className="panel">
<div className="toolbar">
<label className="search">
<Search/>
<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar código, nome ou categoria"/>
</label>
<span>{catalog.total} item(ns)</span>
</div>
<div className="table-wrap">
<table>
<thead>
<tr>
<SortableHeader label="Código" column="code" sort={sort} onChange={setSort}/>
<SortableHeader label="Insumo/produto" column="name" sort={sort} onChange={setSort}/>
<SortableHeader label="Categoria" column="category" sort={sort} onChange={setSort}/>
<SortableHeader label="Compra" column="purchase" sort={sort} onChange={setSort}/>
<SortableHeader label="Fornecedor" column="usage" sort={sort} onChange={setSort}/>
<SortableHeader label="Custo atual" column="cost" sort={sort} onChange={setSort}/>
<SortableHeader label="Status" column="status" sort={sort} onChange={setSort}/>
</tr>
</thead>
<tbody>{filtered.map(x=>
<tr className="clickable-row" key={x.id} onClick={()=>edit(x)}>
<td>{x.code}</td>
<td>
<strong>{x.name}</strong>
</td>
<td>{x.category||'—'}</td>
<td>{x.purchase_unit}</td>
<td>{x.supplier_name || 'A definir'}</td>
<td>
<strong>{money.format(x.current_cost)}</strong>
</td>
<td>
<select className="status-select" aria-label={`Status de ${x.name}`} disabled={changingStatus===x.id} value={x.active?'active':'inactive'} onClick={e=>e.stopPropagation()} onChange={e=>{e.stopPropagation();void changeStatus(x,e.target.value==='active')}}>
<option value="active">Ativo</option>
<option value="inactive">Inativo</option>
</select>
</td>
</tr>)}</tbody>
</table>{!filtered.length&&<div className="empty-state compact">
<Boxes/>
<strong>Nenhum insumo encontrado</strong>
</div>}</div>
<div className="toolbar"><button className="button secondary" disabled={catalog.loading||page===0} onClick={()=>setPage(page-1)}>Anterior</button><span>Página {page+1} de {Math.max(1,Math.ceil(catalog.total/50))}</span><button className="button secondary" disabled={catalog.loading||(page+1)*50>=catalog.total} onClick={()=>setPage(page+1)}>Próxima</button></div>
</section>
  {open&&<div className="dialog-backdrop">
<form className="dialog form-dialog" onSubmit={save}>
<header>
<div>
<span className="eyebrow">Cadastro utilizável</span>
<h2>{form.id?'Editar insumo ou produto':'Novo insumo ou produto'}</h2>
<p>{form.id?'O custo atualizado será usado nos novos itens; os custos já copiados para orçamentos permanecem preservados.':'Este registro poderá ser escolhido diretamente nos itens.'}</p>
</div>
<button type="button" className="icon-button" disabled={catalog.saving} onClick={()=>setOpen(false)}>
<X/>
</button>
</header>
<div className="form-grid">
{form.id&&details&&<details className="span-2"><summary>Dados complementares da planilha</summary><dl>{Object.entries(details).map(([key,value])=><div key={key}><dt><strong>{key}</strong></dt><dd style={{whiteSpace:'pre-wrap'}}>{String(value)}</dd></div>)}</dl><small>Confecção abrange todos os itens e subitens.</small></details>}
<label className="field">Código<input required value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/>
</label>
<label className="field span-2">Nome<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
</label>
<label className="field">Categoria<input value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/>
</label>
<label className="field">Unidade de compra<input value={form.purchase_unit} onChange={e=>setForm({...form,purchase_unit:e.target.value})}/>
</label>
<label className="field">Unidade de uso<input value={form.usage_unit} onChange={e=>setForm({...form,usage_unit:e.target.value})}/>
</label>
<label className="field">Custo atual<input type="number" min="0" step="0.01" value={form.current_cost} onChange={e=>setForm({...form,current_cost:Number(e.target.value)})}/>
</label>{form.id&&<section className="span-2 cost-history">
<strong>Histórico de custos</strong>
<small>Os valores aqui registrados servem para consulta; orçamentos existentes mantêm o custo que já receberam.</small>{historyLoading?<p>Carregando histórico…</p>:history.length?<div>{history.map(entry=>
<p key={entry.id}>
<b>{money.format(Number(entry.value))}</b> · {new Date(`${entry.effective_at}T12:00:00`).toLocaleDateString('pt-BR')}<span>{entry.source||'Alteração de custo'}</span>
</p>)}</div>:<p>Nenhuma alteração de custo registrada ainda.</p>}</section>}</div>
<footer>
<button type="button" className="button secondary" disabled={catalog.saving} onClick={()=>setOpen(false)}>Cancelar</button>
<button disabled={catalog.saving} className="button primary">{catalog.saving ? 'Salvando…' : form.id?'Salvar alteração':'Salvar insumo'}</button>
</footer>
</form>
</div>}
  {importOpen&&<div className="dialog-backdrop">
<section className="dialog import-dialog" role="dialog" aria-modal="true" aria-label="Importar insumos">
<header>
<div>
<span className="eyebrow">Carga em massa</span>
<h2>Importar insumos e produtos</h2>
<p>A prévia mostra o que será criado ou atualizado. A importação não exclui cadastros, pedidos ou custos já registrados.</p>
</div>
<button type="button" className="icon-button" disabled={importing} onClick={closeImport}>
<X/>
</button>
</header>
<div className="import-content">
{importCatalog.loading&&<p role="status">Carregando cadastros para conferir a importação…</p>}
{importCatalog.error&&<p role="alert">{importCatalog.error}<button className="button secondary" onClick={importCatalog.reload}>Tentar novamente</button></p>}
<label className="file-dropzone">
<Upload/>
<strong>{importFile||'Selecionar planilha'}</strong>
<small>{importFile?`Aba lida: ${importSheet||'principal'}`:'Excel (.xlsx, .xls) ou CSV. Aceita Código Interno, Preço de compra, Categoria, unidades e Status. Fornecedor, catálogo, medidas e vínculos também são preservados.'}</small>
<input type="file" accept=".xlsx,.xls,.csv" onChange={readFile}/>
</label>{importRows.length>0&&<>
<div className="import-mode">
<strong>Como tratar esta planilha</strong>
<label>
<input type="radio" name="import-mode" checked={importMode==='merge'} onChange={()=>setImportMode('merge')}/> Acrescentar novos e atualizar os existentes</label>
<label>
<input type="radio" name="import-mode" checked={importMode==='update-only'} onChange={()=>setImportMode('update-only')}/> Atualizar somente os já cadastrados</label>
<small>O código é a referência principal. Sem código, o sistema procura Nome + Categoria. Campos vazios não apagam dados já salvos.</small>
</div>
<div className="import-counts">
<span>
<b>{importCounts.create}</b> novos</span>
<span>
<b>{importCounts.update}</b> atualizações</span>
<span>
<b>{importCounts.ignore}</b> ignorados</span>
<span className={importCounts.invalid?'warning':''}>
<b>{importCounts.invalid}</b> com pendência</span>
</div>
<div className="table-wrap import-preview">
<table>
<thead>
<tr>
<th>Linha</th>
<th>Insumo/produto</th>
<th>Código</th>
<th>Ação</th>
</tr>
</thead>
<tbody>{importPreview.slice(0,100).map(row=>
<tr key={row.rowNumber}>
<td>{row.rowNumber}</td>
<td>{row.values.name||'—'}{row.message&&<small>{row.message}</small>}</td>
<td>{row.values.code||'—'}</td>
<td>
<span className={`badge ${row.action==='invalid'?'danger':row.action==='ignore'?'muted':row.action==='create'?'green':''}`}>{row.action==='create'?'Adicionar':row.action==='update'?'Atualizar':row.action==='ignore'?'Ignorar':'Conferir'}</span>
</td>
</tr>)}</tbody>
</table>{importPreview.length>100&&<p>Mostrando as primeiras 100 linhas de {importPreview.length}.</p>}</div>
</>}</div>
<footer>
<button type="button" className="button secondary" disabled={importing} onClick={closeImport}>Cancelar</button>
<button type="button" className="button primary" disabled={importing||importCatalog.loading||Boolean(importCatalog.error)||!importRows.length||importCounts.invalid>0} onClick={()=>void applyImport()}>{importing?'Importando…':`Confirmar importação${importCounts.create+importCounts.update?` (${importCounts.create+importCounts.update})`:''}`}</button>
</footer>
</section>
</div>}
 </Page>
 return <Page title="Insumos e produtos" description="Materiais usados diretamente nos itens, compras e custos." action={<button className="button primary" onClick={()=>edit()}>
<Plus/>Novo insumo</button>}>{catalog.loading && <p role="status">Carregando insumos…</p>}{catalog.error && <p role="alert">{catalog.error} <button className="button secondary" onClick={catalog.reload}>Tentar novamente</button>
</p>}<section className="panel">
<div className="toolbar">
<label className="search">
<Search/>
<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar código, nome ou categoria"/>
</label>
<span>{filtered.length} item(ns)</span>
</div>
<div className="table-wrap">
<table>
<thead>
<tr>
<th>Código</th>
<th>Insumo/produto</th>
<th>Categoria</th>
<th>Compra</th>
<th>Uso</th>
<th>Custo atual</th>
<th>Status</th>
</tr>
</thead>
<tbody>{filtered.map(x=>
<tr className="clickable-row" key={x.id} onClick={()=>edit(x)}>
<td>{x.code}</td>
<td>
<strong>{x.name}</strong>
</td>
<td>{x.category||'—'}</td>
<td>{x.purchase_unit}</td>
<td>{x.usage_unit}</td>
<td>
<strong>{money.format(x.current_cost)}</strong>
</td>
<td>
<select className="status-select" aria-label={`Status de ${x.name}`} disabled={changingStatus===x.id} value={x.active?'active':'inactive'} onClick={e=>e.stopPropagation()} onChange={e=>{e.stopPropagation();void changeStatus(x,e.target.value==='active')}}>
<option value="active">Ativo</option>
<option value="inactive">Inativo</option>
</select>
</td>
</tr>)}</tbody>
</table>{!filtered.length&&<div className="empty-state compact">
<Boxes/>
<strong>Nenhum insumo encontrado</strong>
</div>}</div>
</section>{open&&<div className="dialog-backdrop">
<form className="dialog form-dialog" onSubmit={save}>
<header>
<div>
<span className="eyebrow">Cadastro utilizável</span>
<h2>{form.id?'Editar insumo ou produto':'Novo insumo ou produto'}</h2>
<p>{form.id?'O custo atualizado será usado nos novos itens; os custos já copiados para orçamentos permanecem preservados.':'Este registro poderá ser escolhido diretamente nos itens.'}</p>
</div>
<button type="button" className="icon-button" disabled={catalog.saving} onClick={()=>setOpen(false)}>
<X/>
</button>
</header>
<div className="form-grid">
{form.id&&catalog.items.find(item=>item.id===form.id)?.import_details&&<details className="span-2"><summary>Dados complementares da planilha</summary><dl>{Object.entries(catalog.items.find(item=>item.id===form.id)!.import_details!).map(([key,value])=><div key={key}><dt><strong>{key}</strong></dt><dd style={{whiteSpace:'pre-wrap'}}>{String(value)}</dd></div>)}</dl><small>Confecção abrange todos os itens e subitens.</small></details>}
<label className="field">Código<input required value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/>
</label>
<label className="field span-2">Nome<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
</label>
<label className="field">Categoria<input value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/>
</label>
<label className="field">Unidade de compra<input value={form.purchase_unit} onChange={e=>setForm({...form,purchase_unit:e.target.value})}/>
</label>
<label className="field">Unidade de uso<input value={form.usage_unit} onChange={e=>setForm({...form,usage_unit:e.target.value})}/>
</label>
<label className="field">Custo atual<input type="number" min="0" step="0.01" value={form.current_cost} onChange={e=>setForm({...form,current_cost:Number(e.target.value)})}/>
</label>{form.id&&<section className="span-2 cost-history">
<strong>Histórico de custos</strong>
<small>Os valores aqui registrados servem para consulta; orçamentos existentes mantêm o custo que já receberam.</small>{historyLoading?<p>Carregando histórico…</p>:history.length?<div>{history.map(entry=>
<p key={entry.id}>
<b>{money.format(Number(entry.value))}</b> · {new Date(`${entry.effective_at}T12:00:00`).toLocaleDateString('pt-BR')}<span>{entry.source||'Alteração de custo'}</span>
</p>)}</div>:<p>Nenhuma alteração de custo registrada ainda.</p>}</section>}</div>
<footer>
<button type="button" className="button secondary" disabled={catalog.saving} onClick={()=>setOpen(false)}>Cancelar</button>
<button disabled={catalog.saving} className="button primary">{catalog.saving ? 'Salvando…' : form.id?'Salvar alteração':'Salvar insumo'}</button>
</footer>
</form>
</div>}</Page>
}
