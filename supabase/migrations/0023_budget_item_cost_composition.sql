begin;

grant select on public.item_cost_lines to authenticated;

create policy "item cost member read" on public.item_cost_lines for select to authenticated
using((select private.has_org_role(organization_id,array['admin','comercial','compras','financeiro','operacao']::public.app_role[])));

create or replace function public.replace_budget_item_cost_lines(org_id uuid,target_budget_item_id uuid,new_lines jsonb)
returns public.budget_items language plpgsql security definer set search_path='' as $$
declare target public.budget_items; line jsonb; updated public.budget_items;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select i.* into target from public.budget_items i join public.budgets b on b.id=i.budget_id and b.organization_id=i.organization_id
  where i.id=target_budget_item_id and i.organization_id=org_id and b.status='draft' for update;
  if target.id is null then raise exception 'Draft item not found' using errcode='P0002'; end if;
  if jsonb_typeof(coalesce(new_lines,'[]'::jsonb))<>'array' then raise exception 'Invalid cost lines' using errcode='23514'; end if;

  delete from public.item_cost_lines where organization_id=org_id and budget_item_id=target.id;
  for line in select value from jsonb_array_elements(coalesce(new_lines,'[]'::jsonb)) loop
    if coalesce((line->>'quantity')::numeric,0)<=0 or coalesce((line->>'unit_cost')::numeric,-1)<0 then raise exception 'Invalid cost value' using errcode='23514'; end if;
    if nullif(line->>'supply_id','') is not null and not exists(select 1 from public.supplies s where s.id=(line->>'supply_id')::uuid and s.organization_id=org_id and s.active) then raise exception 'Invalid supply' using errcode='23514'; end if;
    insert into public.item_cost_lines(organization_id,budget_item_id,kind,supply_id,description,quantity,unit,unit_cost,notes)
    values(org_id,target.id,coalesce(nullif(line->>'kind',''),'other'),nullif(line->>'supply_id','')::uuid,coalesce(nullif(btrim(line->>'description'),''),'Custo'),(line->>'quantity')::numeric,coalesce(nullif(line->>'unit',''),'un'),(line->>'unit_cost')::numeric,nullif(btrim(line->>'notes'),''));
  end loop;
  update public.budget_items set cost_total=coalesce((select round(sum(total_cost),2) from public.item_cost_lines where organization_id=org_id and budget_item_id=target.id),0),updated_at=now()
  where id=target.id returning * into updated;
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data)
  values(org_id,auth.uid(),'budget_items',target.id,'cost_composition_replaced',jsonb_build_object('cost_total',target.cost_total),jsonb_build_object('cost_total',updated.cost_total,'lines',new_lines));
  return updated;
end; $$;

revoke all on function public.replace_budget_item_cost_lines(uuid,uuid,jsonb) from public,anon;
grant execute on function public.replace_budget_item_cost_lines(uuid,uuid,jsonb) to authenticated;

commit;
