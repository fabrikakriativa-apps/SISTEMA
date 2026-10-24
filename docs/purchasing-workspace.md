# Compras por item

- `PurchasingWorkspace` é a entrada principal de Compras, com duas abas: Necessidades por pedido; Compras e encomendas.
- Todos os itens são consultados diretamente, sem depender de composição de insumos no orçamento. Novos itens não recebem mais uma necessidade artificial pelo custo estimado total.
- `procurement_review` é independente de status operacional: a avaliar, necessita, sem compra, material disponível. Dispensa/estoque exige confirmação e encerra somente necessidades ainda não compradas. Registros existentes não são migrados ou apagados automaticamente.
- `manage_purchasing` usa requisição UUID estável para criação e idempotência em confirmação/recebimento. Implementação privilegiada permanece em `private`, com identidade e papel admin/compras validados. Não foram ampliadas permissões de escrita nas tabelas.
- Uma compra pode conter necessidades de vários pedidos, cada linha com seu `order_item_id`, quantidade e custo real. A criação reserva as necessidades; a confirmação gera um grupo financeiro e rateio por pedido. O vínculo de custo por item permanece em `purchase_items`. O rateio financeiro legado admite uma linha por pedido, por isso o item financeiro fica vazio quando há vários itens no mesmo pedido.
- Valores em centavos são distribuídos entre parcelas; a soma das linhas arredondadas é o total. "Já pago" registra quitação explícita e data. Receber não cria parcelas novamente.
- Compras sem pedido formal também usam um identificador interno CMP para rastreabilidade; não exigem número externo nem documento.
- PDF do fornecedor pode ser anexado à compra, sem leitura automática alterar valores ou pagamentos.
- Produção/entrega não são atualizadas pelas novas rotinas. "Compras concluídas" depende de todas as necessidades ativas recebidas.
- Compras antigas e seus documentos continuam acessíveis na conferência anterior. Cancelamento legado é bloqueado para compras novas agrupadas entre clientes, evitando cancelar necessidades de outro pedido incidentalmente. Compras com pagamento exigem estorno prévio; recebidas exigem fluxo de devolução existente.

## Verificação

Testes unitários de derivação e centavos; integração autenticada em transação com rollback: dois pedidos, rateio, confirmação e recebimento repetidos, compra de loja quitada, bloqueio de dispensa com compra vinculada, proteção de cancelamento agrupado e rejeição de outra organização. Comparação antes/depois de IDs/status/valores confirma preservação dos registros reais.
# Fluxo simplificado

- A aba por pedido abre os materiais de cada item em modal. A dispensa de compra é uma situação da linha; registros antigos de estoque são exibidos como Não necessita de compra, sem alteração dos dados anteriores.
- A aba Compras e encomendas é uma lista única de materiais: necessidades sem compra e linhas de compras existentes. Documentos antigos são acessíveis diretamente, sem tela de histórico separada.
- Registrar compra usa a ação transacional direct: cria registro interno e financeiro juntos, com pagamento/retirada explícitos. Registrar encomenda usa order, exige número do fornecedor e previsão, e mantém recebimento separado.
- supplier_due_date guarda a previsão sem deslocar vencimentos financeiros silenciosamente. Recebimento não recria contas. Custos continuam vinculados às linhas e itens de origem.
- A lista compartilhável agrupa descrição e unidade por fornecedor; o texto pode ser revisado e copiado. Não inclui clientes, pedidos, preços ou margens e não altera status. A divisão por item continua preservada no banco.


