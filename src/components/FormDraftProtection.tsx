import { useEffect,useState } from 'react'
import { useAccess } from './AuthorizedAccess'
import { readRecovery,writeRecovery,clearRecovery } from '../lib/recoveryDraft'

type Field=HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement
type Draft={savedAt:number;title:string;values:Record<string,string|boolean>}
const fields=()=>Array.from(document.querySelectorAll<Field>('.form-grid input,.form-grid textarea,.form-grid select,.dialog form input,.dialog form textarea,.dialog form select')).filter(x=>!x.disabled&&!('readOnly' in x&&x.readOnly)&&!['password','file','hidden','submit','button'].includes(x.type))
const label=(field:Field,index:number)=>`${field.closest('.dialog')?.querySelector('h2')?.textContent??''}:${field.getAttribute('aria-label')??field.name??''}:${field.closest('label')?.childNodes[0]?.textContent?.trim()??(field as HTMLInputElement).placeholder??''}:${index}`
export function FormDraftProtection(){
 const access=useAccess(),[available,setAvailable]=useState<Draft|null>(null),[key,setKey]=useState('')
 useEffect(()=>{
  if(!access)return
  const scope=()=>`${access.organizationId}:${access.userId}:form:${location.hash}`
  const refresh=()=>{const next=scope();setKey(next);const saved=readRecovery<Draft>(next);setAvailable(saved&&Date.now()-saved.savedAt<7*86400000?saved:null)}
  refresh();window.addEventListener('hashchange',refresh)
  const saved=()=>{clearRecovery(scope());setAvailable(null)}
  window.addEventListener('fabrika:save-success',saved)
  const capture=(event:Event)=>{
   if(!fields().includes(event.target as Field))return
   const values:Draft['values']={};fields().forEach((field,index)=>{values[label(field,index)]=field instanceof HTMLInputElement&&['checkbox','radio'].includes(field.type)?field.checked:field.value})
   const first=fields().find(x=>x.type==='text'||x.tagName==='TEXTAREA')
   writeRecovery(scope(),{savedAt:Date.now(),title:first?.value?.slice(0,70)??'Formulário',values})
  }
  document.addEventListener('input',capture);document.addEventListener('change',capture)
  return()=>{window.removeEventListener('hashchange',refresh);window.removeEventListener('fabrika:save-success',saved);document.removeEventListener('input',capture);document.removeEventListener('change',capture)}
 },[access])
 const restore=()=>{
  if(!available)return
  fields().forEach((field,index)=>{const value=available.values[label(field,index)];if(value===undefined)return
   const prototype=field instanceof HTMLSelectElement?HTMLSelectElement.prototype:field instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype
   if(typeof value==='boolean'){if((field as HTMLInputElement).checked!==value)field.click();return}
   const property='value'
   Object.getOwnPropertyDescriptor(prototype,property)?.set?.call(field,value)
   field.dispatchEvent(new Event(field instanceof HTMLSelectElement?'change':'input',{bubbles:true}))
  });setAvailable(null)
 }
 return available?<div className="draft-recovery-bar" role="status"><span>Preenchimento salvo neste navegador: {available.title}</span><button className="button secondary" onClick={restore}>Recuperar preenchimento</button><button className="button secondary" onClick={()=>{clearRecovery(key);setAvailable(null)}}>Descartar rascunho</button></div>:null
}
