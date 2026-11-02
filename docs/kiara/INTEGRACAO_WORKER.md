# Kiara — integração Worker / EasyCoexistence / SISTEMA

## Estado atual
- Tabelas `kiara_conversations`, `kiara_messages`, `kiara_operational_control`: migração aplicada ao projeto Supabase SISTEMA.
- Frontend da branch `feat/kiara-atendimento-ia-painel`: lê essas tabelas pela sessão Google e RLS da organização.
- `integrations/kiara/worker-sync.js`: módulo de integração servidor, **ainda não conectado ao Worker publicado**.
- Botões de pausa **permanecem desabilitados** até validação real de envio e bloqueio.

## Preparar o Worker com segurança

1. Fazer backup do código ATUAL do Worker `fabrika-atendimento-ia` (não utilizar uma versão antiga).
2. Criar secrets no Worker, nunca no site ou no GitHub:
   - `SUPABASE_URL` — URL do projeto SISTEMA
   - `SUPABASE_SERVICE_ROLE_KEY` — credencial secreta do projeto SISTEMA
   - `SUPABASE_ORGANIZATION_ID` — UUID da organização correta
3. Manter `KIARA_SYNC_ENABLED=false` até testar.
4. Incorporar o módulo à versão atual do Worker, preferencialmente via repositório e Wrangler. O editor de código simples do Cloudflare não resolve import de arquivo avulso de GitHub.
5. Apenas depois da validação dos eventos e autorização do usuário, ativar `KIARA_SYNC_ENABLED=true`.

## Pontos de integração (nesta ordem)

- Verificar assinatura HMAC original ou validar chave secreta da URL do EasyCoexistence **antes** de tratar o corpo.
- Para cada mensagem do cliente: `await recordIncoming(env, source, change.value, message)`; preservar o processamento da fila atual.
- Para `smb_message_echoes` do número coexistente: `await recordHumanEcho(env, source, change.value, echo)` e atualizar o controle KV legada de pausa.
- Depois de enviar a resposta da IA pela Cloud API com sucesso: obter `messages[0].id` do JSON da API e chamar `recordKiaraReply(env, source, numberId, waId, messageId, text)`.
- Antes de chamar a API para enviar resposta, conferir `await canKiaraSend(env, source, numberId, waId)`. Se falso, cancelar. Conferir uma segunda vez depois de gerar com OpenAI e imediatamente antes do envio.
- Em qualquer erro nessa leitura de autorização, **não enviar**. Não transformar falha de consulta em permissão para responder.

## Estados

- Desligamento geral: `kiara_operational_control.enabled=false`; Worker deve recusar novas respostas, inclusive da fila.
- Assumir: status da conversa `human`; Worker deve parar somente o contato correspondente.
- Aguardando humano: status `waiting_human`; Worker não responde automaticamente.
- Devolver à Kiara: status `ai`; Worker só pode responder quando o controle geral estiver `enabled=true`.
- *IMPORTANTE*: não executar reativação global sem validação completa da ponte de segurança.

## Dados de campanha
A referência de anúncio recebida em `message.referral` contém um identificador de anúncio (`source_id`). O nome do conjunto/região não é deduzido automaticamente do id. Sincronizar a hierarquia por API da Meta separadamente. A região segmentada não é a cidade real do cliente.

## Testes antes de habilitar botões
1. Mensagem recebida no segundo número aparece no painel (sem duplicação).
2. Mensagem enviada pela Kiara aparece identificada.
3. Resposta manual do WhatsApp Business aparece e muda status para humano.
4. Controle geral `enabled=false` bloqueia eventos já enfileirados.
5. Status individual `human` bloqueia apenas o respectivo contato.
6. Falha do Supabase bloqueia envio automático.
7. Retomar IA restaura somente a autorização apropriada, sem disparar resposta antiga.
8. Verificar respostas consecutivas e cálculo do tempo médio com histórico real.
9. Testar autenticação e RLS para usuário sem permissão comercial.
10. Não mudar a configuração de webhook ou número existente se a versão atual já estiver funcional.

## Limitações conhecidas
- Integração de mídia ainda não realizada.
- Sem eventos de histórico anteriores à implantação; não prometer espelhamento de conversas antigas.
- Somente `recordHumanEcho` com evento real de coexistência confirmado, não inferir formato.
- Supabase Service Role é de uso exclusivo servidor. Não incluir em `VITE_*` ou HTML.
