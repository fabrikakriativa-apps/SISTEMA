create or replace function public.set_order_promised_date(org_id uuid,target_order_id uuid,new_promised_date date)
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
 update public.orders set promised_date=new_promised_date,updated_at=now() where id=target.id returning * into updated;
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data)
 values(org_id,auth.uid(),'orders',target.id,'promised_date_updated',to_jsonb(target),to_jsonb(updated));
 return updated;
end;
$$;

revoke all on function public.set_order_promised_date(uuid,uuid,date) from public,anon;
grant execute on function public.set_order_promised_date(uuid,uuid,date) to authenticated;
