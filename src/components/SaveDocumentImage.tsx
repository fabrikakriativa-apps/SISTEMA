import { useState } from 'react'
import { Copy, ImageDown } from 'lucide-react'
import { renderDocumentImage } from '../lib/documentImage'
import { useToast } from './ToastProvider'

export function SaveDocumentImage({number}:{number:string}) {
  const [busy,setBusy]=useState<'copy'|'save'|null>(null),{show}=useToast()
  const copy=async()=>{
    const node=document.querySelector<HTMLElement>('.preview-backdrop .client-document')
    if(!node||busy)return
    if(!navigator.clipboard?.write||typeof ClipboardItem==='undefined'){
      show('Este navegador não permite copiar imagens. Use Salvar imagem ou abra em um navegador compatível.','error');return
    }
    setBusy('copy')
    try{
      // Start clipboard.write during the click to preserve user activation.
      const image=renderDocumentImage(node)
      await navigator.clipboard.write([new ClipboardItem({'image/png':image})])
      show('Imagem copiada em alta resolução. Para preservar a nitidez no envio, prefira PDF ou envie o PNG como documento.','success')
    }catch{show('Não foi possível copiar a imagem. Verifique a permissão de área de transferência do navegador ou use Salvar imagem.','error')}
    finally{setBusy(null)}
  }
  const save=async()=>{
    const node=document.querySelector<HTMLElement>('.preview-backdrop .client-document')
    if(!node||busy)return
    setBusy('save')
    try{
      const blob=await renderDocumentImage(node)
      const url=URL.createObjectURL(blob)
      const link=document.createElement('a');link.download=`${number}.png`;link.href=url;link.click()
      window.setTimeout(()=>URL.revokeObjectURL(url),60000)
      show('PNG salvo em alta resolução. Envie como documento para evitar redução da imagem.','success')
    }catch{show('Não foi possível salvar a imagem. Tente novamente.','error')}
    finally{setBusy(null)}
  }
  return <><button className="button secondary" disabled={!!busy} onClick={()=>void copy()}><Copy/>{busy==='copy'?'Copiando imagem…':'Copiar imagem'}</button><button className="button secondary" disabled={!!busy} onClick={()=>void save()}><ImageDown/>{busy==='save'?'Gerando imagem…':'Salvar imagem'}</button></>
}

