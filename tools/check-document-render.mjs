import { readFile,mkdir,writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const { chromium }=await import(pathToFileURL(process.argv[2]).href)
const server=await createServer({server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,include:[]},ssr:{external:['react','react-dom','lucide-react','html-to-image']},appType:'custom'})
const {OrderPreview}=await server.ssrLoadModule('/src/components/OrderPreview.tsx')
const {BudgetPreview}=await server.ssrLoadModule('/src/components/BudgetPreview.tsx')
const {ToastProvider}=await server.ssrLoadModule('/src/components/ToastProvider.tsx')
const css=await Promise.all(['src/styles.css','src/pages/Orders.css','src/pages/Budgets.css'].map(x=>readFile(x,'utf8')))
const order={display_number:'PED-2026-000122',created_at:'2026-10-05',payment_terms:'PIX',promised_date:'2026-11-05',client_address:'Rua de teste, 123 · São Paulo/SP',notes:'TECIDO ESCOLHIDO: DUNAS OFF-WHITE (01)\n\tFORMA DE PAGAMENTO: PIX\nDADOS PARA PAGAMENTO: CNPJ 39.510.084/0001-49\n\nCONDIÇÕES GERAIS\nAntes da aprovação, confira as medidas e os tecidos.',total:1400,client:{name:'WILSON KAMIYA',document:'123.456.789-00',address:null,city:null},order_items:[{id:'1',snapshot:{description:'Banquetas – troca de tecido e espuma',quantity:2,sale_total:500}},{id:'2',snapshot:{description:'Troca de tampo de cadeira',quantity:2,sale_total:300}},{id:'3',snapshot:{description:'Reforma de cadeiras – troca de tecido e espuma',quantity:4,sale_total:600}}],receivables:[]}
await mkdir('tmp/document-check',{recursive:true})
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})
const page=await browser.newPage({viewport:{width:1200,height:1100}})
for(const [name,component] of [['pedido',React.createElement(OrderPreview,{order,onClose:()=>{}})],['orcamento',React.createElement(BudgetPreview,{budget:{...order,current_revision:1,valid_until:'2026-10-15',delivery_terms:'30 dias',subtotal:1400,discount:0},items:order.order_items.map(x=>({id:x.id,description:x.snapshot.description,environment:null,quantity:x.snapshot.quantity,sale_total:x.snapshot.sale_total,affects_total:true,family:null})),paymentOptions:{},clientName:'WILSON KAMIYA',clientAddress:order.client_address,onClose:()=>{}})]]){
 const html=renderToStaticMarkup(React.createElement(ToastProvider,null,component))
 await page.setContent(`<html><head><style>${css.join('\n')}</style></head><body><div id="root"><div class="app-shell"><aside class="sidebar" style="height:2000px">Menu</aside><main class="main-content"><div class="page"><header class="page-header"><h1>Pedido</h1></header>${html}<section style="height:2000px">Hidden underlying page</section></div></main></div></div></body></html>`)
 await page.locator('.client-document').screenshot({path:resolve(`tmp/document-check/${name}.png`)})
 await page.addScriptTag({path:resolve('node_modules/html-to-image/dist/html-to-image.js')})
 const exported=await page.evaluate(()=>window.htmlToImage.toPng(document.querySelector('.client-document'),{pixelRatio:2,backgroundColor:'#fff'}))
 await writeFile(resolve(`tmp/document-check/${name}-export.png`),Buffer.from(exported.split(',')[1],'base64'))
 if(exported.length<10000)throw new Error('Exported image is unexpectedly empty')
 const whiteSpace=await page.locator('.client-document footer p').first().evaluate(x=>getComputedStyle(x).whiteSpace)
 if(whiteSpace!=='pre-wrap')throw new Error('Line breaks not preserved')
 await page.pdf({path:resolve(`tmp/document-check/${name}.pdf`),preferCSSPageSize:true,printBackground:true})
 console.log(`${name}: printed and rendered, notes ${whiteSpace}`)
}
await browser.close();await server.close()
