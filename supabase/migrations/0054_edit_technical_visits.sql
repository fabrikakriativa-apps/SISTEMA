begin;

create or replace function public.update_technical_visit(
  org_id uuid,
  target_event_id uuid,
  visit_starts_at timestamptz,
  visit_ends_at timestamptz,
  visit_address text,
  visit_notes text default null
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
    raise exception 'Cancelled visit cannot be edited' using errcode='23514';
  end if;
  if visit_starts_at is null or visit_ends_at is null or visit_ends_at<=visit_starts_at then
    raise exception 'Invalid visit time' using errcode='23514';
  end if;
  update public.calendar_events set
    description=nullif(concat_ws(E'\n',nullif('Endereço: '||nullif(btrim(coalesce(visit_address,'')),''),''),nullif(btrim(coalesce(visit_notes,'')),'')),''),
    starts_at=visit_starts_at,
    ends_at=visit_ends_at,
    sync_status='pending',
    updated_at=now()
  where id=target_event_id and organization_id=org_id
  returning * into updated;
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data)
  values(org_id,auth.uid(),'calendar_events',updated.id,'technical_visit_updated',to_jsonb(target),to_jsonb(updated));
  return updated;
end;
$$;

revoke all on function public.update_technical_visit(uuid,uuid,timestamptz,timestamptz,text,text) from public,anon;
grant execute on function public.update_technical_visit(uuid,uuid,timestamptz,timestamptz,text,text) to authenticated;

commit;
