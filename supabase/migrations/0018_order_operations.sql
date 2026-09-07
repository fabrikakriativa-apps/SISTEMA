begin;
create or replace function public.update_order_items_operation(org_id uuid,target_order_id uuid,target_item_ids uuid[],new_status public.order_status,new_scheduled_at timestamptz default null,new_issue_reason text default null)
returns public.orders language plpgsql security definer set search_path='' as $$
declare target public.orders; updated public.orders; item_count integer; overall public.order_status;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','operacao']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 if coalesce(array_length(target_item_ids,1),0)=0 or new_status not in ('preparing','ready_to_schedule','scheduled','completed','pending_issue') then raise exception 'Invalid operation update' using errcode='23514'; end if;
 if new_status='scheduled' and new_scheduled_at is null then raise exception 'Schedule is required' using errcode='23514'; end if;
 if new_status='pending_issue' and length(btrim(coalesce(new_issue_reason,'')))<5 then raise exception 'Issue reason is required' using errcode='23514'; end if;
 select * into target from public.orders where id=target_order_id and organization_id=org_id for update;
 if target.id is null then raise exception 'Order not found' using errcode='P0002'; end if;
 if target.status in ('awaiting_finance','cancelled','completed') then raise exception 'Order cannot be operated' using errcode='23514'; end if;
 select count(*) into item_count from public.order_items where organization_id=org_id and order_id=target.id and id=any(target_item_ids) and status<>'cancelled';
 if item_count<>array_length(target_item_ids,1) then raise exception 'Invalid order items' using errcode='23514'; end if;
 update public.order_items set status=new_status,scheduled_at=case when new_status='scheduled' then new_scheduled_at else scheduled_at end,completed_at=case when new_status='completed' then now() else null end,issue_reason=case when new_status='pending_issue' then btrim(new_issue_reason) else null end,updated_at=now() where organization_id=org_id and order_id=target.id and id=any(target_item_ids);
 select case when bool_and(status='completed') then 'completed'::public.order_status when bool_or(status='pending_issue') then 'pending_issue'::public.order_status when bool_or(status='completed') then 'partially_completed'::public.order_status when bool_or(status='scheduled') then 'scheduled'::public.order_status when bool_and(status='ready_to_schedule') then 'ready_to_schedule'::public.order_status else 'preparing'::public.order_status end into overall from public.order_items where organization_id=org_id and order_id=target.id and status<>'cancelled';
 update public.orders set status=overall,updated_at=now() where id=target.id returning * into updated;
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data) values(org_id,auth.uid(),'orders',target.id,'operation_updated',to_jsonb(target),jsonb_build_object('item_ids',target_item_ids,'item_status',new_status,'order_status',overall,'scheduled_at',new_scheduled_at,'issue_reason',new_issue_reason));
 return updated;
end; $$;
revoke all on function public.update_order_items_operation(uuid,uuid,uuid[],public.order_status,timestamptz,text) from public,anon;
grant execute on function public.update_order_items_operation(uuid,uuid,uuid[],public.order_status,timestamptz,text) to authenticated;
commit;
