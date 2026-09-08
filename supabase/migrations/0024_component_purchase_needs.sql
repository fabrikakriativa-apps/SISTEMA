begin;

create table public.procurement_needs(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  source_cost_line_id uuid references public.item_cost_lines(id), supply_id uuid references public.supplies(id), kind text not null check(kind in ('whole_item','supply')),
  description text not null, quantity numeric(14,4) not null, unit text not null, unit_cost numeric(14,2) not null,
  status text not null default 'awaiting_finance' check(status in ('awaiting_finance','awaiting_purchase','awaiting_supplier','received','cancelled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.procurement_needs enable row level security;
create index procurement_needs_org_status_idx on public.procurement_needs(organization_id,status,order_item_id);
alter table public.purchase_items add column procurement_need_id uuid references public.procurement_needs(id);
create unique index purchase_items_need_active_idx on public.purchase_items(procurement_need_id) where status not in ('cancelled','returned');
grant select on public.procurement_needs to authenticated;
create policy "procurement need member read" on public.procurement_needs for select to authenticated using(private.has_org_role(organization_id,array['admin','compras','financeiro','operacao','comercial']::public.app_role[]));

create or replace function private.refresh_order_item_procurement(target_org uuid,target_item uuid) returns void language plpgsql security definer set search_path='' as $$
declare next_status public.order_status;
begin
 select case when bool_and(status='received') then 'preparing'::public.order_status when bool_or(status='awaiting_purchase') then 'awaiting_purchase'::public.order_status else 'awaiting_supplier'::public.order_status end into next_status
 from public.procurement_needs where organization_id=target_org and order_item_id=target_item and status<>'cancelled';
 update public.order_items set status=coalesce(next_status,'preparing'),updated_at=now() where id=target_item and organization_id=target_org and status<>'cancelled';
end; $$;
revoke all on function private.refresh_order_item_procurement(uuid,uuid) from public,anon,authenticated;

create or replace function public.create_supplier_purchase(org_id uuid,selected_order_item_ids uuid[],selected_supplier_id uuid,purchase_mode text)
returns public.purchases language plpgsql security definer set search_path='' as $$
declare selected_count integer; order_count integer; family_groups integer; next_number bigint; created public.purchases; item_id uuid;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','compras']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 if purchase_mode not in ('immediate','made_to_order') or selected_order_item_ids is null or cardinality(selected_order_item_ids)=0 then raise exception 'Invalid purchase request' using errcode='23514'; end if;
 if selected_supplier_id is not null and not exists(select 1 from public.suppliers s where s.id=selected_supplier_id and s.organization_id=org_id and s.active) then raise exception 'Invalid supplier' using errcode='23514'; end if;
 select count(*),count(distinct oi.order_id),count(distinct case when n.kind='supply' then 'supply:'||coalesce(n.supply_id::text,n.source_cost_line_id::text,n.id::text) when f.form_key='curtain' then 'curtain' when f.form_key='blind' then 'blind' else 'other' end)
 into selected_count,order_count,family_groups from public.procurement_needs n join public.order_items oi on oi.id=n.order_item_id and oi.organization_id=n.organization_id join public.budget_items bi on bi.id=oi.budget_item_id left join public.item_families f on f.id=bi.family_id
 where n.organization_id=org_id and n.id=any(selected_order_item_ids) and n.status='awaiting_purchase';
 if selected_count<>cardinality(selected_order_item_ids) or order_count<>1 then raise exception 'Invalid or unavailable needs' using errcode='23514'; end if;
 if family_groups<>1 then raise exception 'Select compatible components for one supplier order' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended('purchases:'||org_id::text,0));select coalesce(max(number),0)+1 into next_number from public.purchases where organization_id=org_id;
 insert into public.purchases(organization_id,number,display_number,supplier_id,mode,status,total,created_by)
 select org_id,next_number,'CMP-'||extract(year from current_date)::integer||'-'||lpad(next_number::text,6,'0'),selected_supplier_id,purchase_mode,'draft',round(sum(quantity*unit_cost),2),auth.uid() from public.procurement_needs where organization_id=org_id and id=any(selected_order_item_ids) returning * into created;
 insert into public.purchase_items(organization_id,purchase_id,order_item_id,procurement_need_id,description,quantity,unit,unit_cost,status)
 select org_id,created.id,n.order_item_id,n.id,n.description,n.quantity,n.unit,n.unit_cost,'ordered' from public.procurement_needs n where n.organization_id=org_id and n.id=any(selected_order_item_ids);
 update public.procurement_needs set status='awaiting_supplier',updated_at=now() where organization_id=org_id and id=any(selected_order_item_ids);
 for item_id in select distinct order_item_id from public.procurement_needs where organization_id=org_id and id=any(selected_order_item_ids) loop perform private.refresh_order_item_procurement(org_id,item_id); end loop;
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,after_data) values(org_id,auth.uid(),'purchases',created.id,'created_from_component_needs',to_jsonb(created));return created;
end; $$;
revoke all on function public.create_supplier_purchase(uuid,uuid[],uuid,text) from public,anon;grant execute on function public.create_supplier_purchase(uuid,uuid[],uuid,text) to authenticated;

create or replace function private.seed_order_procurement_needs(target_org uuid,target_order uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.procurement_needs(organization_id,order_item_id,source_cost_line_id,supply_id,kind,description,quantity,unit,unit_cost,status)
 select target_org,oi.id,cl.id,cl.supply_id,case when cl.kind='supply' then 'supply' else 'whole_item' end,cl.description,cl.quantity,cl.unit,cl.unit_cost,case when oi.status='awaiting_finance' then 'awaiting_finance' when oi.status='awaiting_purchase' then 'awaiting_purchase' when oi.status='awaiting_supplier' then 'awaiting_supplier' else 'received' end
 from public.order_items oi join public.item_cost_lines cl on cl.budget_item_id=oi.budget_item_id and cl.organization_id=oi.organization_id
 where oi.organization_id=target_org and oi.order_id=target_order and cl.kind in ('product','supply') and not exists(select 1 from public.procurement_needs n where n.order_item_id=oi.id and n.source_cost_line_id=cl.id);
 insert into public.procurement_needs(organization_id,order_item_id,kind,description,quantity,unit,unit_cost,status)
 select target_org,oi.id,'whole_item',coalesce(oi.snapshot->>'description','Item'),coalesce((oi.snapshot->>'quantity')::numeric,1),'un',round(coalesce((oi.snapshot->>'cost_total')::numeric,0)/greatest(coalesce((oi.snapshot->>'quantity')::numeric,1),0.001),2),case when oi.status='awaiting_finance' then 'awaiting_finance' when oi.status='awaiting_purchase' then 'awaiting_purchase' when oi.status='awaiting_supplier' then 'awaiting_supplier' else 'received' end
 from public.order_items oi where oi.organization_id=target_org and oi.order_id=target_order and not exists(select 1 from public.procurement_needs n where n.order_item_id=oi.id);
end; $$;
revoke all on function private.seed_order_procurement_needs(uuid,uuid) from public,anon,authenticated;

create or replace function private.seed_new_order_item_procurement_needs() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.seed_order_procurement_needs(new.organization_id,new.order_id);
  return new;
end; $$;
revoke all on function private.seed_new_order_item_procurement_needs() from public,anon,authenticated;
create trigger order_item_seed_procurement after insert on public.order_items for each row execute function private.seed_new_order_item_procurement_needs();

create or replace function private.guard_order_item_procurement_status() returns trigger language plpgsql security definer set search_path='' as $$
declare derived public.order_status;
begin
  if new.status='cancelled' then update public.procurement_needs set status='cancelled',updated_at=now() where organization_id=new.organization_id and order_item_id=new.id;return new; end if;
  if not exists(select 1 from public.procurement_needs n where n.organization_id=new.organization_id and n.order_item_id=new.id and n.status<>'cancelled') then return new; end if;
  if old.status='awaiting_finance' and new.status='awaiting_purchase' then update public.procurement_needs set status='awaiting_purchase',updated_at=now() where organization_id=new.organization_id and order_item_id=new.id and status='awaiting_finance'; end if;
  if new.status in ('awaiting_purchase','awaiting_supplier','preparing') then
    select case when bool_and(status='received') then 'preparing'::public.order_status when bool_or(status='awaiting_purchase') or bool_or(status='awaiting_finance') then 'awaiting_purchase'::public.order_status else 'awaiting_supplier'::public.order_status end into derived
    from public.procurement_needs where organization_id=new.organization_id and order_item_id=new.id and status<>'cancelled';
    new.status:=coalesce(derived,new.status);
  end if;
  return new;
end; $$;
revoke all on function private.guard_order_item_procurement_status() from public,anon,authenticated;
create trigger order_item_procurement_status_guard before update of status on public.order_items for each row execute function private.guard_order_item_procurement_status();

create or replace function private.sync_procurement_need_from_purchase_item() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.procurement_need_id is null then return new; end if;
  update public.procurement_needs set status=case when new.status='received' then 'received' when new.status in ('cancelled','returned') then 'awaiting_purchase' else 'awaiting_supplier' end,updated_at=now()
  where id=new.procurement_need_id and organization_id=new.organization_id and status<>'cancelled';
  return new;
end; $$;
revoke all on function private.sync_procurement_need_from_purchase_item() from public,anon,authenticated;
create trigger purchase_item_sync_need after insert or update of status on public.purchase_items for each row execute function private.sync_procurement_need_from_purchase_item();

create or replace function private.sync_order_status_from_items() returns trigger language plpgsql security definer set search_path='' as $$
declare derived public.order_status;
begin
  if exists(select 1 from public.orders o where o.id=new.order_id and o.status='cancelled') then return new; end if;
  select case
    when bool_and(status='completed') then 'completed'::public.order_status
    when bool_or(status='pending_issue') then 'pending_issue'::public.order_status
    when bool_or(status='awaiting_finance') then 'awaiting_finance'::public.order_status
    when bool_or(status='awaiting_purchase') then 'awaiting_purchase'::public.order_status
    when bool_or(status='awaiting_supplier') then 'awaiting_supplier'::public.order_status
    when bool_or(status='scheduled') then 'scheduled'::public.order_status
    when bool_or(status='ready_to_schedule') then 'ready_to_schedule'::public.order_status
    when bool_or(status='completed') then 'partially_completed'::public.order_status
    else 'preparing'::public.order_status end into derived
  from public.order_items where organization_id=new.organization_id and order_id=new.order_id and status<>'cancelled';
  update public.orders set status=coalesce(derived,status),updated_at=now() where id=new.order_id and organization_id=new.organization_id and status<>'cancelled';
  return new;
end; $$;
revoke all on function private.sync_order_status_from_items() from public,anon,authenticated;
create trigger order_item_sync_order_status after update of status on public.order_items for each row execute function private.sync_order_status_from_items();

-- Existing approved orders receive the same normalized needs without duplication.
select private.seed_order_procurement_needs(organization_id,id) from public.orders where status<>'cancelled';

commit;
