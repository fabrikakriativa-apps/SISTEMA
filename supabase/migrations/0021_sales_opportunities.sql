begin;
create type public.opportunity_stage as enum ('new','contacted','qualified','budgeting','won','lost');
create table public.sales_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check(length(btrim(name))>0),
  phone text, email text, origin text, notes text,
  stage public.opportunity_stage not null default 'new',
  estimated_value numeric(14,2) check(estimated_value is null or estimated_value>=0),
  next_follow_up_at timestamptz,
  client_id uuid references public.clients(id),
  budget_id uuid references public.budgets(id),
  lost_reason text, archived_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint sales_opportunities_org_id_key unique(organization_id,id),
  constraint sales_opportunities_client_org_fk foreign key(organization_id,client_id) references public.clients(organization_id,id),
  constraint sales_opportunities_budget_org_fk foreign key(organization_id,budget_id) references public.budgets(organization_id,id),
  constraint sales_opportunities_lost_reason check(stage<>'lost' or length(btrim(coalesce(lost_reason,'')))>=5)
);
create index sales_opportunities_org_stage_idx on public.sales_opportunities(organization_id,stage,next_follow_up_at);
alter table public.sales_opportunities enable row level security;
revoke all on table public.sales_opportunities from public,anon,authenticated;
grant select,insert,update on public.sales_opportunities to authenticated;
create policy "opportunity member read" on public.sales_opportunities for select to authenticated
using(private.has_org_role(organization_id,array['admin','comercial']::public.app_role[]));
create policy "opportunity commercial insert" on public.sales_opportunities for insert to authenticated
with check(created_by=(select auth.uid()) and private.has_org_role(organization_id,array['admin','comercial']::public.app_role[]));
create policy "opportunity commercial update" on public.sales_opportunities for update to authenticated
using(private.has_org_role(organization_id,array['admin','comercial']::public.app_role[]))
with check(private.has_org_role(organization_id,array['admin','comercial']::public.app_role[]));
create function private.guard_sales_opportunity() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id or new.created_by is distinct from old.created_by then raise exception 'Opportunity identity cannot change' using errcode='23514'; end if;
  new.created_at:=old.created_at;
 else new.created_by:=auth.uid(); new.created_at:=now(); end if;
 new.updated_at:=now();
 return new;
end $$;
revoke all on function private.guard_sales_opportunity() from public,anon,authenticated;
create trigger sales_opportunities_guard before insert or update on public.sales_opportunities for each row execute function private.guard_sales_opportunity();
commit;
