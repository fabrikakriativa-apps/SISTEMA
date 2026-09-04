type TextItem={str:string;transform:number[];width:number}

export async function extractPdfText(file:File) {
  const pdfjs=await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString()
  const bytes=new Uint8Array(await file.arrayBuffer())
  const document=await pdfjs.getDocument({data:bytes}).promise
  const pages:string[]=[]
  for(let pageNumber=1;pageNumber<=document.numPages;pageNumber++){
    const page=await document.getPage(pageNumber)
    const content=await page.getTextContent()
    const items=(content.items as TextItem[]).filter(item=>typeof item.str==='string'&&item.str.trim())
    const lines=new Map<number,TextItem[]>()
    for(const item of items){
      const y=Math.round(item.transform[5])
      const existing=[...lines.keys()].find(key=>Math.abs(key-y)<=2)??y
      lines.set(existing,[...(lines.get(existing)??[]),item])
    }
    pages.push([...lines.entries()].sort((a,b)=>b[0]-a[0]).map(([,line])=>line.sort((a,b)=>a.transform[4]-b.transform[4]).map(item=>item.str).join(' ')).join('\n'))
  }
  return pages.join('\n')
}
