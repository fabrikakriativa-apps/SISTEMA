CREATE OR REPLACE FUNCTION public.revise_approved_specifications(org_id uuid, target_budget_id uuid, new_notes text, item_descriptions jsonb)
 RETURNS budgets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target public.budgets; updated public.budgets; entry jsonb; item_id uuid;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into target from public.budgets where id=target_budget_id and organization_id=org_id for update;
 if target.id is null or target.status<>'approved' then raise exception 'Approved budget required' using errcode='23514'; end if;
 if jsonb_typeof(item_descriptions)<>'array' then raise exception 'Invalid descriptions' using errcode='23514'; end if;
 insert into public.budget_versions(organization_id,budget_id,revision,snapshot,created_by)
 values(org_id,target.id,target.current_revision,jsonb_build_object('budget',to_jsonb(target),'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.position) from public.budget_items i where budget_id=target.id and organization_id=org_id),'[]'::jsonb)),auth.uid()) on conflict(budget_id,revision) do nothing;
 perform set_config('fabrika.specification_revision','on',true);
 for entry in select value from jsonb_array_elements(item_descriptions) loop
  item_id:=(entry->>'id')::uuid;
  if not exists(select 1 from public.budget_items where id=item_id and budget_id=target.id and organization_id=org_id) or length(btrim(coalesce(entry->>'description','')))=0 then raise exception 'Invalid item description' using errcode='23514'; end if;
  update public.budget_items set description=entry->>'description' where id=item_id and organization_id=org_id;
  update public.order_items set snapshot=jsonb_set(snapshot,'{description}',to_jsonb(entry->>'description')),updated_at=now() where budget_item_id=item_id and organization_id=org_id and order_id in (select id from public.orders where budget_id=target.id and organization_id=org_id and status<>'cancelled');
 end loop;
 perform set_config('fabrika.specification_revision','off',true);
 update public.budgets set notes=new_notes,current_revision=greatest(target.current_revision, coalesce((select max(v.revision) from public.budget_versions v where v.budget_id=target.id),0))+1,updated_at=now() where id=target.id returning * into updated;
 insert into public.budget_versions(organization_id,budget_id,revision,snapshot,created_by)
 values(org_id,target.id,updated.current_revision,jsonb_build_object('budget',to_jsonb(updated),'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.position) from public.budget_items i where budget_id=target.id and organization_id=org_id),'[]'::jsonb)),auth.uid());
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data) values(org_id,auth.uid(),'budgets',target.id,'specifications_revised',to_jsonb(target),to_jsonb(updated));
 return updated;
end $function$
;