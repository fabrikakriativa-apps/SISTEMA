begin;

alter table public.calendar_events
  add column if not exists budget_id uuid references public.budgets(id);

create index if not exists calendar_events_pre_budget_idx
  on public.calendar_events(organization_id,budget_id,starts_at)
  where cancelled_at is null;

create or replace function public.schedule_pre_budget_visit(
  org_id uuid,
  target_budget_id uuid,
  visit_starts_at timestamptz,
  visit_ends_at timestamptz,
  visit_address text,
  visit_notes text default null
) returns public.calendar_events
language plpgsql security definer set search_path=''
as $$
declare target public.budgets; client_name text; created public.calendar_events;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select b.*,c.name into target,client_name
  from public.budgets b join public.clients c on c.id=b.client_id and c.organization_id=b.organization_id
  where b.id=target_budget_id and b.organization_id=org_id for update;
  if target.id is null then raise exception 'Pre-budget with client not found' using errcode='23503'; end if;
  if target.document_type<>'pre_budget' or target.status<>'draft' then
    raise exception 'Visits can only be scheduled for draft pre-budgets' using errcode='23514';
  end if;
  if visit_starts_at is null or visit_ends_at is null or visit_ends_at<=visit_starts_at then
    raise exception 'Invalid visit time' using errcode='23514';
  end if;
  insert into public.calendar_events(organization_id,client_id,budget_id,event_type,title,description,starts_at,ends_at,created_by)
  values(
    org_id,target.client_id,target.id,'technical_visit',
    'Visita técnica · '||client_name||' · '||target.display_number,
    nullif(concat_ws(E'\n',nullif('Endereço: '||nullif(btrim(coalesce(visit_address,'')),''),''),nullif(btrim(coalesce(visit_notes,'')),'')),''),
    visit_starts_at,visit_ends_at,auth.uid()
  ) returning * into created;
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,after_data)
  values(org_id,auth.uid(),'calendar_events',created.id,'technical_visit_scheduled',to_jsonb(created));
  return created;
end;
$$;

revoke all on function public.schedule_pre_budget_visit(uuid,uuid,timestamptz,timestamptz,text,text) from public,anon;
grant execute on function public.schedule_pre_budget_visit(uuid,uuid,timestamptz,timestamptz,text,text) to authenticated;

commit;
