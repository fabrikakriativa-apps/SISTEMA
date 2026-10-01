create or replace function public.duplicate_budget_item(org_id uuid,source_budget_item_id uuid)
returns public.budget_items
language plpgsql security definer set search_path=''
as $$
declare
  source_item public.budget_items;
  duplicate_item public.budget_items;
  next_position integer;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  select i.* into source_item
  from public.budget_items i
  join public.budgets b on b.id=i.budget_id and b.organization_id=i.organization_id
  where i.id=source_budget_item_id and i.organization_id=org_id and b.status='draft'
  for update;

  if source_item.id is null then
    raise exception 'Draft item not found' using errcode='P0002';
  end if;

  perform 1 from public.budgets b
  where b.id=source_item.budget_id and b.organization_id=org_id
  for update;

  select coalesce(max(i.position),0)+1 into next_position
  from public.budget_items i
  where i.organization_id=org_id and i.budget_id=source_item.budget_id;

  insert into public.budget_items(
    organization_id,budget_id,family_id,position,presentation,group_name,environment,
    description,internal_notes,quantity,configuration,cost_total,margin_percent,sale_total,affects_total
  ) values (
    source_item.organization_id,source_item.budget_id,source_item.family_id,next_position,source_item.presentation,source_item.group_name,source_item.environment,
    source_item.description||' (cópia)',source_item.internal_notes,source_item.quantity,
    coalesce(source_item.configuration,'{}'::jsonb)-'manufacturer_cost'-'additional_cost'-'installation_cost',
    0,source_item.margin_percent,source_item.sale_total,source_item.affects_total
  ) returning * into duplicate_item;

  insert into public.budget_item_payment_options(
    organization_id,budget_item_id,position,description,adjustment_percent,final_value,observation
  )
  select organization_id,duplicate_item.id,position,description,adjustment_percent,final_value,observation
  from public.budget_item_payment_options
  where organization_id=org_id and budget_item_id=source_item.id
  order by position;

  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data)
  values(
    org_id,auth.uid(),'budget_items',duplicate_item.id,'duplicated',
    jsonb_build_object('source_budget_item_id',source_item.id),
    jsonb_build_object('duplicate_budget_item_id',duplicate_item.id)
  );

  return duplicate_item;
end;
$$;

revoke all on function public.duplicate_budget_item(uuid,uuid) from public,anon;
grant execute on function public.duplicate_budget_item(uuid,uuid) to authenticated;
