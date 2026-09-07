begin;
create or replace function public.change_budget_status(org_id uuid,target_budget_id uuid,new_status public.budget_status,change_reason text default null)
returns public.budgets language plpgsql security definer set search_path='' as $$
declare target public.budgets; updated public.budgets;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into target from public.budgets where id=target_budget_id and organization_id=org_id for update;
 if target.id is null then raise exception 'Budget not found' using errcode='P0002'; end if;
 if target.status=new_status then return target; end if;
 if new_status='sent' then return public.mark_budget_sent(org_id,target_budget_id); end if;
 if new_status='draft' and target.status='rejected' then
  update public.budgets set status='draft',current_revision=current_revision+1,updated_at=now() where id=target.id returning * into updated;
 elsif new_status='rejected' and target.status='sent' then
  if length(btrim(coalesce(change_reason,'')))<5 then raise exception 'Reason required' using errcode='23514'; end if;
  update public.budgets set status='rejected',updated_at=now() where id=target.id returning * into updated;
 elsif new_status='cancelled' and target.status in ('draft','sent','rejected') then
  if length(btrim(coalesce(change_reason,'')))<5 then raise exception 'Reason required' using errcode='23514'; end if;
  update public.budgets set status='cancelled',updated_at=now() where id=target.id returning * into updated;
 else raise exception 'Invalid budget status transition' using errcode='23514';
 end if;
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data,reason)
 values(org_id,auth.uid(),'budgets',target.id,'status_changed',to_jsonb(target),to_jsonb(updated),nullif(btrim(coalesce(change_reason,'')),''));
 return updated;
end $$;
revoke all on function public.change_budget_status(uuid,uuid,public.budget_status,text) from public,anon;
grant execute on function public.change_budget_status(uuid,uuid,public.budget_status,text) to authenticated;
commit;
