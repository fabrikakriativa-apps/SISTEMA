# Novo CRM Fábrika Kriativa

Reconstrução independente do sistema anterior. O Google Sheets e o Apps Script não são utilizados como banco ou servidor.

## Estado: fundação em desenvolvimento, não usar em produção

Este repositório contém a prévia inicial, não um CRM concluído. A compilação foi validada, mas login, permissões e gravação no banco ainda não passaram por teste integrado. Orçamentos, pedidos, compras, financeiro e agenda possuem telas preliminares ou planejamento.

Repositório oficial desta reconstrução: https://github.com/fabrikakriativa-apps/SISTEMA

## O que já existe no código

- Estrutura responsiva do sistema.
- Login Google via Supabase Auth.
- Navegação simplificada, sem módulos separados de Produção e Entrega.
- Formulários iniciais de clientes e insumos; falta completar o vínculo de organização e validar gravação.
- Modelo relacional inicial para orçamentos, versões, itens, pedidos, compras, financeiro, agenda, anexos e auditoria.
- Segurança por organização com RLS.
- Armazenamento privado de PDFs e imagens.
- Mensagens e confirmações próprias do sistema.

## Executar localmente

1. Copie `.env.example` para `.env.local`.
2. Preencha a URL e a chave publicável do projeto Supabase.
3. Não aplique os arquivos SQL em produção: são rascunhos que precisam de revisão de permissões por perfil, integridade entre organizações e testes em banco isolado.
4. Ative o provedor Google no Supabase e registre a URL de retorno.
5. Execute `pnpm install` e `pnpm dev`.

Sem `.env.local`, a aplicação abre em modo de prévia e não grava dados.

## Regras previstas (ainda não implementadas integralmente)

- Orçamentos aprovados geram uma versão imutável usada pelo pedido.
- O pedido centraliza o andamento operacional; seus itens possuem status individuais.
- Insumos e serviços são linhas explícitas de custo do item.
- Compras e parcelas mantêm vínculo com a origem.
- PDFs serão sempre validados pelo usuário antes da gravação.
- Eventos são criados no CRM e enviados ao Google Calendar.
