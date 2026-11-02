# Kiara — estado de integração em 02/11/2026

## Publicado
- SISTEMA no GitHub Pages: https://fabrikakriativa-apps.github.io/SISTEMA/
- Build de publicação validado em https://github.com/fabrikakriativa-apps/SISTEMA/actions/runs/41390698587
- Painel de conversas, indicadores, orientações, revisão de biblioteca e mensagens vinculadas ao Supabase SISTEMA.
- Consulta de retenção por conversa implementada em `/kiara/coach` no Worker de homologação.
- O frontend recebe `VITE_KIARA_COACH_URL=https://fabrika-atendimento-ia-homologacao.fabrikakriativa.workers.dev/kiara/coach`.
- Quando o endpoint informa `writable:false`, o botão de Segurar/Liberar permanece desabilitado, mesmo que a leitura seja válida.

## Homologação do Worker
- Worker: `fabrika-atendimento-ia-homologacao`, isolado do Worker comercial.
- Endpoint `GET /health`: confirma `status=ok`, `external_integrations=blocked`, `supabase_read=authenticated_only`.
- Endpoint `GET /kiara/coach?conversationId=<uuid>`: exige sessão Supabase válida e RLS, aceita apenas Origin da página do SISTEMA.
- `POST /kiara/coach`, `/webhook` e demais rotas de produção: bloqueados.
- Sem KV, Queue, segredo Meta/OpenAI, service role ou processamento de WhatsApp na homologação.
- Pipeline GitHub aprovou 31 testes locais e smoke test HTTPS de bloqueios de acesso: https://github.com/fabrikakriativa-apps/KIARA/actions/runs/41390468581
- Auditoria Cloudflare confirmou bindings existentes na produção `CONVERSAS` (KV) e `KIARA_QUEUE` (fila), e nenhuma dessas integrações no Worker isolado.

## Validação do banco
- RLS da organização permite perfil admin/comercial e nega usuário não autorizado.
- RPC de segurar, repetir e liberar resposta validada em transação com rollback, sem mudança persistente na conversa.

## Ainda não liberado — não declarar como concluído
1. Login **real pelo navegador** com usuário autorizado do SISTEMA e leitura do hold pela API pública. A validação anterior simulou contexto auth dentro de transação e usou mocks para JWT nas suítes Node.
2. Habilitação do comando de escrita `hold/release` no Worker comercial, com controle de falhas e verificação da fila real.
3. Integração de orientação privada no Worker comercial, usando as flags `KIARA_GUIDANCE_ENABLED` e `KIARA_HOLD_ENABLED` após versionamento/rollback.
4. Verificação ponta-a-ponta com o contato de teste do WhatsApp, após cópia de segurança de código e configurações de produção.
5. Auditoria da resposta gerada durante o intervalo entre a checagem de hold e o envio à Meta; a operação não é atomicamente cancelável nessa janela.
6. Aprovação visual final do painel e do avatar Kiara conforme a referência de design.

**O Worker comercial `fabrika-atendimento-ia` não foi modificado nesta entrega.**
**Manter Disable builds ativado no Worker comercial até concluir os itens acima.**
