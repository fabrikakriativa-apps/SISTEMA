begin;
create or replace function public.mark_calendar_event_sync(org_id uuid,target_event_id uuid,new_google_event_id text,new_status text)
returns public.calendar_events language plpgsql security definer set search_path='' as $$
declare updated public.calendar_events;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','operacao']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 if new_status not in ('synced','error') then raise exception 'Invalid sync status' using errcode='23514'; end if;
 update public.calendar_events set google_event_id=coalesce(nullif(new_google_event_id,''),google_event_id),google_calendar_id='primary',sync_status=new_status,updated_at=now()
 where id=target_event_id and organization_id=org_id returning * into updated;
 if updated.id is null then raise exception 'Calendar event not found' using errcode='P0002'; end if;
 return updated;
end; $$;
revoke all on function public.mark_calendar_event_sync(uuid,uuid,text,text) from public,anon;
grant execute on function public.mark_calendar_event_sync(uuid,uuid,text,text) to authenticated;
commit;
