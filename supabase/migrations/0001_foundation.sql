-- DRAFT: isolated database validation is required before any production deployment.
begin;
create extension if not exists pgcrypto;
create schema if not exists private;

create type public.app_role as enum ('admin','comercial','compras','financeiro','operacao');
create type public.record_status as enum ('active','inactive','cancelled');
create type public.budget_status as enum ('draft','sent','approved','rejected','cancelled');
create type public.order_status as enum ('awaiting_finance','awaiting_purchase','awaiting_supplier','preparing','ready_to_schedule','scheduled','partially_completed','completed','pending_issue','cancelled');
create type public.financial_status as enum ('open','partial','settled','overdue','cancelled','reversed');

create table public.organizations (
  id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
  created_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, email text, avatar_url text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null, active boolean not null default true,
  primary key (organization_id,user_id)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  client_type text not null check(client_type in ('Cliente final','Parceiro/master')), master_client_id uuid references public.clients(id),
  name text not null, document text, email text, phone text, address text, city text, origin text, notes text,
  archived_at timestamptz, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index clients_org_name_idx on public.clients(organization_id,name);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  name text not null, document text, email text, phone text, supplier_types text[] not null default '{}', notes text,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.supplies (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  code text not null, name text not null, category text not null default '', brand text, reference text,
  purchase_unit text not null, usage_unit text not null, conversion_factor numeric(14,6) not null default 1,
  current_cost numeric(14,2) not null default 0 check(current_cost>=0), active boolean not null default true,
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,code)
);
create table public.supply_suppliers (
  organization_id uuid not null references public.organizations(id),
  supply_id uuid not null references public.supplies(id) on delete cascade, supplier_id uuid not null references public.suppliers(id) on delete cascade,
  supplier_reference text, latest_cost numeric(14,2), is_primary boolean not null default false, updated_at timestamptz not null default now(),
  primary key(supply_id,supplier_id)
);
create table public.supply_price_history (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  supply_id uuid not null references public.supplies(id) on delete cascade, supplier_id uuid references public.suppliers(id),
  value numeric(14,2) not null check(value>=0), effective_at date not null default current_date, source text, created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);

create table public.item_families (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  code text not null, name text not null, form_key text not null, active boolean not null default true,
  unique(organization_id,code)
);
create table public.budgets (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  number bigint not null, display_number text not null, current_revision integer not null default 1,
  client_id uuid references public.clients(id), recipient_client_id uuid references public.clients(id),
  status public.budget_status not null default 'draft', valid_until date, payment_terms text, delivery_terms text,
  notes text, internal_notes text, subtotal numeric(14,2) not null default 0, discount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0, created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,number)
);
create index budgets_org_number_idx on public.budgets(organization_id,number desc);
create table public.budget_versions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  budget_id uuid not null references public.budgets(id), revision integer not null, snapshot jsonb not null,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), unique(budget_id,revision)
);
create table public.budget_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  budget_id uuid not null references public.budgets(id) on delete cascade, family_id uuid references public.item_families(id),
  position integer not null, presentation text not null default 'principal', group_name text, environment text,
  description text not null, internal_notes text, quantity numeric(14,3) not null default 1,
  configuration jsonb not null default '{}', cost_total numeric(14,2) not null default 0,
  margin_percent numeric(8,3), sale_total numeric(14,2) not null default 0, affects_total boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.item_cost_lines (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  budget_item_id uuid not null references public.budget_items(id) on delete cascade,
  kind text not null check(kind in ('supply','product','service','freight','installation','other')),
  supply_id uuid references public.supplies(id), supplier_id uuid references public.suppliers(id), description text not null,
  quantity numeric(14,4) not null default 1, unit text not null default 'un', unit_cost numeric(14,2) not null default 0,
  total_cost numeric(14,2) generated always as (round(quantity*unit_cost,2)) stored, notes text
);

create table public.orders (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  number bigint not null, display_number text not null, budget_id uuid not null references public.budgets(id),
  budget_version_id uuid not null references public.budget_versions(id), client_id uuid not null references public.clients(id),
  status public.order_status not null default 'awaiting_finance', payment_terms text, promised_date date,
  total numeric(14,2) not null, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,number), unique(budget_id)
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  order_id uuid not null references public.orders(id) on delete cascade, budget_item_id uuid not null references public.budget_items(id),
  status public.order_status not null default 'awaiting_finance', snapshot jsonb not null,
  supplier_due_date date, scheduled_at timestamptz, completed_at timestamptz, issue_reason text,
  updated_at timestamptz not null default now(), unique(order_id,budget_item_id)
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  number bigint not null, display_number text not null, supplier_id uuid references public.suppliers(id),
  mode text not null check(mode in ('immediate','made_to_order')), status text not null default 'draft',
  external_number text, ordered_at date, supplier_due_date date, received_at date, payment_terms text,
  total numeric(14,2) not null default 0, cancelled_at timestamptz, cancellation_reason text,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,number)
);
create table public.purchase_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  purchase_id uuid not null references public.purchases(id) on delete cascade, order_item_id uuid not null references public.order_items(id),
  supply_id uuid references public.supplies(id), description text not null, quantity numeric(14,4) not null,
  unit text not null, unit_cost numeric(14,2) not null default 0, status text not null default 'ordered'
);

create table public.receivables (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  order_id uuid not null references public.orders(id), group_id uuid not null, installment integer not null,
  installment_count integer not null, description text not null, due_date date, amount numeric(14,2) not null,
  paid_amount numeric(14,2) not null default 0, status public.financial_status not null default 'open',
  cancelled_at timestamptz, created_at timestamptz not null default now()
);
create table public.payables (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  purchase_id uuid references public.purchases(id), order_id uuid references public.orders(id), group_id uuid not null,
  installment integer not null, installment_count integer not null, description text not null, due_date date,
  amount numeric(14,2) not null, paid_amount numeric(14,2) not null default 0,
  status public.financial_status not null default 'open', cancelled_at timestamptz, created_at timestamptz not null default now()
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  client_id uuid references public.clients(id), order_id uuid references public.orders(id), order_item_id uuid references public.order_items(id),
  event_type text not null, title text not null, description text, starts_at timestamptz not null, ends_at timestamptz,
  google_event_id text, google_calendar_id text, sync_status text not null default 'pending', cancelled_at timestamptz,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.attachments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  entity_type text not null, entity_id uuid not null, purpose text not null, storage_path text not null,
  original_name text not null, mime_type text not null, size_bytes bigint, extraction jsonb,
  uploaded_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table public.audit_log (
  id bigint generated always as identity primary key, organization_id uuid not null references public.organizations(id),
  actor_id uuid references public.profiles(id), entity_type text not null, entity_id uuid not null,
  action text not null, before_data jsonb, after_data jsonb, reason text, created_at timestamptz not null default now()
);

-- Every link between tenant-owned tables must include the organization.
-- Discover existing FKs instead of maintaining an incomplete manual list.
do $$
declare t record; fk record; source_column text;
begin
  for t in select c.oid, c.relname from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='organization_id' and not a.attisdropped)
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='id' and not a.attisdropped)
  loop
    execute format('alter table public.%I add constraint %I unique (organization_id,id)',t.relname,t.relname||'_org_id_key');
  end loop;
  for fk in select c.*, source.relname as source_table, target.relname as target_table
    from pg_constraint c
    join pg_class source on source.oid=c.conrelid
    join pg_namespace n on n.oid=source.relnamespace
    join pg_class target on target.oid=c.confrelid
    where c.contype='f' and n.nspname='public' and cardinality(c.conkey)=1
      and exists(select 1 from pg_attribute a where a.attrelid=c.conrelid and a.attname='organization_id' and not a.attisdropped)
      and exists(select 1 from pg_attribute a where a.attrelid=c.confrelid and a.attname='organization_id' and not a.attisdropped)
  loop
    select attname into source_column from pg_attribute where attrelid=fk.conrelid and attnum=fk.conkey[1];
    execute format('alter table public.%I add constraint %I foreign key (organization_id,%I) references public.%I(organization_id,id)',
      fk.source_table,fk.conname||'_org',source_column,fk.target_table);
  end loop;
end $$;

alter table public.clients add constraint clients_name_nonempty check(length(btrim(name))>0);
alter table public.clients add constraint clients_not_own_master check(master_client_id is distinct from id);
alter table public.supplies add constraint supplies_fields_nonempty check(
  length(btrim(code))>0 and length(btrim(name))>0 and length(btrim(purchase_unit))>0 and length(btrim(usage_unit))>0);
alter table public.supplies add constraint supplies_conversion_positive check(conversion_factor>0 and conversion_factor<>'NaN'::numeric);
alter table public.supplies add constraint supplies_cost_finite check(current_cost<>'NaN'::numeric);
create index memberships_user_active_idx on public.memberships(user_id,organization_id) where active;

-- No client can insert memberships or change their own role.
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create function private.has_org_role(org_id uuid, allowed_roles public.app_role[])
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.memberships m where m.organization_id=org_id
    and m.user_id=(select auth.uid()) and m.active and m.role=any(allowed_roles)
  );
$$;
revoke all on function private.has_org_role(uuid,public.app_role[]) from public, anon;
grant execute on function private.has_org_role(uuid,public.app_role[]) to authenticated;

create function private.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,full_name,email,avatar_url)
  values(new.id,new.raw_user_meta_data->>'full_name',new.email,new.raw_user_meta_data->>'avatar_url')
  on conflict(id) do update set full_name=excluded.full_name,email=excluded.email,avatar_url=excluded.avatar_url,updated_at=now();
  return new;
end; $$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert or update on auth.users for each row execute function private.handle_new_user();

-- Explicit scope: never grant/revoke ALL TABLES in a shared database.
do $$ declare t text; begin
  foreach t in array array['organizations','profiles','memberships','clients','suppliers','supplies','supply_suppliers','supply_price_history','item_families','budgets','budget_versions','budget_items','item_cost_lines','orders','order_items','purchases','purchase_items','receivables','payables','calendar_events','attachments','audit_log']
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated',t);
  end loop;
end $$;

grant usage on schema public to authenticated;
grant select on public.profiles,public.memberships,public.organizations,public.clients,public.supplies,public.audit_log to authenticated;
grant insert(id,organization_id,client_type,master_client_id,name,document,email,phone,address,city,origin,notes,created_by) on public.clients to authenticated;
grant update(client_type,master_client_id,name,document,email,phone,address,city,origin,notes,archived_at) on public.clients to authenticated;
grant insert(id,organization_id,code,name,category,brand,reference,purchase_unit,usage_unit,conversion_factor,current_cost,notes) on public.supplies to authenticated;
grant update(code,name,category,brand,reference,purchase_unit,usage_unit,conversion_factor,current_cost,notes,active) on public.supplies to authenticated;

create policy "profile self read" on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy "memberships own read" on public.memberships for select to authenticated using(user_id=(select auth.uid()));
create policy "organization member read" on public.organizations for select to authenticated
using(private.has_org_role(id,array['admin','comercial','compras','financeiro','operacao']::public.app_role[]));

do $$ declare t text; roles text; begin
  foreach t in array array['clients','supplies'] loop
    roles:=case when t='clients' then 'array[''admin'',''comercial'']::public.app_role[]' else 'array[''admin'',''compras'']::public.app_role[]' end;
    execute format('create policy "catalog member read" on public.%I for select to authenticated using(private.has_org_role(organization_id,array[''admin'',''comercial'',''compras'',''financeiro'',''operacao'']::public.app_role[]))',t);
    execute format('create policy "catalog role insert" on public.%I for insert to authenticated with check(private.has_org_role(organization_id,%s))',t,roles);
    execute format('create policy "catalog role update" on public.%I for update to authenticated using(private.has_org_role(organization_id,%s)) with check(private.has_org_role(organization_id,%s))',t,roles,roles);
  end loop;
end $$;

create policy "admin audit read" on public.audit_log for select to authenticated
using(private.has_org_role(organization_id,array['admin']::public.app_role[]));

-- The server, not the form, owns author, timestamps and audit records.
create function private.guard_catalog() returns trigger language plpgsql set search_path='' as $$
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
    if new.master_client_id is not null and not exists(
      select 1 from public.clients c where c.id=new.master_client_id
      and c.organization_id=new.organization_id and c.client_type='Parceiro/master' and c.archived_at is null
    ) then raise exception 'Invalid partner for client' using errcode='23514'; end if;
  end if;
  new.updated_at:=now();
  return new;
end $$;
revoke all on function private.guard_catalog() from public,anon,authenticated;

create function private.audit_catalog() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data)
  values(new.organization_id,auth.uid(),tg_table_name,new.id,lower(tg_op),
    case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end $$;
revoke all on function private.audit_catalog() from public,anon,authenticated;
create trigger clients_guard before insert or update on public.clients for each row execute function private.guard_catalog();
create trigger supplies_guard before insert or update on public.supplies for each row execute function private.guard_catalog();
create trigger clients_audit after insert or update on public.clients for each row execute function private.audit_catalog();
create trigger supplies_audit after insert or update on public.supplies for each row execute function private.audit_catalog();

-- Future modules and document uploads intentionally have no client policies yet.
-- No storage.objects policy is created until attachment ownership is validated.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('documents','documents',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
commit;
