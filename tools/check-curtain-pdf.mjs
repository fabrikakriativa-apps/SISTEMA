import { readFile } from 'node:fs/promises'
import { parseManufacturerText } from '../src/lib/manufacturerPdf.ts'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
const pdf=await pdfjs.getDocument({data:new Uint8Array(await readFile(process.argv[2])),useSystemFonts:true}).promise
const pages=[]
for(let n=1;n<=pdf.numPages;n++){
 const content=await (await pdf.getPage(n)).getTextContent(),lines=new Map()
 for(const item of content.items){if(!item.str?.trim())continue;const y=Math.round(item.transform[5]);const key=[...lines.keys()].find(k=>Math.abs(k-y)<=2)??y;lines.set(key,[...(lines.get(key)??[]),item])}
 pages.push([...lines].sort((a,b)=>b[0]-a[0]).map(([,line])=>line.sort((a,b)=>a.transform[4]-b.transform[4]).map(x=>x.str).join(' ')).join('\n'))
}
const result=parseManufacturerText(pages.join('\n'))
console.log(JSON.stringify(result,null,2))
if(result.items.length!==4||Math.abs(result.items.reduce((s,x)=>s+x.value,0)-2527.62)>.001)throw new Error('Expected four items totaling 2527.62')
await pdf.destroy()
