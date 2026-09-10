-- O endereço usado na proposta pode divergir do cadastro sem alterar o cliente.
alter table public.budgets
  add column if not exists client_address text,
  add column if not exists client_address_edited boolean not null default false;

grant update(client_address,client_address_edited) on public.budgets to authenticated;

