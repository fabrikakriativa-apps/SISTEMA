begin;

create or replace function public.cancel_technical_visit(
  org_id uuid,
  target_event_id uuid
) returns public.calendar_events
language plpgsql security definer set search_path=''
as $$
declare target public.calendar_events; updated public.calendar_events;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial','operacao']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select * into target from public.calendar_events
  where id=target_event_id and organization_id=org_id for update;
  if target.id is null or target.event_type<>'technical_visit' then
    raise exception 'Technical visit not found' using errcode='P0002';
  end if;
  if target.cancelled_at is not null then
    raise exception 'Technical visit is already cancelled' using errcode='23514';
  end if;
  update public.calendar_events set cancelled_at=now(),sync_status='pending',updated_at=now()
  where id=target_event_id and organization_id=org_id
  returning * into updated;
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data)
  values(org_id,auth.uid(),'calendar_events',updated.id,'technical_visit_cancelled',to_jsonb(target),to_jsonb(updated));
  return updated;
end;
$$;

revoke all on function public.cancel_technical_visit(uuid,uuid) from public,anon;
grant execute on function public.cancel_technical_visit(uuid,uuid) to authenticated;

commit;
