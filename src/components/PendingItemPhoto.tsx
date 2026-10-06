import {useEffect,useState} from 'react'
import {Trash2} from 'lucide-react'

export function PendingItemPhoto({file,disabled,onRemove}:{file:File;disabled:boolean;onRemove:()=>void}){
  const [url,setUrl]=useState('')
  useEffect(()=>{const preview=URL.createObjectURL(file);setUrl(preview);return()=>URL.revokeObjectURL(preview)},[file])
  return <div className="attachment-entry"><img src={url} alt={file.name} style={{width:72,height:64,objectFit:'cover',borderRadius:8}}/><span>{file.name}<small style={{display:'block'}}>Será anexada ao salvar o item</small></span><button type="button" className="button secondary compact-button" disabled={disabled} aria-label={`Remover ${file.name}`} onClick={onRemove}><Trash2/>Remover</button></div>
}
