begin;

grant insert(organization_id,name,document,email,phone,supplier_types,notes,active) on public.suppliers to authenticated;
grant update(name,document,email,phone,supplier_types,notes,active) on public.suppliers to authenticated;

create policy "supplier purchasing insert" on public.suppliers for insert to authenticated
with check(private.has_org_role(organization_id,array['admin','compras']::public.app_role[]));
create policy "supplier purchasing update" on public.suppliers for update to authenticated
using(private.has_org_role(organization_id,array['admin','compras']::public.app_role[]))
with check(private.has_org_role(organization_id,array['admin','compras']::public.app_role[]));

create or replace function private.guard_supplier() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id or new.created_at is distinct from old.created_at then raise exception 'Supplier identity cannot change' using errcode='23514'; end if;
  else new.created_at:=now(); end if;
  if length(btrim(new.name))=0 then raise exception 'Supplier name is required' using errcode='23514'; end if;
  new.name:=btrim(new.name);new.updated_at:=now();return new;
end; $$;
revoke all on function private.guard_supplier() from public,anon,authenticated;
create trigger suppliers_guard before insert or update on public.suppliers for each row execute function private.guard_supplier();

commit;
