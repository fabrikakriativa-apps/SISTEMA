# Ambiente de testes publicado

Este ambiente existe para testar o sistema novo sem alterar o CRM antigo nem o domínio `crm.fabrikakriativa.com.br`.

Quando o GitHub Pages estiver ativado, o endereço será:

`https://fabrikakriativa-apps.github.io/SISTEMA/`

## Preparação única

1. No repositório **SISTEMA**, abra **Settings → Pages** e escolha **GitHub Actions** como origem da publicação.
2. Em **Settings → Secrets and variables → Actions**, crie estes dois secrets:
   - `VITE_SUPABASE_URL`: URL do projeto Supabase SISTEMA.
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: chave publicável do mesmo projeto.
3. No Supabase do projeto SISTEMA, em **Authentication → URL Configuration**, inclua este endereço em **Redirect URLs**:
   - `https://fabrikakriativa-apps.github.io/SISTEMA/`
4. Mantenha o callback já usado pelo Google apontando para o Supabase. Não substitua o callback pelo endereço do GitHub Pages.

## Publicar uma versão para teste

No GitHub, abra **Actions → Publicar ambiente de testes → Run workflow**. O workflow é manual de propósito: uma versão só é publicada quando você decidir testar.

## Roteiro de validação

1. Entre com o Google autorizado.
2. Cadastre um cliente e um fornecedor.
3. Cadastre insumos com categorias como `Tecido`, `Espuma` e `Papel de parede`.
4. Crie um orçamento, inclua um item de cada tipo necessário e confira a busca de insumos por categoria.
5. Envie e aprove o orçamento; confira o pedido criado.
6. Crie uma compra, confirme um pedido de fornecedor e verifique as parcelas no Financeiro.
7. Crie um compromisso e sincronize a Agenda com o Google Calendar.

Use apenas dados de teste nessa etapa. A mudança para o domínio definitivo deve ocorrer somente após esse roteiro estar aprovado.
