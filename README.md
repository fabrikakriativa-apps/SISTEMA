# Sistema Fábrika Kriativa

Novo sistema de gestão da Fábrika Kriativa, independente do CRM legado. O banco, a autenticação e os documentos privados utilizam Supabase; Google Sheets e Apps Script não fazem parte desta aplicação.

Repositório oficial: https://github.com/fabrikakriativa-apps/SISTEMA

## Estado atual

A aplicação já possui fluxo integrado e testado para:

- login Google e autorização por empresa e perfil;
- prospecção B2B com valor estimado opcional;
- clientes finais e parceiros/master;
- fornecedores, insumos e composição real de custos;
- orçamentos com rascunho automático, revisões, PDF e versão para o cliente;
- importação conferida de PDFs de Cortina e Persiana;
- aprovação do orçamento e geração do pedido;
- andamento operacional dentro do pedido, sem módulos separados de Produção e Entrega;
- compras agrupadas, leitura do pedido do fornecedor e validação dos itens;
- contas a receber e a pagar, com parcelas individuais ou em grupo;
- cancelamentos e estornos com propagação e auditoria;
- agenda operacional e sincronização com Google Calendar;
- administração de usuários, perfis e histórico de alterações.

O banco autorizado é exclusivamente o projeto Supabase `dpowbyexrcdcwwqysgzp`, da organização `xhozxulkprvjzchnknfv`. Não utilizar projetos do CRM anterior.

## Executar localmente

1. Copie `.env.example` para `.env.local`.
2. Preencha a URL e a chave publicável do projeto Supabase correto.
3. Execute `pnpm install`.
4. Execute `pnpm dev`.

Sem as variáveis do Supabase, a aplicação abre somente a visualização estrutural e não grava dados.

## Verificação

- `pnpm test`: executa os testes automatizados.
- `pnpm build`: valida os tipos e gera a versão de produção.

O GitHub executa as duas verificações automaticamente em pushes e pull requests direcionados à branch `main`.

## Banco de dados

As alterações ficam em `supabase/migrations` e devem ser aplicadas em ordem. As políticas RLS isolam os dados por organização e as funções sensíveis conferem identidade e perfil no servidor. Nunca exponha uma chave `service_role` no navegador.

## Publicação

A compilação está pronta para hospedagem estática. Antes do primeiro deploy público ainda é necessário escolher o provedor, configurar nele as duas variáveis `VITE_SUPABASE_*` e registrar a URL definitiva nos retornos autorizados do Supabase e do Google OAuth.
