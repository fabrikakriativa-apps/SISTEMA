import { useState } from 'react'
import { ImageDown } from 'lucide-react'
import { toPng } from 'html-to-image'
import { useToast } from './ToastProvider'

export function SaveDocumentImage({number}:{number:string}) {
  const [busy,setBusy]=useState(false),{show}=useToast()
  const save=async()=>{
    const node=document.querySelector<HTMLElement>('.preview-backdrop .client-document')
    if(!node||busy)return
    setBusy(true)
    try{
      await document.fonts.ready
      const url=await toPng(node,{pixelRatio:2,backgroundColor:'#ffffff',cacheBust:true})
      const link=document.createElement('a');link.download=`${number}.png`;link.href=url;link.click()
    }catch{show('Não foi possível salvar a imagem. Tente novamente.','error')}
    finally{setBusy(false)}
  }
  return <button className="button secondary" disabled={busy} onClick={()=>void save()}><ImageDown/>{busy?'Gerando imagem…':'Salvar imagem'}</button>
}
