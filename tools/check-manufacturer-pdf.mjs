import fs from 'node:fs';
import ts from 'typescript';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
const js=ts.transpileModule(fs.readFileSync('src/lib/manufacturerPdf.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {parseManufacturerText}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const doc=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(process.argv[2]))}).promise;
const pages=[];
for(let n=1;n<=doc.numPages;n++){
 const content=await (await doc.getPage(n)).getTextContent(),lines=new Map();
 for(const item of content.items.filter(x=>typeof x.str==='string'&&x.str.trim())){
  const y=Math.round(item.transform[5]),key=[...lines.keys()].find(k=>Math.abs(k-y)<=2)??y;
  lines.set(key,[...(lines.get(key)??[]),item]);
 }
 pages.push([...lines.entries()].sort((a,b)=>b[0]-a[0]).map(([,line])=>line.sort((a,b)=>a.transform[4]-b.transform[4]).map(x=>x.str).join(' ')).join('\n'));
}
console.log(JSON.stringify(parseManufacturerText(pages.join('\n')),null,2));
