begin;

grant select on public.budget_versions, public.orders, public.order_items to authenticated;

create policy "budget version member read" on public.budget_versions
for select to authenticated
using (private.has_org_role(organization_id,array['admin','comercial','financeiro','operacao']::public.app_role[]));

create policy "order member read" on public.orders
for select to authenticated
using (private.has_org_role(organization_id,array['admin','comercial','compras','financeiro','operacao']::public.app_role[]));

create policy "order item member read" on public.order_items
for select to authenticated
using (private.has_org_role(organization_id,array['admin','comercial','compras','financeiro','operacao']::public.app_role[]));

create or replace function public.mark_budget_sent(org_id uuid, target_budget_id uuid)
returns public.budgets
language plpgsql
security definer
set search_path=''
as $$
declare
  target public.budgets;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  select * into target from public.budgets
  where id=target_budget_id and organization_id=org_id for update;
  if target.id is null then raise exception 'Budget not found' using errcode='P0002'; end if;
  if target.status <> 'draft' then raise exception 'Only drafts can be sent' using errcode='23514'; end if;
  if target.client_id is null then raise exception 'Client is required' using errcode='23514'; end if;
  if not exists(select 1 from public.budget_items where budget_id=target.id and organization_id=org_id and affects_total) then
    raise exception 'At least one principal item is required' using errcode='23514';
  end if;

  insert into public.budget_versions(organization_id,budget_id,revision,snapshot,created_by)
  select org_id,target.id,target.current_revision,
    jsonb_build_object('budget',to_jsonb(target),'items',coalesce(jsonb_agg(to_jsonb(i) order by i.position),'[]'::jsonb)),auth.uid()
  from public.budget_items i
  where i.budget_id=target.id and i.organization_id=org_id
  on conflict(budget_id,revision) do update set snapshot=excluded.snapshot;

  update public.budgets set status='sent' where id=target.id returning * into target;
  return target;
end;
$$;

create or replace function public.approve_budget_and_create_order(org_id uuid, target_budget_id uuid)
returns public.orders
language plpgsql
security definer
set search_path=''
as $$
declare
  target public.budgets;
  version_id uuid;
  next_number bigint;
  created public.orders;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  select * into target from public.budgets
  where id=target_budget_id and organization_id=org_id for update;
  if target.id is null then raise exception 'Budget not found' using errcode='P0002'; end if;

  select * into created from public.orders where budget_id=target.id and organization_id=org_id;
  if created.id is not null then return created; end if;
  if target.status <> 'sent' then raise exception 'Only sent budgets can be approved' using errcode='23514'; end if;
  if target.client_id is null then raise exception 'Client is required' using errcode='23514'; end if;

  select id into version_id from public.budget_versions
  where budget_id=target.id and revision=target.current_revision and organization_id=org_id;
  if version_id is null then raise exception 'Sent version not found' using errcode='23514'; end if;

  perform pg_advisory_xact_lock(hashtextextended('orders:'||org_id::text,0));
  select coalesce(max(number),0)+1 into next_number from public.orders where organization_id=org_id;

  insert into public.orders(organization_id,number,display_number,budget_id,budget_version_id,client_id,status,payment_terms,total,created_by)
  values(org_id,next_number,'PED-'||extract(year from current_date)::integer||'-'||lpad(next_number::text,6,'0'),target.id,version_id,target.client_id,'awaiting_finance',target.payment_terms,target.total,auth.uid())
  returning * into created;

  insert into public.order_items(organization_id,order_id,budget_item_id,status,snapshot)
  select org_id,created.id,i.id,'awaiting_finance',to_jsonb(i)
  from public.budget_items i
  where i.budget_id=target.id and i.organization_id=org_id and i.affects_total
  order by i.position;

  update public.budgets set status='approved' where id=target.id;
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,after_data)
  values(org_id,auth.uid(),'orders',created.id,'created_from_approved_budget',to_jsonb(created));
  return created;
end;
$$;

revoke all on function public.mark_budget_sent(uuid,uuid), public.approve_budget_and_create_order(uuid,uuid) from public,anon;
grant execute on function public.mark_budget_sent(uuid,uuid), public.approve_budget_and_create_order(uuid,uuid) to authenticated;

commit;
