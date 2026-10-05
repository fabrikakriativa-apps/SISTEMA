begin;
alter table public.orders add column if not exists manual_status boolean not null default true;
alter table public.procurement_needs add column if not exists deadline date;
create or replace function private.keep_manual_order_status() returns trigger language plpgsql set search_path='' as $$
begin
 if old.manual_status and new.status<>'cancelled' and current_setting('fabrika.manual_status_write',true) is distinct from 'on' then new.status:=old.status; end if;
 return new;
end $$;
revoke all on function private.keep_manual_order_status() from public,anon,authenticated;
create trigger order_manual_status_guard before update of status on public.orders for each row execute function private.keep_manual_order_status();

create or replace function public.set_order_manual_stage(org_id uuid,target_order_id uuid,target_item_ids uuid[],new_status public.order_status,new_scheduled_at timestamptz default null,new_issue_reason text default null)
returns public.orders language plpgsql security definer set search_path='' as $$
declare target public.orders; updated public.orders;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial','operacao']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into target from public.orders where id=target_order_id and organization_id=org_id for update;
 if target.id is null or target.status='cancelled' or new_status='cancelled' then raise exception 'Invalid order' using errcode='23514'; end if;
 if coalesce(cardinality(target_item_ids),0)=0 or (select count(*) from public.order_items where organization_id=org_id and order_id=target.id and id=any(target_item_ids) and status<>'cancelled')<>cardinality(target_item_ids) then raise exception 'Invalid items' using errcode='23514'; end if;
 if new_status='scheduled' and new_scheduled_at is null then raise exception 'Schedule required' using errcode='23514'; end if;
 if new_status='pending_issue' and length(btrim(coalesce(new_issue_reason,'')))<5 then raise exception 'Reason required' using errcode='23514'; end if;
 perform set_config('fabrika.manual_status_write','on',true);
 update public.order_items set status=new_status,scheduled_at=case when new_status='scheduled' then new_scheduled_at else scheduled_at end,completed_at=case when new_status='completed' then now() else null end,issue_reason=case when new_status='pending_issue' then new_issue_reason else null end,updated_at=now() where organization_id=org_id and order_id=target.id and id=any(target_item_ids);
 update public.orders set status=new_status,manual_status=true,updated_at=now() where id=target.id returning * into updated;
 perform set_config('fabrika.manual_status_write','off',true);
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data) values(org_id,auth.uid(),'orders',target.id,'manual_status_changed',to_jsonb(target),to_jsonb(updated));
 return updated;
end $$;
revoke all on function public.set_order_manual_stage(uuid,uuid,uuid[],public.order_status,timestamptz,text) from public,anon;
grant execute on function public.set_order_manual_stage(uuid,uuid,uuid[],public.order_status,timestamptz,text) to authenticated;

do $$
declare source text;
begin
 select pg_get_functiondef(oid) into source from pg_proc where pronamespace='public'::regnamespace and proname='set_order_delivery_details';
 source:=replace(source,'if new_promised_date is null then raise exception ''Promised date is required'' using errcode=''23514''; end if;','');
 execute source;
 select pg_get_functiondef(oid) into source from pg_proc where pronamespace='public'::regnamespace and proname='set_order_general_notes';
 source:=replace(source,'nullif(btrim(coalesce(new_notes,'''')),'''')','nullif(coalesce(new_notes,''''),'''')');
 execute source;
 select pg_get_functiondef(oid) into source from pg_proc where pronamespace='private'::regnamespace and proname='guard_order_item_procurement_status';
 source:=replace(source,'if new.status in (''awaiting_purchase'',''awaiting_supplier'',''preparing'') then','if new.status in (''awaiting_purchase'',''awaiting_supplier'',''preparing'') and not exists(select 1 from public.orders where id=new.order_id and manual_status) then');
 execute source;
 select pg_get_functiondef(oid) into source from pg_proc where pronamespace='private'::regnamespace and proname='recalculate_budget_from_items';
 source:=regexp_replace(source,'\mBEGIN\M','BEGIN if current_setting(''fabrika.specification_revision'',true)=''on'' and TG_OP=''UPDATE'' then return NEW; end if;','i');
 execute source;
 select pg_get_functiondef(oid) into source from pg_proc where pronamespace='public'::regnamespace and proname='mark_budget_sent';
 source:=replace(source,'if target.document_type<>''budget'' then raise exception ''Convert the pre-budget before sending'' using errcode=''23514''; end if;','');
 execute source;
 select pg_get_functiondef(oid) into source from pg_proc where pronamespace='public'::regnamespace and proname='change_budget_status';
 source:=replace(source,'new_status=''draft'' and target.status=''rejected''','new_status=''draft'' and (target.status=''rejected'' or (target.document_type=''pre_budget'' and target.status=''sent''))');
 execute source;
 select pg_get_functiondef(oid) into source from pg_proc where pronamespace='private'::regnamespace and proname='guard_budget_item';
 source:=replace(source,'b.status<>''draft''','(b.status<>''draft'' and not (b.status=''approved'' and current_setting(''fabrika.specification_revision'',true)=''on''))');
 execute source;
end $$;

create or replace function public.revise_approved_specifications(org_id uuid,target_budget_id uuid,new_notes text,item_descriptions jsonb)
returns public.budgets language plpgsql security definer set search_path='' as $$
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
 update public.budgets set notes=new_notes,current_revision=current_revision+1,updated_at=now() where id=target.id returning * into updated;
 insert into public.budget_versions(organization_id,budget_id,revision,snapshot,created_by)
 values(org_id,target.id,updated.current_revision,jsonb_build_object('budget',to_jsonb(updated),'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.position) from public.budget_items i where budget_id=target.id and organization_id=org_id),'[]'::jsonb)),auth.uid());
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data) values(org_id,auth.uid(),'budgets',target.id,'specifications_revised',to_jsonb(target),to_jsonb(updated));
 return updated;
end $$;
revoke all on function public.revise_approved_specifications(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.revise_approved_specifications(uuid,uuid,text,jsonb) to authenticated;

create or replace function public.save_procurement_need(org_id uuid,target_need_id uuid,target_order_item_id uuid,new_supply_id uuid,new_description text,new_quantity numeric,new_unit text,new_unit_cost numeric,new_deadline date,remove_need boolean default false)
returns public.procurement_needs language plpgsql security definer set search_path='' as $$
declare target public.procurement_needs; updated public.procurement_needs;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','compras','operacao','comercial']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 if target_need_id is not null then
 select * into target from public.procurement_needs where id=target_need_id and organization_id=org_id for update;
 if target.id is null or target.status not in ('awaiting_finance','awaiting_purchase') or exists(select 1 from public.purchase_items where procurement_need_id=target.id and status not in ('cancelled','returned')) then raise exception 'Need already purchased' using errcode='23514'; end if;
 end if;
 if remove_need then
  if target.id is null then raise exception 'Need required' using errcode='23514'; end if;
  update public.procurement_needs set status='cancelled',updated_at=now() where id=target.id returning * into updated;
 else
 if not exists(select 1 from public.order_items i join public.orders o on o.id=i.order_id where i.id=target_order_item_id and i.organization_id=org_id and o.organization_id=org_id and o.status not in ('cancelled','completed')) then raise exception 'Invalid order item' using errcode='23514'; end if;
 if new_supply_id is not null and not exists(select 1 from public.supplies where id=new_supply_id and organization_id=org_id and active) then raise exception 'Invalid supply' using errcode='23514'; end if;
 if coalesce(new_quantity,0)<=0 or coalesce(new_unit_cost,-1)<0 or length(btrim(coalesce(new_description,'')))=0 or length(btrim(coalesce(new_unit,'')))=0 then raise exception 'Invalid need' using errcode='23514'; end if;
 if target.id is null then
 insert into public.procurement_needs(organization_id,order_item_id,supply_id,kind,description,quantity,unit,unit_cost,deadline,status)
 values(org_id,target_order_item_id,new_supply_id,case when new_supply_id is null then 'whole_item' else 'supply' end,new_description,new_quantity,new_unit,new_unit_cost,new_deadline,'awaiting_purchase') returning * into updated;
 else
 update public.procurement_needs set order_item_id=target_order_item_id,supply_id=new_supply_id,kind=case when new_supply_id is null then 'whole_item' else 'supply' end,description=new_description,quantity=new_quantity,unit=new_unit,unit_cost=new_unit_cost,deadline=new_deadline,updated_at=now() where id=target.id returning * into updated;
 end if;
 end if;
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data) values(org_id,auth.uid(),'procurement_needs',updated.id,case when remove_need then 'removed' else 'saved' end,to_jsonb(target),to_jsonb(updated));
 return updated;
end $$;
revoke all on function public.save_procurement_need(uuid,uuid,uuid,uuid,text,numeric,text,numeric,date,boolean) from public,anon;
grant execute on function public.save_procurement_need(uuid,uuid,uuid,uuid,text,numeric,text,numeric,date,boolean) to authenticated;
commit;
