begin;

grant select on public.budgets to authenticated;
grant update(client_id,recipient_client_id,status,valid_until,payment_terms,delivery_terms,notes,internal_notes,subtotal,discount,total) on public.budgets to authenticated;

create policy "budget member read" on public.budgets
for select to authenticated
using (private.has_org_role(organization_id,array['admin','comercial','financeiro','operacao']::public.app_role[]));

create policy "budget commercial update" on public.budgets
for update to authenticated
using (private.has_org_role(organization_id,array['admin','comercial']::public.app_role[]))
with check (private.has_org_role(organization_id,array['admin','comercial']::public.app_role[]));

create or replace function public.create_budget_draft(org_id uuid)
returns public.budgets
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_number bigint;
  created public.budgets;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(org_id::text, 0));
  select coalesce(max(number),0)+1 into next_number
  from public.budgets where organization_id=org_id;

  insert into public.budgets(
    organization_id,number,display_number,status,valid_until,payment_terms,delivery_terms,created_by
  ) values (
    org_id,
    next_number,
    'ORC-' || extract(year from current_date)::integer || '-' || lpad(next_number::text,6,'0'),
    'draft',
    current_date + 10,
    'Conforme disposto em cada item',
    'A definir',
    auth.uid()
  ) returning * into created;

  return created;
end;
$$;

revoke all on function public.create_budget_draft(uuid) from public,anon;
grant execute on function public.create_budget_draft(uuid) to authenticated;

create or replace function private.guard_budget()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.number is distinct from old.number
     or new.display_number is distinct from old.display_number
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Budget identity cannot change' using errcode='23514';
  end if;
  new.updated_at:=now();
  return new;
end;
$$;
revoke all on function private.guard_budget() from public,anon,authenticated;
create trigger budgets_guard before update on public.budgets
for each row execute function private.guard_budget();

commit;
