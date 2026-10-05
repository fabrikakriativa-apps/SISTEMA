# Alterações aplicadas — 05/10/2026

Após autorização explícita do usuário, o SQL em `workflow-corrections.sql` foi aplicado ao projeto de produção `dpowbyexrcdcwwqysgzp`.

- Status do pedido passa a ser manual. Mantém os status atuais dos registros existentes; alterações automáticas posteriores de financeiro e compras não substituem a seleção do usuário. Cancelamento continua usando seu fluxo próprio.
- Revisão de especificações permite alterar apenas descrições e observações de orçamento aprovado. Preserva valores, cria histórico de versão e atualiza descrições dos itens do pedido vinculado. A revisão comercial de valores continua sendo uma ação distinta.
- Pré-orçamento pode ser enviado e retornar a rascunho; sua versão enviada fica preservada.
- Necessidades de compra podem ser criadas, editadas e retiradas da lista antes de gerar pedido ao fornecedor. Exclusão é lógica, com histórico. Pedidos ao fornecedor já criados permanecem protegidos.
- Entrega pode permanecer sem data definida. Observações são gravadas sem remover a indentação.

Verificação local: 70 testes passaram; compilação de produção passou; leitura do PDF compacto anexado reconheceu quatro itens e R$ 2.527,62; documentos de teste imprimiram em uma página e exportaram em PNG, com quebras e tabulação preservadas.

Validação no banco em transação revertida: status manual não substituído por atualização automática; seleção de produção aceita; revisão de especificações preserva total e aprovação, incrementa versão e sincroniza descrição no pedido; inclusão, edição e exclusão lógica de necessidade de compra aprovadas. Nenhuma alteração de teste foi mantida nos registros do usuário. Revisão de segurança executada; RPCs novas exigem autenticação, vínculo com organização e papel autorizado. Publicação e verificação online são registradas separadamente.
