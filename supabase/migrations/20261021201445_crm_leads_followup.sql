-- Additive CRM upgrade. Existing contacts without proof of purchase remain legacy.
alter table public.clients add column crm_lifecycle text not null default 'legacy'
 check(crm_lifecycle in ('legacy','lead','customer'));
alter table public.clients alter column crm_lifecycle set default 'lead';
alter table public.clients add column customer_since timestamptz;
alter table public.sales_opportunities add column commercial_phase text
 check(commercial_phase in ('new','contacted','preparing','proposal_sent','negotiating','won','lost'));
alter table public.sales_opportunities add column assigned_to uuid;
alter table public.sales_opportunities add constraint opportunity_assignee_org_fk foreign key(organization_id,assigned_to) references public.memberships(organization_id,user_id);
create index opportunity_assignee_due_idx on public.sales_opportunities(organization_id,assigned_to,next_follow_up_at) where archived_at is null;

create table public.sales_followup_settings(
 organization_id uuid primary key references public.organizations(id),
 first_contact_days integer not null default 1 check(first_contact_days between 1 and 90),
 follow_up_days integer not null default 3 check(follow_up_days between 1 and 90)
);
alter table public.sales_followup_settings enable row level security;
revoke all on public.sales_followup_settings from public,anon,authenticated;
grant select,insert,update on public.sales_followup_settings to authenticated;
create policy followup_settings_read on public.sales_followup_settings for select to authenticated using(private.has_org_role(organization_id,array['admin','comercial']::public.app_role[]));
create policy followup_settings_insert on public.sales_followup_settings for insert to authenticated with check(private.has_org_role(organization_id,array['admin']::public.app_role[]));
create policy followup_settings_update on public.sales_followup_settings for update to authenticated using(private.has_org_role(organization_id,array['admin']::public.app_role[])) with check(private.has_org_role(organization_id,array['admin']::public.app_role[]));

create table public.sales_contact_activities(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 opportunity_id uuid not null,
 kind text not null default 'contact' check(kind in ('contact','system')),
 occurred_at timestamptz not null default now(),
 channel text not null check(channel in ('whatsapp','email','phone','meeting','other','system')),
 direction text not null check(direction in ('outbound','inbound','system')),
 outcome text not null check(outcome in ('answered','no_response','requested_return','stage')),
 notes text check(length(notes)<=2000),
 next_follow_up_at timestamptz,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 foreign key(organization_id,opportunity_id) references public.sales_opportunities(organization_id,id),
 check(kind='system' or (channel<>'system' and direction<>'system' and outcome<>'stage' and created_by is not null)),
 check(direction<>'inbound' or outcome<>'no_response')
);
create index sales_activities_opportunity_time_idx on public.sales_contact_activities(organization_id,opportunity_id,occurred_at desc);
create index sales_activities_actor_idx on public.sales_contact_activities(created_by);
alter table public.sales_contact_activities enable row level security;
revoke all on public.sales_contact_activities from public,anon,authenticated;
grant select,insert on public.sales_contact_activities to authenticated;
create policy sales_activities_read on public.sales_contact_activities for select to authenticated using(private.has_org_role(organization_id,array['admin','comercial']::public.app_role[]));
create policy sales_activities_insert on public.sales_contact_activities for insert to authenticated with check(kind='contact' and created_by=(select auth.uid()) and private.has_org_role(organization_id,array['admin','comercial']::public.app_role[]));

create function private.is_sales_assignee(org_id uuid,actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) and exists(select 1 from public.memberships m where m.organization_id=org_id and m.user_id=actor and m.active and m.role in ('admin','comercial'));
$$;
revoke all on function private.is_sales_assignee(uuid,uuid) from public,anon;
grant execute on function private.is_sales_assignee(uuid,uuid) to authenticated;

create function private.prepare_crm_opportunity() returns trigger language plpgsql security invoker set search_path='' as $$
declare bought public.orders; doc public.budgets; first_days int; follow_days int;
begin
 new.assigned_to:=coalesce(new.assigned_to,new.created_by,auth.uid());
 if new.assigned_to is not null and not private.is_sales_assignee(new.organization_id,new.assigned_to) then raise exception 'Responsável comercial inválido.'; end if;
 select * into bought from public.orders o where o.organization_id=new.organization_id and o.status<>'cancelled' and (o.budget_id=new.budget_id or o.budget_id=any(new.related_budget_ids)) order by o.created_at limit 1;
 select * into doc from public.budgets b where b.organization_id=new.organization_id and (b.id=new.budget_id or b.id=any(new.related_budget_ids)) and b.client_id is not null order by b.created_at desc limit 1;
 new.client_id:=coalesce(new.client_id,bought.client_id,doc.client_id);
 if tg_op='INSERT' and new.client_id is null then
  insert into public.clients(organization_id,name,phone,email,origin,client_type,created_by)
  values(new.organization_id,new.name,nullif(btrim(new.phone),''),nullif(btrim(new.email),''),new.origin,'Cliente final',auth.uid()) returning id into new.client_id;
 elsif tg_op='INSERT' and exists(select 1 from public.clients c where c.id=new.client_id and c.organization_id=new.organization_id and c.crm_lifecycle='customer' and (c.customer_since at time zone 'America/Sao_Paulo')::date<coalesce(new.received_on,(now() at time zone 'America/Sao_Paulo')::date)) then
  new.customer_kind:='repeat';
 end if;
 new.commercial_phase:=coalesce(new.commercial_phase,case new.stage when 'budgeting' then 'preparing' when 'won' then 'won' when 'lost' then 'lost' when 'new' then 'new' else 'contacted' end);
 if bought.id is not null then
  if new.client_id is not null and new.client_id<>bought.client_id then raise exception 'O cliente do pedido não corresponde ao contato vinculado.'; end if;
  new.client_id:=bought.client_id;new.stage:='won';new.commercial_phase:='won';new.next_follow_up_at:=null;
 elsif new.stage='lost' then new.commercial_phase:='lost';new.next_follow_up_at:=null;
 elsif new.archived_at is not null then new.next_follow_up_at:=null;
 else
  select * into doc from public.budgets b where b.organization_id=new.organization_id and (b.id=new.budget_id or b.id=any(new.related_budget_ids)) and b.status in ('draft','sent','approved') order by case when b.status in ('sent','approved') then 0 else 1 end,b.created_at desc limit 1;
  if doc.id is not null and new.commercial_phase in ('new','contacted','preparing') then
   new.commercial_phase:=case when doc.status in ('sent','approved') then 'proposal_sent' else 'preparing' end;new.stage:='budgeting';
  end if;
  select s.first_contact_days,s.follow_up_days into first_days,follow_days from public.sales_followup_settings s where s.organization_id=new.organization_id;
  if tg_op='INSERT' and new.next_follow_up_at is null then new.next_follow_up_at:=now()+make_interval(days=>coalesce(first_days,1)); end if;
 end if;
 return new;
end $$;
revoke all on function private.prepare_crm_opportunity() from public,anon,authenticated;
create trigger zz_prepare_crm_opportunity before insert or update on public.sales_opportunities for each row execute function private.prepare_crm_opportunity();

-- Internal trigger only: confirmation RPCs already enforce organization roles.
create function private.sync_crm_documents() returns trigger language plpgsql security definer set search_path='' as $$
declare doc_id uuid; days int;
begin
 if tg_table_schema<>'public' or tg_table_name not in ('orders','budgets') then raise exception 'Invalid CRM source'; end if;
 if auth.uid() is not null and not private.has_org_role(new.organization_id,array['admin','comercial']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 if tg_table_name='orders' then
  if new.status='cancelled' then return new; end if;
  update public.clients set crm_lifecycle='customer',customer_since=coalesce(customer_since,new.created_at) where id=new.client_id and organization_id=new.organization_id and (crm_lifecycle<>'customer' or customer_since is null);
  doc_id:=new.budget_id;
  update public.sales_opportunities set stage='won',commercial_phase='won',next_follow_up_at=null where organization_id=new.organization_id and archived_at is null and (budget_id=doc_id or doc_id=any(related_budget_ids));
 else
  if new.status not in ('draft','sent','approved') then return new; end if;
  select follow_up_days into days from public.sales_followup_settings where organization_id=new.organization_id;
  update public.sales_opportunities set commercial_phase=case when new.status in ('sent','approved') then 'proposal_sent' else 'preparing' end,stage='budgeting',
   response_status=case when new.status='sent' then 'waiting' else response_status end,
   next_follow_up_at=case when new.status='sent' and (next_follow_up_at is null or next_follow_up_at<now()) then now()+make_interval(days=>coalesce(days,3)) else next_follow_up_at end
   where organization_id=new.organization_id and archived_at is null and stage not in ('won','lost') and commercial_phase is distinct from 'negotiating' and (budget_id=new.id or new.id=any(related_budget_ids));
 end if;
 return new;
end $$;
revoke all on function private.sync_crm_documents() from public,anon,authenticated;
create trigger crm_order_confirmed after insert or update of status on public.orders for each row execute function private.sync_crm_documents();
create trigger crm_budget_progress after insert or update of status on public.budgets for each row execute function private.sync_crm_documents();

create function private.record_crm_phase() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_schema<>'public' or tg_table_name<>'sales_opportunities' then raise exception 'Invalid CRM source'; end if;
 if tg_op='INSERT' or new.commercial_phase is distinct from old.commercial_phase then
  insert into public.sales_contact_activities(organization_id,opportunity_id,kind,channel,direction,outcome,notes,created_by)
  values(new.organization_id,new.id,'system','system','system','stage','Etapa: '||new.commercial_phase,auth.uid());
 end if;
 return new;
end $$;
revoke all on function private.record_crm_phase() from public,anon,authenticated;
create trigger crm_phase_history after insert or update on public.sales_opportunities for each row execute function private.record_crm_phase();

create function public.register_sales_contact(org_id uuid,target_opportunity_id uuid,activity_id uuid,contact_at timestamptz,contact_channel text,contact_direction text,contact_outcome text,contact_notes text,next_return_at timestamptz default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare lead public.sales_opportunities; days int; due timestamptz; existing public.sales_contact_activities;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into lead from public.sales_opportunities where id=target_opportunity_id and organization_id=org_id for update;
 if lead.id is null or lead.archived_at is not null then raise exception 'Oportunidade indisponível.'; end if;
 select * into existing from public.sales_contact_activities where id=activity_id;
 if existing.id is not null then
  if existing.organization_id<>org_id or existing.opportunity_id<>target_opportunity_id or existing.created_by<>auth.uid() then raise exception 'Identificador de contato inválido.'; end if;
  return existing.id;
 end if;
 if contact_at is null or contact_at>now()+interval '1 minute' then raise exception 'Informe uma data de contato válida, não futura.'; end if;
 if contact_channel not in ('whatsapp','email','phone','meeting','other') or contact_direction not in ('outbound','inbound') or contact_outcome not in ('answered','no_response','requested_return') or (contact_direction='inbound' and contact_outcome='no_response') then raise exception 'Contato inválido.'; end if;
 if next_return_at is not null and next_return_at<=now() then raise exception 'O próximo retorno deve estar no futuro.'; end if;
 select follow_up_days into days from public.sales_followup_settings where organization_id=org_id;
 due:=case when lead.stage in ('won','lost') then null else coalesce(next_return_at,now()+make_interval(days=>coalesce(days,3))) end;
 insert into public.sales_contact_activities(id,organization_id,opportunity_id,occurred_at,channel,direction,outcome,notes,next_follow_up_at,created_by)
 values(activity_id,org_id,target_opportunity_id,contact_at,contact_channel,contact_direction,contact_outcome,nullif(btrim(contact_notes),''),due,auth.uid());
 update public.sales_opportunities set next_follow_up_at=due,stage=case when stage='new' then 'contacted' else stage end,
  commercial_phase=case when commercial_phase='new' then 'contacted' when commercial_phase='proposal_sent' and contact_outcome<>'no_response' then 'negotiating' else commercial_phase end,
  response_status=case when contact_outcome='no_response' then 'waiting' else 'active' end where id=lead.id and organization_id=org_id;
 return activity_id;
end $$;
revoke all on function public.register_sales_contact(uuid,uuid,uuid,timestamptz,text,text,text,text,timestamptz) from public,anon;
grant execute on function public.register_sales_contact(uuid,uuid,uuid,timestamptz,text,text,text,text,timestamptz) to authenticated;

-- Preserve pre-existing partner links during lifecycle-only updates; all other catalog validation is unchanged.
CREATE OR REPLACE FUNCTION private.guard_catalog()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op='UPDATE' then
    if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id then
      raise exception 'Record identity and organization cannot change' using errcode='23514';
    end if;
    new.created_at:=old.created_at;
  else
    new.created_at:=now();
  end if;
  if tg_table_name='clients' then
    if tg_op='INSERT' then new.created_by:=auth.uid(); else new.created_by:=old.created_by; end if;
    if new.master_client_id is not null and not (tg_op='UPDATE' and (to_jsonb(new)-array['crm_lifecycle','customer_since','updated_at'])=(to_jsonb(old)-array['crm_lifecycle','customer_since','updated_at'])) and not exists(
      select 1 from public.clients c where c.id=new.master_client_id
      and c.organization_id=new.organization_id and c.client_type='Parceiro/master' and c.archived_at is null
    ) then raise exception 'Invalid partner for client' using errcode='23514'; end if;
  end if;
  new.updated_at:=now();
  return new;
end $function$;

-- Only proven purchasers are classified. No dates, profiles or documents rewritten.
update public.clients c set crm_lifecycle='customer',customer_since=p.first_purchase from
 (select organization_id,client_id,min(created_at) first_purchase from public.orders where status<>'cancelled' group by organization_id,client_id)p
 where c.organization_id=p.organization_id and c.id=p.client_id;

-- Narrow organization-scoped directory: names only, no email or auth metadata.
create function public.list_sales_assignees(org_id uuid) returns table(user_id uuid,full_name text) language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 return query select m.user_id,p.full_name from public.memberships m join public.profiles p on p.id=m.user_id where m.organization_id=org_id and m.active and m.role in ('admin','comercial') order by p.full_name;
end $$;
revoke all on function public.list_sales_assignees(uuid) from public,anon;
grant execute on function public.list_sales_assignees(uuid) to authenticated;

