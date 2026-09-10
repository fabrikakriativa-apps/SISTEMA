create or replace function public.convert_opportunity_to_budget(org_id uuid, target_opportunity_id uuid)
returns public.budgets
language plpgsql
security definer
set search_path=''
as $$
declare
  opportunity public.sales_opportunities;
  linked_client public.clients;
  created_budget public.budgets;
  next_number bigint;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  select * into opportunity from public.sales_opportunities
  where id=target_opportunity_id and organization_id=org_id for update;
  if opportunity.id is null then raise exception 'Opportunity not found' using errcode='P0002'; end if;
  if opportunity.stage='lost' then raise exception 'Lost opportunity cannot create a budget' using errcode='23514'; end if;

  if opportunity.budget_id is not null then
    select * into created_budget from public.budgets
    where id=opportunity.budget_id and organization_id=org_id;
    if created_budget.id is not null then return created_budget; end if;
  end if;

  if opportunity.client_id is not null then
    select * into linked_client from public.clients
    where id=opportunity.client_id and organization_id=org_id and archived_at is null;
  end if;

  if linked_client.id is null then
    insert into public.clients(organization_id,client_type,name,email,phone,origin,notes,created_by)
    values(org_id,'Cliente final',btrim(opportunity.name),nullif(btrim(coalesce(opportunity.email,'')),''),nullif(btrim(coalesce(opportunity.phone,'')),''),nullif(btrim(coalesce(opportunity.origin,'')),''),nullif(btrim(coalesce(opportunity.notes,'')),''),auth.uid())
    returning * into linked_client;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(org_id::text,0));
  select coalesce(max(number),0)+1 into next_number from public.budgets where organization_id=org_id;

  insert into public.budgets(organization_id,number,display_number,client_id,status,valid_until,payment_terms,delivery_terms,created_by)
  values(org_id,next_number,'ORC-'||extract(year from current_date)::integer||'-'||lpad(next_number::text,6,'0'),linked_client.id,'draft',current_date+10,'Conforme disposto em cada item','A definir',auth.uid())
  returning * into created_budget;

  update public.sales_opportunities
  set client_id=linked_client.id,budget_id=created_budget.id,stage='budgeting',updated_at=now()
  where id=opportunity.id;

  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,after_data)
  values(org_id,auth.uid(),'sales_opportunities',opportunity.id,'converted_to_budget',jsonb_build_object('client_id',linked_client.id,'budget_id',created_budget.id));

  return created_budget;
end;
$$;

revoke all on function public.convert_opportunity_to_budget(uuid,uuid) from public,anon;
grant execute on function public.convert_opportunity_to_budget(uuid,uuid) to authenticated;
