-- The approved budget is commercial history. Operational scheduling lives on
-- the order assignment and can be adjusted without reopening the budget.
create or replace function public.update_provider_assignment_schedule(
  org_id uuid,
  target_assignment_id uuid,
  new_planned_start date,
  new_labor_days numeric
)
returns public.provider_assignments
language plpgsql
security definer
set search_path=''
as $$
declare
  target public.provider_assignments;
  updated public.provider_assignments;
begin
  if auth.uid() is null
    or not private.has_org_role(org_id, array['admin','comercial','operacao']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if new_planned_start is null or new_labor_days is null or new_labor_days <= 0 then
    raise exception 'Planned start and labor days are required' using errcode='23514';
  end if;

  select * into target
  from public.provider_assignments
  where id = target_assignment_id and organization_id = org_id
  for update;
  if target.id is null then raise exception 'Provider assignment not found' using errcode='P0002'; end if;
  if target.status = 'cancelled' then raise exception 'Cancelled assignment cannot be changed' using errcode='23514'; end if;

  update public.provider_assignments
  set planned_start = new_planned_start,
      planned_end = new_planned_start + ceil(new_labor_days)::integer - 1,
      labor_days = new_labor_days,
      updated_at = now()
  where id = target.id
  returning * into updated;

  insert into public.audit_log(organization_id, actor_id, entity_type, entity_id, action, before_data, after_data)
  values (org_id, auth.uid(), 'provider_assignments', target.id, 'schedule_updated', to_jsonb(target), to_jsonb(updated));
  return updated;
end;
$$;

revoke all on function public.update_provider_assignment_schedule(uuid,uuid,date,numeric) from public, anon;
grant execute on function public.update_provider_assignment_schedule(uuid,uuid,date,numeric) to authenticated;
