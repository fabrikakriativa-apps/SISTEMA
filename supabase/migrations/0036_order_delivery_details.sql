alter table public.orders
  add column if not exists client_address text;

-- Preserve the address used in each negotiation. Older orders receive the
-- budget address first, with the client record as a fallback.
update public.orders o
set client_address = coalesce(
  nullif(b.client_address, ''),
  nullif(concat_ws(' · ', c.address, c.city), '')
)
from public.budgets b
left join public.clients c on c.id = b.client_id
where o.budget_id = b.id
  and o.client_address is null;

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

  insert into public.orders(organization_id,number,display_number,budget_id,budget_version_id,client_id,client_address,status,payment_terms,total,created_by)
  values(org_id,next_number,'PED-'||extract(year from current_date)::integer||'-'||lpad(next_number::text,6,'0'),target.id,version_id,target.client_id,target.client_address,'awaiting_finance',target.payment_terms,target.total,auth.uid())
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

create or replace function public.set_order_delivery_details(
  org_id uuid,
  target_order_id uuid,
  new_client_address text,
  new_promised_date date
)
returns public.orders
language plpgsql
security definer
set search_path=''
as $$
declare target public.orders; updated public.orders;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial','operacao']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into target from public.orders where id=target_order_id and organization_id=org_id for update;
 if target.id is null then raise exception 'Order not found' using errcode='P0002'; end if;
 if target.status in ('completed','cancelled') then raise exception 'Closed order cannot be changed' using errcode='23514'; end if;
 if new_promised_date is null then raise exception 'Promised date is required' using errcode='23514'; end if;
 update public.orders
 set client_address = nullif(trim(coalesce(new_client_address,'')),''),
     promised_date = new_promised_date,
     updated_at = now()
 where id=target.id
 returning * into updated;
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data)
 values(org_id,auth.uid(),'orders',target.id,'delivery_details_updated',to_jsonb(target),to_jsonb(updated));
 return updated;
end;
$$;

revoke all on function public.approve_budget_and_create_order(uuid,uuid), public.set_order_delivery_details(uuid,uuid,text,date) from public,anon;
grant execute on function public.approve_budget_and_create_order(uuid,uuid), public.set_order_delivery_details(uuid,uuid,text,date) to authenticated;
