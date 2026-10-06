import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from './ToastProvider'

export function RemoveAttachment({organizationId,id,name,onRemoved}:{organizationId:string;id:string;name:string;onRemoved:()=>void}) {
  const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),{show}=useToast()
  const remove=async()=>{
    if(!supabase||busy)return
    setBusy(true)
    const {error}=await supabase.rpc('remove_document_attachment',{org_id:organizationId,target_attachment_id:id})
    if(error)show('Não foi possível excluir o arquivo. Confira sua permissão e tente novamente.','error')
    else{onRemoved();show('Arquivo removido da tela. O histórico foi preservado.','success')}
    setBusy(false);setConfirm(false)
  }
  return <span className="attachment-remove">
    <button type="button" className="icon-button" aria-label={`Excluir ${name}`} title="Excluir arquivo" onClick={()=>setConfirm(true)} disabled={busy}><Trash2/></button>
    {confirm&&<span className="attachment-confirm" role="alert"><span>Excluir este arquivo?</span><button type="button" onClick={()=>void remove()} disabled={busy}>{busy?'Excluindo…':'Confirmar'}</button><button type="button" onClick={()=>setConfirm(false)}>Cancelar</button></span>}
  </span>
}
