-- Preserve the existing audited API boundary: audit_log has no client INSERT grant.
-- All writes remain role/tenant scoped; no additional table or role privileges.
create or replace function public.change_budget_status(org_id uuid,target_budget_id uuid,new_status public.budget_status,change_reason text default null)
returns public.budgets language plpgsql security definer set search_path='' as $$
declare target public.budgets; updated public.budgets; lead public.sales_opportunities; changed_lead public.sales_opportunities; closure public.audit_log; reason text:=nullif(btrim(coalesce(change_reason,'')),'');
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501';end if;
 select * into target from public.budgets where id=target_budget_id and organization_id=org_id for update;
 if target.id is null then raise exception 'Budget not found' using errcode='P0002';end if;
 if target.status=new_status then return target;end if;
 if new_status='sent' and target.status<>'no_response' then return public.mark_budget_sent(org_id,target_budget_id);end if;
 if exists(select 1 from public.orders where organization_id=org_id and budget_id=target.id and status<>'cancelled') then raise exception 'Documento com pedido ativo não pode ser encerrado ou reaberto aqui' using errcode='23514';end if;
 if new_status='no_response' and target.status='sent' then
  update public.budgets set status='no_response',status_reason=null,status_changed_at=now() where id=target.id returning * into updated;
  -- Keep follow-ups and profile intact; only reflect lack of response when no other live proposal is awaiting a decision.
  update public.sales_opportunities s set response_status='no_response'
   where s.organization_id=org_id and s.archived_at is null and s.stage not in ('won','lost')
   and (s.budget_id=target.id or target.id=any(s.related_budget_ids))
   and not exists(select 1 from public.budgets b where b.organization_id=org_id and (b.id=s.budget_id or b.id=any(s.related_budget_ids)) and b.status in ('draft','sent','approved'));
 elsif new_status='sent' and target.status='no_response' then
  update public.budgets set status='sent',status_reason=null,status_changed_at=now() where id=target.id returning * into updated;
 elsif new_status='draft' and (target.status='rejected' or (target.document_type='pre_budget' and target.status='sent')) then
  update public.budgets set status='draft',status_reason=null,status_changed_at=now(),current_revision=current_revision+1 where id=target.id returning * into updated;
 elsif new_status='rejected' and target.status in ('draft','sent','no_response') then
  if coalesce(length(reason),0)<5 then raise exception 'Informe um motivo com pelo menos 5 caracteres' using errcode='23514';end if;
  update public.budgets set status='rejected',status_reason=reason,status_changed_at=now() where id=target.id returning * into updated;
 elsif new_status='cancelled' and target.status in ('draft','sent','no_response','rejected') then
  if coalesce(length(reason),0)<5 then raise exception 'Informe um motivo com pelo menos 5 caracteres' using errcode='23514';end if;
  update public.budgets set status='cancelled',status_reason=reason,status_changed_at=now() where id=target.id returning * into updated;
 else raise exception 'Invalid budget status transition' using errcode='23514';end if;

 -- Never close another negotiation or a lead with another live proposal/order.
 if new_status='rejected' then
  for lead in select * from public.sales_opportunities s where s.organization_id=org_id and s.archived_at is null and s.stage not in ('won','lost') and (s.budget_id=target.id or target.id=any(s.related_budget_ids)) for update loop
   if not exists(select 1 from public.budgets b where b.organization_id=org_id and (b.id=lead.budget_id or b.id=any(lead.related_budget_ids)) and b.status not in ('rejected','cancelled'))
    and not exists(select 1 from public.orders o where o.organization_id=org_id and o.status<>'cancelled' and (o.budget_id=lead.budget_id or o.budget_id=any(lead.related_budget_ids))) then
    update public.sales_opportunities set stage='lost',commercial_phase='lost',lost_reason=reason,response_status=case when response_status='no_response' then 'active' else response_status end,next_follow_up_at=null where id=lead.id and organization_id=org_id returning * into changed_lead;
    insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data,reason) values(org_id,auth.uid(),'sales_opportunities',lead.id,'budget_marked_lost',to_jsonb(lead),jsonb_build_object('source_budget_id',target.id,'opportunity',to_jsonb(changed_lead)),reason);
   end if;
  end loop;
 elsif new_status='draft' and target.status='rejected' then
  for lead in select * from public.sales_opportunities s where s.organization_id=org_id and s.archived_at is null and s.stage='lost' and (s.budget_id=target.id or target.id=any(s.related_budget_ids)) for update loop
   select * into closure from public.audit_log a where a.organization_id=org_id and a.entity_type='sales_opportunities' and a.entity_id=lead.id and a.action='budget_marked_lost' order by a.created_at desc,a.id desc limit 1;
   -- A subsequent manual CRM change must not be undone by reopening a document.
   if closure.after_data->>'source_budget_id'=target.id::text and closure.after_data->'opportunity'=to_jsonb(lead) then
    update public.sales_opportunities set stage='budgeting',commercial_phase='preparing',lost_reason=null,response_status='active',next_follow_up_at=null where id=lead.id and organization_id=org_id returning * into changed_lead;
    insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data,reason) values(org_id,auth.uid(),'sales_opportunities',lead.id,'budget_reopened',to_jsonb(lead),to_jsonb(changed_lead),'Orçamento reaberto');
   end if;
  end loop;
 end if;
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data,reason) values(org_id,auth.uid(),'budgets',target.id,'status_changed',to_jsonb(target),to_jsonb(updated),reason);
 return updated;
end $$;
revoke all on function public.change_budget_status(uuid,uuid,public.budget_status,text) from public,anon;
grant execute on function public.change_budget_status(uuid,uuid,public.budget_status,text) to authenticated;
