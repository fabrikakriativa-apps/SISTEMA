-- Existing RLS policies restrict writes to admin/compras in their organization.
-- No DELETE privileges, anonymous access, or policy changes are introduced.
grant insert, update on public.supplies to authenticated;
