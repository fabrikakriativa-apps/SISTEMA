begin;

alter table public.item_cost_lines
  add column if not exists labor_days numeric(8,2),
  add column if not exists labor_start_date date;

alter table public.payables
  add column if not exists supplier_id uuid references public.suppliers(id),
  add column if not exists budget_item_id uuid references public.budget_items(id),
  add column if not exists labor_days numeric(8,2);

create table if not exists public.provider_assignments(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  supplier_id uuid not null references public.suppliers(id),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  budget_item_id uuid not null references public.budget_items(id),
  description text not null,
  planned_start date,
  planned_end date,
  labor_days numeric(8,2) not null check(labor_days>0),
  amount numeric(14,2) not null check(amount>=0),
  status text not null default 'planned' check(status in ('planned','in_progress','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.provider_assignments enable row level security;
grant select on public.provider_assignments to authenticated;
create policy "provider assignment member read" on public.provider_assignments for select to authenticated
using((select private.has_org_role(organization_id,array['admin','comercial','financeiro','operacao']::public.app_role[])));
create index if not exists provider_assignments_org_provider_date_idx on public.provider_assignments(organization_id,supplier_id,planned_start) where status<>'cancelled';
create index if not exists payables_org_order_idx on public.payables(organization_id,order_id) where status<>'cancelled';

create or replace function public.replace_budget_item_cost_lines(org_id uuid,target_budget_item_id uuid,new_lines jsonb)
returns public.budget_items language plpgsql security definer set search_path='' as $$
declare target public.budget_items; line jsonb; updated public.budget_items; line_kind text; line_supplier uuid;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  select i.* into target from public.budget_items i join public.budgets b on b.id=i.budget_id and b.organization_id=i.organization_id where i.id=target_budget_item_id and i.organization_id=org_id and b.status='draft' for update;
  if target.id is null then raise exception 'Draft item not found' using errcode='P0002'; end if;
  if jsonb_typeof(coalesce(new_lines,'[]'::jsonb))<>'array' then raise exception 'Invalid cost lines' using errcode='23514'; end if;
  delete from public.item_cost_lines where organization_id=org_id and budget_item_id=target.id;
  for line in select value from jsonb_array_elements(coalesce(new_lines,'[]'::jsonb)) loop
    line_kind:=coalesce(nullif(line->>'kind',''),'other'); line_supplier:=nullif(line->>'supplier_id','')::uuid;
    if coalesce((line->>'quantity')::numeric,0)<=0 or coalesce((line->>'unit_cost')::numeric,-1)<0 then raise exception 'Invalid cost value' using errcode='23514'; end if;
    if nullif(line->>'supply_id','') is not null and not exists(select 1 from public.supplies s where s.id=(line->>'supply_id')::uuid and s.organization_id=org_id and s.active) then raise exception 'Invalid supply' using errcode='23514'; end if;
    if line_supplier is not null and not exists(select 1 from public.suppliers s where s.id=line_supplier and s.organization_id=org_id and s.active) then raise exception 'Invalid supplier' using errcode='23514'; end if;
    if line_kind='service' and (line_supplier is null or coalesce((line->>'labor_days')::numeric,0)<=0) then raise exception 'Labor requires provider and days' using errcode='23514'; end if;
    insert into public.item_cost_lines(organization_id,budget_item_id,kind,supply_id,supplier_id,description,quantity,unit,unit_cost,notes,labor_days,labor_start_date)
    values(org_id,target.id,line_kind,nullif(line->>'supply_id','')::uuid,line_supplier,coalesce(nullif(btrim(line->>'description'),''),'Custo'),(line->>'quantity')::numeric,coalesce(nullif(line->>'unit',''),'un'),(line->>'unit_cost')::numeric,nullif(btrim(line->>'notes'),''),case when line_kind='service' then (line->>'labor_days')::numeric else null end,case when line_kind='service' then nullif(line->>'labor_start_date','')::date else null end);
  end loop;
  update public.budget_items set cost_total=coalesce((select round(sum(total_cost),2) from public.item_cost_lines where organization_id=org_id and budget_item_id=target.id),0),updated_at=now() where id=target.id returning * into updated;
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data) values(org_id,auth.uid(),'budget_items',target.id,'cost_composition_replaced',jsonb_build_object('cost_total',target.cost_total),jsonb_build_object('cost_total',updated.cost_total,'lines',new_lines));
  return updated;
end; $$;

create or replace function public.approve_budget_and_create_order(org_id uuid,target_budget_id uuid)
returns public.orders language plpgsql security definer set search_path='' as $$
declare target public.budgets; version_id uuid; next_number bigint; created public.orders;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into target from public.budgets where id=target_budget_id and organization_id=org_id for update;
  if target.id is null then raise exception 'Budget not found' using errcode='P0002'; end if;
  select * into created from public.orders where budget_id=target.id and organization_id=org_id;
  if created.id is not null then return created; end if;
  if target.status <> 'sent' then raise exception 'Only sent budgets can be approved' using errcode='23514'; end if;
  if target.client_id is null then raise exception 'Client is required' using errcode='23514'; end if;
  select id into version_id from public.budget_versions where budget_id=target.id and revision=target.current_revision and organization_id=org_id;
  if version_id is null then raise exception 'Sent version not found' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended('orders:'||org_id::text,0)); select coalesce(max(number),0)+1 into next_number from public.orders where organization_id=org_id;
  insert into public.orders(organization_id,number,display_number,budget_id,budget_version_id,client_id,client_address,status,payment_terms,total,created_by) values(org_id,next_number,'PED-'||extract(year from current_date)::integer||'-'||lpad(next_number::text,6,'0'),target.id,version_id,target.client_id,target.client_address,'awaiting_finance',target.payment_terms,target.total,auth.uid()) returning * into created;
  insert into public.order_items(organization_id,order_id,budget_item_id,status,snapshot) select org_id,created.id,i.id,'awaiting_finance',to_jsonb(i) from public.budget_items i where i.budget_id=target.id and i.organization_id=org_id and i.affects_total order by i.position;
  insert into public.provider_assignments(organization_id,supplier_id,order_id,order_item_id,budget_item_id,description,planned_start,planned_end,labor_days,amount)
  select org_id,cl.supplier_id,created.id,oi.id,oi.budget_item_id,cl.description,cl.labor_start_date,case when cl.labor_start_date is null then null else cl.labor_start_date+ceil(cl.labor_days)::integer-1 end,cl.labor_days,cl.total_cost from public.order_items oi join public.item_cost_lines cl on cl.budget_item_id=oi.budget_item_id and cl.organization_id=oi.organization_id where oi.organization_id=org_id and oi.order_id=created.id and cl.kind='service' and cl.supplier_id is not null and cl.total_cost>0;
  insert into public.payables(organization_id,order_id,budget_item_id,supplier_id,group_id,installment,installment_count,description,due_date,amount,paid_amount,status,payment_method,labor_days)
  select org_id,created.id,oi.budget_item_id,cl.supplier_id,gen_random_uuid(),1,1,'Mão de obra · '||cl.description,null,cl.total_cost,0,'open',null,cl.labor_days from public.order_items oi join public.item_cost_lines cl on cl.budget_item_id=oi.budget_item_id and cl.organization_id=oi.organization_id where oi.organization_id=org_id and oi.order_id=created.id and cl.kind='service' and cl.supplier_id is not null and cl.total_cost>0;
  update public.budgets set status='approved' where id=target.id;
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,after_data) values(org_id,auth.uid(),'orders',created.id,'created_from_approved_budget',to_jsonb(created));
  return created;
end; $$;

create or replace function public.cancel_customer_order(org_id uuid,target_order_id uuid,new_reason text)
returns public.orders language plpgsql security definer set search_path='' as $$
declare target public.orders; updated public.orders;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','operacao','financeiro']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 if length(btrim(coalesce(new_reason,'')))<5 then raise exception 'Cancellation reason is required' using errcode='23514'; end if;
 select * into target from public.orders where id=target_order_id and organization_id=org_id for update;
 if target.id is null then raise exception 'Order not found' using errcode='P0002'; end if;
 if target.status='cancelled' then return target; end if;
 if exists(select 1 from public.receivables where organization_id=org_id and order_id=target.id and paid_amount>0 and status<>'cancelled') then raise exception 'Order has receipts and requires financial reversal' using errcode='23514'; end if;
 if exists(select 1 from public.payables where organization_id=org_id and order_id=target.id and paid_amount>0 and status<>'cancelled') then raise exception 'Order has supplier payments and requires financial reversal' using errcode='23514'; end if;
 if exists(select 1 from public.purchases p join public.purchase_items pi on pi.purchase_id=p.id and pi.organization_id=p.organization_id join public.order_items oi on oi.id=pi.order_item_id and oi.organization_id=pi.organization_id where p.organization_id=org_id and oi.order_id=target.id and p.status='completed') then raise exception 'Order has received purchases and requires a return' using errcode='23514'; end if;
 update public.payables set status='cancelled',cancelled_at=now() where organization_id=org_id and order_id=target.id and status in ('open','partial','overdue');
 update public.purchases p set status='cancelled',cancelled_at=now(),cancellation_reason='Pedido do cliente cancelado: '||btrim(new_reason),updated_at=now() where p.organization_id=org_id and p.status in ('draft','awaiting_delivery','delayed') and exists(select 1 from public.purchase_items pi join public.order_items oi on oi.id=pi.order_item_id and oi.organization_id=pi.organization_id where pi.organization_id=org_id and pi.purchase_id=p.id and oi.order_id=target.id);
 update public.purchase_items pi set status='cancelled' where pi.organization_id=org_id and exists(select 1 from public.order_items oi where oi.organization_id=org_id and oi.order_id=target.id and oi.id=pi.order_item_id);
 update public.provider_assignments set status='cancelled',updated_at=now() where organization_id=org_id and order_id=target.id and status<>'cancelled';
 update public.order_items set status='cancelled',updated_at=now() where organization_id=org_id and order_id=target.id;
 update public.orders set status='cancelled',cancelled_at=now(),cancellation_reason=btrim(new_reason),updated_at=now() where id=target.id returning * into updated;
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data,reason) values(org_id,auth.uid(),'orders',target.id,'cancelled',to_jsonb(target),to_jsonb(updated),btrim(new_reason));
 return updated;
end; $$;

revoke all on function public.replace_budget_item_cost_lines(uuid,uuid,jsonb),public.approve_budget_and_create_order(uuid,uuid),public.cancel_customer_order(uuid,uuid,text) from public,anon;
grant execute on function public.replace_budget_item_cost_lines(uuid,uuid,jsonb),public.approve_budget_and_create_order(uuid,uuid),public.cancel_customer_order(uuid,uuid,text) to authenticated;
commit;
