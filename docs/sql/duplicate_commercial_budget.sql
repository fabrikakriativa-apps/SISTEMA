create or replace function public.duplicate_commercial_budget(org_id uuid,source_budget_id uuid)
returns public.budgets language plpgsql security definer set search_path='' as $$
declare source public.budgets; copied public.budgets; item public.budget_items; new_item_id uuid;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into source from public.budgets where id=source_budget_id and organization_id=org_id for update;
 if source.id is null then raise exception 'Budget not found' using errcode='P0002'; end if;
 copied:=public.create_commercial_draft(org_id,source.document_type);
 update public.budgets set client_id=source.client_id,recipient_client_id=source.recipient_client_id,
 client_address=source.client_address,client_address_edited=source.client_address_edited,
 payment_terms=source.payment_terms,delivery_terms=source.delivery_terms,notes=source.notes,
 internal_notes=source.internal_notes,discount=source.discount where id=copied.id;
 for item in select * from public.budget_items where budget_id=source.id and organization_id=org_id order by position loop
  insert into public.budget_items(organization_id,budget_id,family_id,position,presentation,group_name,environment,description,internal_notes,quantity,configuration,cost_total,margin_percent,sale_total,affects_total)
  values(org_id,copied.id,item.family_id,item.position,item.presentation,item.group_name,item.environment,item.description,item.internal_notes,item.quantity,item.configuration,item.cost_total,item.margin_percent,item.sale_total,item.affects_total) returning id into new_item_id;
  insert into public.item_cost_lines(organization_id,budget_item_id,kind,supply_id,supplier_id,description,quantity,unit,unit_cost,notes,labor_days,labor_start_date)
  select org_id,new_item_id,kind,supply_id,supplier_id,description,quantity,unit,unit_cost,notes,labor_days,labor_start_date from public.item_cost_lines where budget_item_id=item.id and organization_id=org_id;
  insert into public.budget_item_payment_options(organization_id,budget_item_id,position,description,adjustment_percent,final_value,observation)
  select org_id,new_item_id,position,description,adjustment_percent,final_value,observation from public.budget_item_payment_options where budget_item_id=item.id and organization_id=org_id;
 end loop;
 select * into copied from public.budgets where id=copied.id;
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,after_data) values(org_id,auth.uid(),'budgets',copied.id,'duplicated',jsonb_build_object('source_budget_id',source.id,'display_number',copied.display_number));
 return copied;
end $$;
revoke all on function public.duplicate_commercial_budget(uuid,uuid) from public,anon;
grant execute on function public.duplicate_commercial_budget(uuid,uuid) to authenticated;
