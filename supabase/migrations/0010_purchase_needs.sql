begin;

grant select on public.suppliers,public.purchases,public.purchase_items to authenticated;
create policy "supplier member read" on public.suppliers for select to authenticated
using(private.has_org_role(organization_id,array['admin','comercial','compras','financeiro','operacao']::public.app_role[]));
create policy "purchase member read" on public.purchases for select to authenticated
using(private.has_org_role(organization_id,array['admin','compras','financeiro','operacao']::public.app_role[]));
create policy "purchase item member read" on public.purchase_items for select to authenticated
using(private.has_org_role(organization_id,array['admin','compras','financeiro','operacao']::public.app_role[]));

create index order_items_org_status_idx on public.order_items(organization_id,status,order_id);
create index purchase_items_org_purchase_idx on public.purchase_items(organization_id,purchase_id);

create or replace function public.create_supplier_purchase(
  org_id uuid,
  selected_order_item_ids uuid[],
  selected_supplier_id uuid,
  purchase_mode text
)
returns public.purchases
language plpgsql security definer set search_path='' as $$
declare
  selected_count integer;
  order_count integer;
  family_groups integer;
  next_number bigint;
  created public.purchases;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','compras']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  if purchase_mode not in ('immediate','made_to_order') then raise exception 'Invalid purchase mode' using errcode='23514'; end if;
  if selected_order_item_ids is null or cardinality(selected_order_item_ids)=0 then raise exception 'Select at least one item' using errcode='23514'; end if;
  if selected_supplier_id is not null and not exists(select 1 from public.suppliers s where s.id=selected_supplier_id and s.organization_id=org_id and s.active) then raise exception 'Invalid supplier' using errcode='23514'; end if;

  select count(*),count(distinct oi.order_id),count(distinct case when f.form_key='curtain' then 'curtain' when f.form_key='blind' then 'blind' else 'other' end)
  into selected_count,order_count,family_groups
  from public.order_items oi
  join public.budget_items bi on bi.id=oi.budget_item_id and bi.organization_id=oi.organization_id
  left join public.item_families f on f.id=bi.family_id and f.organization_id=bi.organization_id
  where oi.organization_id=org_id and oi.id=any(selected_order_item_ids) and oi.status='awaiting_purchase';

  if selected_count<>cardinality(selected_order_item_ids) then raise exception 'Invalid or unavailable items' using errcode='23514'; end if;
  if order_count<>1 then raise exception 'Items must belong to one customer order' using errcode='23514'; end if;
  if family_groups<>1 then raise exception 'Curtain and blind purchases must be separated' using errcode='23514'; end if;

  perform pg_advisory_xact_lock(hashtextextended('purchases:'||org_id::text,0));
  select coalesce(max(number),0)+1 into next_number from public.purchases where organization_id=org_id;
  insert into public.purchases(organization_id,number,display_number,supplier_id,mode,status,total,created_by)
  select org_id,next_number,'CMP-'||extract(year from current_date)::integer||'-'||lpad(next_number::text,6,'0'),selected_supplier_id,purchase_mode,'draft',round(sum(bi.cost_total),2),auth.uid()
  from public.order_items oi join public.budget_items bi on bi.id=oi.budget_item_id and bi.organization_id=oi.organization_id
  where oi.organization_id=org_id and oi.id=any(selected_order_item_ids)
  returning * into created;

  insert into public.purchase_items(organization_id,purchase_id,order_item_id,description,quantity,unit,unit_cost,status)
  select org_id,created.id,oi.id,coalesce(oi.snapshot->>'description','Item'),coalesce((oi.snapshot->>'quantity')::numeric,1),'un',round(coalesce((oi.snapshot->>'cost_total')::numeric,0)/greatest(coalesce((oi.snapshot->>'quantity')::numeric,1),0.001),2),'ordered'
  from public.order_items oi where oi.organization_id=org_id and oi.id=any(selected_order_item_ids);
  update public.order_items set status='awaiting_supplier',updated_at=now() where organization_id=org_id and id=any(selected_order_item_ids);
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,after_data) values(org_id,auth.uid(),'purchases',created.id,'created',to_jsonb(created));
  return created;
end; $$;

revoke all on function public.create_supplier_purchase(uuid,uuid[],uuid,text) from public,anon;
grant execute on function public.create_supplier_purchase(uuid,uuid[],uuid,text) to authenticated;
commit;
