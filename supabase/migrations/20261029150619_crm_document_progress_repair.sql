-- Link native documents even when the contact predates CRM automation.
-- Never guess between multiple active opportunities or revive an archived one.
create function private.ensure_crm_budget_link(document_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare doc public.budgets; contact public.clients; candidate uuid; candidates int; kind text; entered date;
begin
 select * into doc from public.budgets where id=document_id;
 if doc.id is null or doc.client_id is null or doc.created_by is null or doc.status not in ('draft','sent','approved','no_response') then return;end if;
 if auth.uid() is null or not private.has_org_role(doc.organization_id,array['admin','comercial']::public.app_role[]) then return;end if;
 if nullif(current_setting('app.explicit_sales_opportunity',true),'') is not null then return;end if;
 perform pg_advisory_xact_lock(hashtextextended('crm-client:'||doc.client_id::text,0));
 if exists(select 1 from public.sales_opportunities s where s.organization_id=doc.organization_id and (s.budget_id=doc.id or doc.id=any(s.related_budget_ids))) then return;end if;
 select * into contact from public.clients c where c.id=doc.client_id and c.organization_id=doc.organization_id and c.archived_at is null;
 if contact.id is null then return;end if;
 select count(*),(array_agg(s.id))[1] into candidates,candidate from public.sales_opportunities s
 where s.organization_id=doc.organization_id and s.client_id=doc.client_id and s.archived_at is null and s.stage not in ('won','lost');
 if candidates=1 then
  update public.sales_opportunities set budget_id=coalesce(budget_id,doc.id),related_budget_ids=case when budget_id is null then related_budget_ids else array_append(related_budget_ids,doc.id) end
  where id=candidate and organization_id=doc.organization_id;
 elsif candidates=0 then
  -- A cancelled registration is not an invitation to recreate it automatically.
  if exists(select 1 from public.sales_opportunities s where s.organization_id=doc.organization_id and s.client_id=doc.client_id and s.archived_at is not null) then return;end if;
  kind:='unknown';entered:=null;
  if exists(select 1 from public.orders o where o.organization_id=doc.organization_id and o.client_id=doc.client_id and o.status<>'cancelled' and o.created_at<doc.created_at) then
   kind:='repeat';entered:=(doc.created_at at time zone 'America/Sao_Paulo')::date;
  elsif contact.created_by is not null and not exists(select 1 from public.sales_opportunities s where s.organization_id=doc.organization_id and s.client_id=doc.client_id) then
   kind:='new_lead';entered:=(contact.created_at at time zone 'America/Sao_Paulo')::date;
  end if;
  insert into public.sales_opportunities(organization_id,client_id,name,phone,email,origin,created_by,budget_id,received_on,customer_kind,stage,commercial_phase)
  values(doc.organization_id,contact.id,contact.name,contact.phone,contact.email,contact.origin,auth.uid(),doc.id,entered,kind,'budgeting','preparing') returning id into candidate;
 end if;
 if candidate is not null then
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,after_data)
  values(doc.organization_id,auth.uid(),'sales_opportunities',candidate,'automatic_budget_link',jsonb_build_object('budget_id',doc.id));
 end if;
end $$;
revoke all on function private.ensure_crm_budget_link(uuid) from public,anon,authenticated;

create or replace function private.crm_link_unique_budget() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.ensure_crm_budget_link(new.id);
 return new;
end $$;
revoke all on function private.crm_link_unique_budget() from public,anon,authenticated;
drop trigger crm_link_unique_budget on public.budgets;
-- PostgreSQL runs same-kind triggers alphabetically: link first, then progress.
create trigger crm_automatic_budget_link after insert or update of client_id,status on public.budgets for each row execute function private.crm_link_unique_budget();

create or replace function private.sync_crm_documents() returns trigger language plpgsql security definer set search_path='' as $$
declare doc_id uuid; days int;
begin
 if tg_table_schema<>'public' or tg_table_name not in ('orders','budgets') then raise exception 'Invalid CRM source';end if;
 if auth.uid() is not null and not private.has_org_role(new.organization_id,array['admin','comercial']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501';end if;
 if tg_table_name='orders' then
  if new.status='cancelled' then return new;end if;
  update public.clients set crm_lifecycle='customer',customer_since=coalesce(customer_since,new.created_at) where id=new.client_id and organization_id=new.organization_id and (crm_lifecycle<>'customer' or customer_since is null);
  doc_id:=new.budget_id;
  update public.sales_opportunities set stage='won',commercial_phase='won',next_follow_up_at=null where organization_id=new.organization_id and archived_at is null and (budget_id=doc_id or doc_id=any(related_budget_ids));
 else
  if new.status not in ('draft','sent','approved','no_response') then return new;end if;
  select follow_up_days into days from public.sales_followup_settings where organization_id=new.organization_id;
  update public.sales_opportunities set
   commercial_phase=case when new.status in ('sent','approved','no_response') or commercial_phase='proposal_sent' then 'proposal_sent' else 'preparing' end,
   stage='budgeting',
   response_status=case when new.status='no_response' then 'no_response' when new.status='sent' then 'waiting' else response_status end,
   next_follow_up_at=case when new.status='sent' and next_follow_up_at is null then now()+make_interval(days=>coalesce(days,3)) else next_follow_up_at end
   where organization_id=new.organization_id and archived_at is null and stage not in ('won','lost')
   and coalesce(commercial_phase,'') not in ('negotiating','won','lost') and (budget_id=new.id or new.id=any(related_budget_ids));
 end if;
 return new;
end $$;
revoke all on function private.sync_crm_documents() from public,anon,authenticated;
drop trigger crm_budget_progress on public.budgets;
create trigger crm_budget_progress after insert or update of status,client_id on public.budgets for each row execute function private.sync_crm_documents();

-- Preserve the existing opportunity guard and add a document-history floor.
-- A new draft revision is not a new, never-sent commercial opportunity.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('private.prepare_crm_opportunity()'::regprocedure);
 if position($needle$b.status in ('draft','sent','approved')$needle$ in definition)=0 or position($needle$doc.status in ('sent','approved')$needle$ in definition)=0 then raise exception 'Unexpected CRM guard definition';end if;
 definition:=replace(definition,$needle$b.status in ('draft','sent','approved')$needle$,$replacement$b.status in ('draft','sent','approved','no_response')$replacement$);
 definition:=replace(definition,$needle$doc.status in ('sent','approved')$needle$,$replacement$doc.status in ('sent','approved','no_response') or exists(select 1 from public.budgets hb where hb.organization_id=new.organization_id and (hb.id=new.budget_id or hb.id=any(new.related_budget_ids)) and hb.status in ('draft','sent','approved','no_response') and exists(select 1 from public.sales_tracking_history h where h.organization_id=new.organization_id and h.entity_type='budget' and h.entity_id=hb.id and h.state->>'status' in ('sent','approved','no_response')))$replacement$);
 execute definition;
end $$;

