begin;

create or replace function public.return_received_purchase(org_id uuid,target_purchase_id uuid,new_reason text)
returns public.purchases language plpgsql security definer set search_path='' as $$
declare target public.purchases; updated public.purchases;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','compras']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  if length(btrim(coalesce(new_reason,'')))<5 then raise exception 'Return reason is required' using errcode='23514'; end if;
  select * into target from public.purchases where id=target_purchase_id and organization_id=org_id for update;
  if target.id is null then raise exception 'Purchase not found' using errcode='P0002'; end if;
  if target.status<>'completed' then raise exception 'Only received purchases can be returned' using errcode='23514'; end if;
  if exists(select 1 from public.payables where organization_id=org_id and purchase_id=target.id and paid_amount>0 and status<>'cancelled') then raise exception 'Purchase has payments and requires financial reversal' using errcode='23514'; end if;
  update public.purchases set status='returned',cancellation_reason=btrim(new_reason),updated_at=now() where id=target.id returning * into updated;
  update public.payables set status='cancelled',cancelled_at=now() where organization_id=org_id and purchase_id=target.id and status in ('open','partial','overdue');
  update public.purchase_items set status='returned' where organization_id=org_id and purchase_id=target.id;
  update public.order_items oi set status='awaiting_purchase',supplier_due_date=null,updated_at=now() where oi.organization_id=org_id and exists(select 1 from public.purchase_items pi where pi.organization_id=org_id and pi.purchase_id=target.id and pi.order_item_id=oi.id);
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data,reason) values(org_id,auth.uid(),'purchases',target.id,'returned',to_jsonb(target),to_jsonb(updated),btrim(new_reason));
  return updated;
end; $$;

revoke all on function public.return_received_purchase(uuid,uuid,text) from public,anon;
grant execute on function public.return_received_purchase(uuid,uuid,text) to authenticated;

commit;
