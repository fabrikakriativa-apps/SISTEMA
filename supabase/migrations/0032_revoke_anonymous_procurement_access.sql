-- Necessidades de compra contêm dados comerciais e só podem ser consultadas
-- por integrantes autenticados da organização, conforme a política RLS criada
-- na migração 0024.
revoke all on table public.procurement_needs from public, anon;

-- Mantém apenas a leitura autenticada já protegida por RLS.
grant select on table public.procurement_needs to authenticated;
