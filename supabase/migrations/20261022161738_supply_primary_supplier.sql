-- Primary supplier uses the existing catalog RLS; no privileges are broadened.
alter table public.supplies add column primary_supplier_id uuid references public.suppliers(id);
create index supplies_primary_supplier_idx on public.supplies(primary_supplier_id) where primary_supplier_id is not null;
create function private.validate_supply_primary_supplier() returns trigger
language plpgsql security invoker set search_path='' as $$
declare supplier_name text;
begin
 if new.primary_supplier_id is not null then
  select s.name into supplier_name from public.suppliers s
   where s.id=new.primary_supplier_id and s.organization_id=new.organization_id
   and (s.active or (tg_op='UPDATE' and new.primary_supplier_id is not distinct from old.primary_supplier_id));
  if supplier_name is null then raise exception 'Fornecedor inválido ou inativo para esta empresa' using errcode='23514'; end if;
  new.import_details:=coalesce(new.import_details,'{}'::jsonb)||jsonb_build_object('Fornecedor',supplier_name);
 elsif tg_op='UPDATE' and old.primary_supplier_id is not null then
  new.import_details:=coalesce(new.import_details,'{}'::jsonb)-'Fornecedor';
 end if;
 return new;
end $$;
revoke all on function private.validate_supply_primary_supplier() from public,anon,authenticated;
create trigger supply_primary_supplier_guard before insert or update on public.supplies
for each row execute function private.validate_supply_primary_supplier();
