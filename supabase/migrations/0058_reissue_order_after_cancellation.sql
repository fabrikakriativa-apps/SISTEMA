-- A cancelled order remains in the history, but must not block a new revision
-- of the same commercial proposal from generating a replacement order.
alter table public.orders drop constraint if exists orders_budget_id_key;

create unique index if not exists orders_one_active_per_budget_idx
  on public.orders (budget_id)
  where status <> 'cancelled';

create or replace function public.start_budget_revision_after_order_cancellation(
  org_id uuid,
  target_budget_id uuid
)
returns public.budgets
language plpgsql
security definer
set search_path=''
as $$
declare
  target public.budgets;
  updated public.budgets;
begin
  if auth.uid() is null
    or not private.has_org_role(org_id, array['admin','comercial']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  select * into target
  from public.budgets
  where id = target_budget_id and organization_id = org_id
  for update;

  if target.id is null then
    raise exception 'Budget not found' using errcode='P0002';
  end if;
  if target.document_type <> 'budget' or target.status <> 'approved' then
    raise exception 'Only approved budgets can start a replacement revision' using errcode='23514';
  end if;
  if not exists (
    select 1 from public.orders
    where organization_id = org_id
      and budget_id = target.id
      and status = 'cancelled'
  ) then
    raise exception 'No cancelled order found for this budget' using errcode='23514';
  end if;
  if exists (
    select 1 from public.orders
    where organization_id = org_id
      and budget_id = target.id
      and status <> 'cancelled'
  ) then
    raise exception 'An active order already exists for this budget' using errcode='23514';
  end if;

  update public.budgets
  set status = 'draft',
      current_revision = current_revision + 1,
      updated_at = now()
  where id = target.id
  returning * into updated;

  insert into public.audit_log(
    organization_id, actor_id, entity_type, entity_id, action,
    before_data, after_data, reason
  )
  values (
    org_id, auth.uid(), 'budgets', target.id,
    'replacement_revision_started_after_order_cancellation',
    to_jsonb(target), to_jsonb(updated),
    'Nova revisão criada após cancelamento do pedido'
  );

  return updated;
end;
$$;

create or replace function public.approve_budget_and_create_order(
  org_id uuid,
  target_budget_id uuid
)
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
  if auth.uid() is null
    or not private.has_org_role(org_id, array['admin','comercial']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  select * into target
  from public.budgets
  where id = target_budget_id and organization_id = org_id
  for update;
  if target.id is null then raise exception 'Budget not found' using errcode='P0002'; end if;

  select * into created
  from public.orders
  where budget_id = target.id
    and organization_id = org_id
    and status <> 'cancelled'
  order by created_at desc
  limit 1;
  if created.id is not null then return created; end if;

  if target.status <> 'sent' then
    raise exception 'Only sent budgets can be approved' using errcode='23514';
  end if;
  if target.client_id is null then raise exception 'Client is required' using errcode='23514'; end if;

  select id into version_id
  from public.budget_versions
  where budget_id = target.id
    and revision = target.current_revision
    and organization_id = org_id;
  if version_id is null then raise exception 'Sent version not found' using errcode='23514'; end if;

  perform pg_advisory_xact_lock(hashtextextended('orders:' || org_id::text, 0));
  select coalesce(max(number), 0) + 1 into next_number
  from public.orders where organization_id = org_id;

  insert into public.orders(
    organization_id, number, display_number, budget_id, budget_version_id,
    client_id, client_address, notes, status, payment_terms, total, created_by
  )
  values (
    org_id, next_number,
    'PED-' || extract(year from current_date)::integer || '-' || lpad(next_number::text, 6, '0'),
    target.id, version_id, target.client_id, target.client_address, target.notes,
    'awaiting_finance', target.payment_terms, target.total, auth.uid()
  )
  returning * into created;

  insert into public.order_items(organization_id, order_id, budget_item_id, status, snapshot)
  select org_id, created.id, i.id, 'awaiting_finance', to_jsonb(i)
  from public.budget_items i
  where i.budget_id = target.id
    and i.organization_id = org_id
    and i.affects_total
  order by i.position;

  update public.budgets set status = 'approved' where id = target.id;
  insert into public.audit_log(organization_id, actor_id, entity_type, entity_id, action, after_data)
  values (org_id, auth.uid(), 'orders', created.id, 'created_from_approved_budget', to_jsonb(created));
  return created;
end;
$$;

revoke all on function public.start_budget_revision_after_order_cancellation(uuid,uuid) from public, anon;
grant execute on function public.start_budget_revision_after_order_cancellation(uuid,uuid) to authenticated;
