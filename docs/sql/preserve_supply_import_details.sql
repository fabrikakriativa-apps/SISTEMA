-- Applied through Supabase migration preserve_supply_import_details.
alter table public.supplies add column if not exists import_details jsonb not null default '{}'::jsonb;
