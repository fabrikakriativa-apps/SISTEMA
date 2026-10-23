# Leads, clientes e follow-up

## Regras

- Nova oportunidade na Prospecção cria um contato técnico com situação Lead, reaproveitando o contato selecionado quando houver vínculo explícito.
- Clientes finais e parceiros/master continuam tipos independentes da situação comercial.
- Primeiro pedido não cancelado promove o mesmo contato a Cliente. Oportunidade vinculada fica Ganha e o retorno é encerrado. Perfil não é alterado.
- Cadastros anteriores sem compra comprovada permanecem identificados como Cadastro anterior; não foram convertidos em leads por suposição.
- Cadastro direto de Lead cria uma oportunidade Novo contato com os dados e data de entrada. Contatos criados pela Prospecção não geram cartão duplicado; parceiros e cadastros anteriores não são tratados como novos leads.
- Orçamento novo ou com contato selecionado vincula-se automaticamente quando houver exatamente uma oportunidade ativa desse contato na mesma organização. Vínculo existente é preservado; não há associação por nome.
- Com mais de uma oportunidade ativa, o orçamento mostra a escolha explícita. Orçamentos anteriores sem vínculo podem ser associados nesse mesmo campo, sem inferir histórico automaticamente.
- Documentos vinculados atualizam preparação/envio e pedidos confirmados mantêm o vínculo e promovem o contato a Cliente, sem alterar perfil.
- Novas oportunidades de clientes com compra anterior à entrada informada são recompra. A origem de aquisição da oportunidade inicial é preservada ao ganhar.
- Primeiro retorno: 1 dia corrido. Retorno após contato/proposta: 3 dias corridos. Administradores podem mudar os prazos para novos agendamentos. Agenda futura explícita é preservada no envio da proposta.
- Contato é registrado manualmente sem integração de mensagens. Saídas contam como tentativas; entradas e saídas com resposta contam como respostas. Eventos de sistema não entram nesses contadores.
- Histórico é aditivo, sem permissão de exclusão para usuários. Registros têm chave idempotente para evitar duplicação após falha de rede.
- Cancelamento de pedido não apaga histórico nem rebaixa cliente automaticamente. Não há disparo automático de mensagem nem inferência de perfil/perda por silêncio.

## Verificação realizada

- Fluxo transacional autenticado: oportunidade, contato Lead, primeiro retorno, tentativa, resposta, repetição idempotente, orçamento, envio, aprovação, mesmo contato Cliente, fase Ganho, agenda encerrada, perfil preservado. Todos os dados sintéticos foram revertidos.
- RLS ativa nas novas tabelas; acesso cruzado entre organizações e chamadas anônimas recusados; exclusão de atividades não concedida.
- Impressões dos nomes/IDs dos 500 contatos e dos status/valores dos 678 orçamentos e 310 pedidos mantidas após a migração e os testes. Classificação de 215 compradores comprovados e preservação de 285 cadastros sem compra comprovada.
- Funções privilegiadas internas ficam no schema privado; diretório público usa wrapper invoker e autorização por organização.

## Limites intencionais

- Não é possível detectar uma resposta real no WhatsApp/e-mail sem integração. A pessoa registra o contato ocorrido.
- Não foram inventados contatos antigos, datas de chegada ou contadores históricos.
- Agenda de follow-up é interna à Prospecção; não envia notificações externas nem altera Google Calendar.

