begin;

create or replace function public.cancel_customer_order(org_id uuid,target_order_id uuid,new_reason text)
returns public.orders language plpgsql security definer set search_path='' as $$
declare target public.orders; updated public.orders;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  if length(btrim(coalesce(new_reason,'')))<5 then raise exception 'Cancellation reason is required' using errcode='23514'; end if;
  select * into target from public.orders where id=target_order_id and organization_id=org_id for update;
  if target.id is null then raise exception 'Order not found' using errcode='P0002'; end if;
  if target.status in ('completed','cancelled') then raise exception 'Order cannot be cancelled' using errcode='23514'; end if;
  if exists(select 1 from public.receivables where organization_id=org_id and order_id=target.id and paid_amount>0 and status<>'cancelled') then raise exception 'Order has receipts and requires financial reversal' using errcode='23514'; end if;
  if exists(select 1 from public.payables p join public.purchase_items pi on pi.purchase_id=p.purchase_id and pi.organization_id=p.organization_id join public.order_items oi on oi.id=pi.order_item_id and oi.organization_id=pi.organization_id where p.organization_id=org_id and oi.order_id=target.id and p.paid_amount>0 and p.status<>'cancelled') then raise exception 'Order has supplier payments and requires financial reversal' using errcode='23514'; end if;
  if exists(select 1 from public.purchases p join public.purchase_items pi on pi.purchase_id=p.id and pi.organization_id=p.organization_id join public.order_items oi on oi.id=pi.order_item_id and oi.organization_id=pi.organization_id where p.organization_id=org_id and oi.order_id=target.id and p.status='completed') then raise exception 'Order has received purchases and requires a return' using errcode='23514'; end if;

  update public.receivables set status='cancelled',cancelled_at=now() where organization_id=org_id and order_id=target.id and status in ('open','partial','overdue');
  update public.payables p set status='cancelled',cancelled_at=now() where p.organization_id=org_id and p.status in ('open','partial','overdue') and exists(select 1 from public.purchase_items pi join public.order_items oi on oi.id=pi.order_item_id and oi.organization_id=pi.organization_id where pi.organization_id=org_id and pi.purchase_id=p.purchase_id and oi.order_id=target.id);
  update public.purchases p set status='cancelled',cancelled_at=now(),cancellation_reason='Pedido do cliente cancelado: '||btrim(new_reason),updated_at=now() where p.organization_id=org_id and p.status in ('draft','awaiting_delivery','delayed') and exists(select 1 from public.purchase_items pi join public.order_items oi on oi.id=pi.order_item_id and oi.organization_id=pi.organization_id where pi.organization_id=org_id and pi.purchase_id=p.id and oi.order_id=target.id);
  update public.purchase_items pi set status='cancelled' where pi.organization_id=org_id and exists(select 1 from public.order_items oi where oi.organization_id=org_id and oi.order_id=target.id and oi.id=pi.order_item_id);
  update public.order_items set status='cancelled',updated_at=now() where organization_id=org_id and order_id=target.id;
  update public.calendar_events set cancelled_at=now(),sync_status='pending' where organization_id=org_id and order_id=target.id and cancelled_at is null;
  update public.orders set status='cancelled',updated_at=now() where id=target.id returning * into updated;
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data,reason) values(org_id,auth.uid(),'orders',target.id,'cancelled',to_jsonb(target),to_jsonb(updated),btrim(new_reason));
  return updated;
end; $$;

revoke all on function public.cancel_customer_order(uuid,uuid,text) from public,anon;
grant execute on function public.cancel_customer_order(uuid,uuid,text) to authenticated;

commit;
