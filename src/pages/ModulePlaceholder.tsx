import { CalendarDays, CircleDollarSign, Handshake, Settings, ShoppingCart } from 'lucide-react'
import type { ModuleKey } from '../domain'
import { Page } from '../components/Page'
const content:Partial<Record<ModuleKey,{title:string;description:string;detail:string;icon:typeof Settings}>>={
 prospeccao:{title:'Prospecção',description:'Oportunidades, parcerias e próximas ações comerciais.',detail:'Este módulo converterá oportunidades em clientes sem duplicar cadastros.',icon:Handshake},
 compras:{title:'Compras',description:'Necessidades originadas dos itens dos pedidos.',detail:'Compras poderão agrupar itens por fornecedor e gerar contas a pagar.',icon:ShoppingCart},
 financeiro:{title:'Gestão financeira',description:'Contas a receber, contas a pagar e fluxo de caixa.',detail:'Cada parcela manterá vínculo clicável com sua origem e seu grupo.',icon:CircleDollarSign},
 agenda:{title:'Agenda',description:'Compromissos vinculados a clientes, pedidos e itens.',detail:'Os eventos serão enviados ao Google Calendar para consulta pelo celular.',icon:CalendarDays},
 administracao:{title:'Administração',description:'Usuários, permissões, auditoria e recuperação.',detail:'Alterações sensíveis terão histórico, e os backups serão testados.',icon:Settings},
}
export function ModulePlaceholder({module}: {module:ModuleKey}){const item=content[module]??content.administracao!;return <Page title={item.title} description={item.description}><section className="panel"><div className="empty-state"><item.icon/><strong>Fundação prevista</strong><span>{item.detail}</span></div></section></Page>}
