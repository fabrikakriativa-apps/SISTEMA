import {describe,it,expect,vi} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
const state=vi.hoisted(()=>({index:0,seeds:new Map<number,unknown>()}))
vi.mock('react',async()=>{
 const actual=await vi.importActual<typeof import('react')>('react')
 return {...actual,useState:(initial:unknown)=>{const index=state.index++;return actual.useState(state.seeds.has(index)?state.seeds.get(index):initial)}}
})
vi.mock('../components/AuthorizedAccess',()=>({useAccess:()=>({organizationId:'org',role:'admin'})}))
vi.mock('../components/ToastProvider',()=>({useToast:()=>({show:vi.fn()})}))
vi.mock('../lib/supabase',()=>({supabase:null}))
import {PurchasingWorkspace} from './PurchasingWorkspace'
const item={id:'item',order_id:'o',status:'awaiting_purchase',procurement_review:'needed',snapshot:{description:'Persianas'},order:{display_number:'PED-TESTE',status:'awaiting_purchase',created_at:'2026-11-27',client:{name:'Cliente teste'}}}
const needs=[{id:'n1',order_item_id:'item',description:'Persiana esquerda',quantity:1,unit:'un',unit_cost:400,supply_id:null,deadline:null,supplier_name:'Fornecedor teste',status:'awaiting_purchase'},{id:'n2',order_item_id:'item',description:'Persiana direita',quantity:1,unit:'un',unit_cost:263,supply_id:null,deadline:null,supplier_name:'Fornecedor teste',status:'awaiting_purchase'}]
const purchase={id:'p',display_number:'CMP-TESTE',status:'awaiting_delivery',total:663,invoice_on_delivery:true,workspace_managed:true,formal_document:true,supplier_id:'v',external_number:'270683',payables:[],purchase_items:needs.map((n,i)=>({...n,id:'l'+i,procurement_need_id:n.id,status:'ordered',invoice_id:null,actual_total:null}))}
function render(seeds:[number,unknown][]=[]){
 state.index=0;state.seeds=new Map([[13,[item]],[14,needs],[15,[]],[16,[{id:'v',name:'Fornecedor teste'}]],[17,false],...seeds])
 return renderToStaticMarkup(<PurchasingWorkspace/>)
}
describe('compras práticas — tela',()=>{
 it('permite acrescentar itens ao pedido existente sem repetir o financeiro',()=>{
  const html=render([[15,[purchase]],[24,['n1','n2']],[28,{id:'new',kind:'create'}],[29,'v'],[43,'p']])
  expect(html).toContain('Vincular itens ao pedido')
  expect(html).toContain('as parcelas existentes serão preservadas')
  expect(html).not.toContain('Valor real total fechado com o fornecedor')
 })
 it('mostra uma encomenda única com dois produtos recolhidos e sem financeiro',()=>{
  const html=render([[15,[purchase]]])
  expect(html.match(/class="purchase-order"/g)).toHaveLength(1)
  expect(html).toContain('Pedido 270683');expect(html).toContain('Ver 2 itens e pedidos vinculados')
  expect(html).toContain('A faturar na entrega');expect(html).toContain('Ainda não faturado')
  expect(html).not.toContain('Informar faturamento</button>')
 })
 it('organiza previsão sem exigir parcelas ou forma de pagamento na entrega',()=>{
  const html=render([[24,['n1','n2']],[28,{id:'new',kind:'create'}],[6,'later'],[29,'v']])
  expect(html).toContain('Valor previsto da encomenda');expect(html).toContain('663,00')
  expect(html).not.toContain('Parcelas e vencimentos');expect(html).not.toContain('Forma de pagamento')
  expect(html).toContain('Registrar encomenda sem financeiro')
 })
 it('valor real global menor é independente da previsão e pago no ato não repete vencimentos',()=>{
  const html=render([[24,['n1','n2']],[28,{id:'new',kind:'create'}],[6,'now'],[29,'v'],[33,{n1:360,n2:238}]])
  expect(html).toContain('aria-label="Valor real total da compra"');expect(html).toContain('598,00')
  expect(html).toContain('Pagamento integral');expect(html).not.toContain('Parcelas e vencimentos')
  expect(html).not.toContain('Data do pagamento')
 })
 it('só oferece faturamento para os itens recebidos e ainda não faturados',()=>{
  const p={...purchase,status:'completed',purchase_items:purchase.purchase_items.map(l=>({...l,status:'received'}))}
  const html=render([[15,[p]],[28,{id:'p',kind:'invoice',purchase:p}],[7,['l0']],[29,'v']])
  expect(html).toContain('Informar faturamento');expect(html).toContain('Itens recebidos a faturar')
  expect(html).toContain('Gerar parcelas do faturamento')
  expect(html).toContain('1 itens · conferir')
 })
})
