# Ajuste de continuidade comercial da Kiara

O Worker deve considerar **todos os itens solicitados** dentro do atendimento, incluindo ambientes com medidas pendentes.

## Instruções do modelo
Adicionar ao bloco INSTRUCTIONS:
- Considere todo o histórico da conversa atual.
- Cada novo ambiente ou produto acrescenta um item, sem substituir os anteriores.
- Para cada item, mantenha produto, ambiente, finalidade, tecido/modelo, medidas e pendências.
- Ao responder "o que será orçado?", liste TODOS os itens, completos ou não.
- Não aplique medidas de um ambiente a outro; não invente preços nem afirme orçamento preparado.
- Se faltar dado, faça uma pergunta por vez.

## Recuperação do contexto
No processamento da fila sincronizada, além de pendingCustomerBatch, recuperar o histórico da mesma conversa em kiara_messages, limitado às 100 mensagens mais recentes. Ordenar cronologicamente, desconsiderar mensagens anteriores ao último comando /reiniciar teste e mapear incoming -> user e outgoing -> assistant. Verificar que o lote contém a mensagem atual, falhando sem enviar quando o registro estiver ausente.

Substituir o nextHistory montado apenas com KV e mensagem agregada pelo histórico completo do Supabase **quando KIARA_SYNC_ENABLED=true**. Manter KV como fallback quando sincronização está desligada.

## Verificação realizada
Mock de Worker: agrupamento sem duplicatas, pausa humana, reinício delimitando sessão, e novo pedido de cortina para sala após persiana para cozinha. O input enviado à IA contém ambos os ambientes e detalhes. O comportamento semântico da resposta ainda requer validação no WhatsApp real.
