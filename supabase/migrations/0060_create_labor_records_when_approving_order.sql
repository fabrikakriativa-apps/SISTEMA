-- Keep the operational and financial records in sync with each labor line
-- registered in the approved budget.
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

  insert into public.provider_assignments(
    organization_id, supplier_id, order_id, order_item_id, budget_item_id,
    description, planned_start, planned_end, labor_days, amount
  )
  select
    org_id, cl.supplier_id, created.id, oi.id, oi.budget_item_id,
    cl.description, cl.labor_start_date,
    case
      when cl.labor_start_date is null then null
      else cl.labor_start_date + ceil(cl.labor_days)::integer - 1
    end,
    cl.labor_days, cl.total_cost
  from public.order_items oi
  join public.item_cost_lines cl
    on cl.budget_item_id = oi.budget_item_id
   and cl.organization_id = oi.organization_id
  where oi.organization_id = org_id
    and oi.order_id = created.id
    and cl.kind = 'service'
    and cl.supplier_id is not null
    and cl.total_cost > 0;

  insert into public.payables(
    organization_id, order_id, budget_item_id, supplier_id, group_id,
    installment, installment_count, description, due_date, amount, paid_amount,
    status, payment_method, labor_days
  )
  select
    org_id, created.id, oi.budget_item_id, cl.supplier_id, gen_random_uuid(),
    1, 1, 'Mão de obra · ' || cl.description, cl.labor_start_date, cl.total_cost, 0,
    'open', null, cl.labor_days
  from public.order_items oi
  join public.item_cost_lines cl
    on cl.budget_item_id = oi.budget_item_id
   and cl.organization_id = oi.organization_id
  where oi.organization_id = org_id
    and oi.order_id = created.id
    and cl.kind = 'service'
    and cl.supplier_id is not null
    and cl.total_cost > 0;

  update public.budgets set status = 'approved' where id = target.id;
  insert into public.audit_log(organization_id, actor_id, entity_type, entity_id, action, after_data)
  values (org_id, auth.uid(), 'orders', created.id, 'created_from_approved_budget', to_jsonb(created));
  return created;
end;
$$;

revoke all on function public.approve_budget_and_create_order(uuid,uuid) from public, anon;
grant execute on function public.approve_budget_and_create_order(uuid,uuid) to authenticated;
