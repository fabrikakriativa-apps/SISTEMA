begin;
grant select on public.calendar_events to authenticated;
drop policy if exists "calendar event member read" on public.calendar_events;
create policy "calendar event member read" on public.calendar_events for select to authenticated
using(private.has_org_role(organization_id,array['admin','comercial','compras','financeiro','operacao']::public.app_role[]));
create index if not exists calendar_events_org_starts_idx on public.calendar_events(organization_id,starts_at) where cancelled_at is null;
create or replace function public.sync_order_item_calendar() returns trigger language plpgsql security definer set search_path='' as $$
declare parent public.orders;
begin
 select * into parent from public.orders where id=new.order_id and organization_id=new.organization_id;
 if new.status='scheduled' and new.scheduled_at is not null then
  update public.calendar_events set client_id=parent.client_id,title=parent.display_number||' · '||coalesce(nullif(new.snapshot->>'environment',''),'Item do pedido'),description=nullif(new.snapshot->>'description',''),starts_at=new.scheduled_at,ends_at=null,sync_status='pending',updated_at=now() where organization_id=new.organization_id and order_item_id=new.id and event_type='order_item_schedule' and cancelled_at is null;
  if not found then insert into public.calendar_events(organization_id,client_id,order_id,order_item_id,event_type,title,description,starts_at,created_by) values(new.organization_id,parent.client_id,parent.id,new.id,'order_item_schedule',parent.display_number||' · '||coalesce(nullif(new.snapshot->>'environment',''),'Item do pedido'),nullif(new.snapshot->>'description',''),new.scheduled_at,auth.uid()); end if;
 elsif old.status='scheduled' then
  update public.calendar_events set cancelled_at=now(),sync_status='pending',updated_at=now() where organization_id=new.organization_id and order_item_id=new.id and event_type='order_item_schedule' and cancelled_at is null;
 end if;
 return new;
end; $$;
revoke all on function public.sync_order_item_calendar() from public,anon,authenticated;
drop trigger if exists order_items_calendar on public.order_items;
create trigger order_items_calendar after update of status,scheduled_at on public.order_items for each row when(old.status is distinct from new.status or old.scheduled_at is distinct from new.scheduled_at) execute function public.sync_order_item_calendar();
commit;
