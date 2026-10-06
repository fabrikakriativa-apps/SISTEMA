-- Reviewed production change. Attachments are recoverable; no storage objects are deleted.
alter table public.attachments add column if not exists deleted_at timestamptz;

create or replace function public.remove_document_attachment(org_id uuid,target_attachment_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.attachments; allowed boolean:=false;
begin
 if auth.uid() is null then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into target from public.attachments where id=target_attachment_id and organization_id=org_id for update;
 if target.id is null then raise exception 'Attachment not found' using errcode='42501'; end if;
 if target.entity_type='budget' then
  allowed:=private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) and exists(select 1 from public.budgets where id=target.entity_id and organization_id=org_id);
 elsif target.entity_type='budget_item' then
  allowed:=private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) and exists(select 1 from public.budget_items where id=target.entity_id and organization_id=org_id);
 elsif target.entity_type='purchase' then
  allowed:=private.has_org_role(org_id,array['admin','compras']::public.app_role[]) and exists(select 1 from public.purchases where id=target.entity_id and organization_id=org_id);
 end if;
 if not coalesce(allowed,false) then raise exception 'Not authorized' using errcode='42501'; end if;
 if target.deleted_at is null then
  update public.attachments set deleted_at=now() where id=target.id;
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data)
  values(org_id,auth.uid(),'attachments',target.id,'removed',to_jsonb(target),jsonb_build_object('deleted_at',now()));
 end if;
 return jsonb_build_object('id',target.id,'removed',true);
end $$;
revoke all on function public.remove_document_attachment(uuid,uuid) from public,anon;
grant execute on function public.remove_document_attachment(uuid,uuid) to authenticated;

create or replace function private.seed_order_procurement_needs(target_org uuid,target_order uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.procurement_needs(organization_id,order_item_id,source_cost_line_id,supply_id,kind,description,quantity,unit,unit_cost,deadline,status)
 select target_org,oi.id,cl.id,cl.supply_id,'supply',cl.description,cl.quantity,cl.unit,cl.unit_cost,o.promised_date,'awaiting_purchase'
 from public.order_items oi
 join public.orders o on o.id=oi.order_id and o.organization_id=oi.organization_id
 join public.item_cost_lines cl on cl.budget_item_id=oi.budget_item_id and cl.organization_id=oi.organization_id
 where oi.organization_id=target_org and oi.order_id=target_order
 and o.status not in ('cancelled','completed') and oi.status not in ('cancelled','completed')
 and cl.kind='supply' and cl.supply_id is not null
 and not exists(select 1 from public.procurement_needs n where n.order_item_id=oi.id and n.source_cost_line_id=cl.id);
end $$;
revoke all on function private.seed_order_procurement_needs(uuid,uuid) from public,anon,authenticated;

-- Keep the existing permission/validation/audit logic; manual materials no longer mean whole budget items.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.save_procurement_need(uuid,uuid,uuid,uuid,text,numeric,text,numeric,date,boolean)'::regprocedure);
 definition:=replace(definition,'case when new_supply_id is null then ''whole_item'' else ''supply'' end','''supply''');
 execute definition;
end $$;
revoke all on function public.save_procurement_need(uuid,uuid,uuid,uuid,text,numeric,text,numeric,date,boolean) from public,anon;
grant execute on function public.save_procurement_need(uuid,uuid,uuid,uuid,text,numeric,text,numeric,date,boolean) to authenticated;

-- Preserve manually saved materials and every purchased/history entry.
update public.procurement_needs n set kind='supply',updated_at=now()
where n.kind='whole_item' and n.status in ('awaiting_finance','awaiting_purchase')
and exists(select 1 from public.audit_log a where a.organization_id=n.organization_id and a.entity_type='procurement_needs' and a.entity_id=n.id and a.action='saved');

with candidates as (
 select n.* from public.procurement_needs n
 where n.kind='whole_item' and n.status in ('awaiting_finance','awaiting_purchase')
 and not exists(select 1 from public.purchase_items pi where pi.procurement_need_id=n.id)
 and not exists(select 1 from public.audit_log a where a.organization_id=n.organization_id and a.entity_type='procurement_needs' and a.entity_id=n.id and a.action='saved')
), changed as (
 update public.procurement_needs n set status='cancelled',updated_at=now() from candidates c where n.id=c.id returning n.id,n.organization_id,to_jsonb(c) as before_data,to_jsonb(n) as after_data
)
insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data)
select organization_id,null,'procurement_needs',id,'replaced_automatic_whole_item',before_data,after_data from changed;

select private.seed_order_procurement_needs(organization_id,id) from public.orders where status not in ('cancelled','completed');
