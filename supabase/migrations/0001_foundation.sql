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

create or replace function private.is_org_member(org_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.memberships m where m.organization_id=org_id and m.user_id=auth.uid() and m.active);
$$;
revoke all on function private.is_org_member(uuid) from public;
grant execute on function private.is_org_member(uuid) to authenticated;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id,full_name,email,avatar_url) values(new.id,new.raw_user_meta_data->>'full_name',new.email,new.raw_user_meta_data->>'avatar_url') on conflict(id) do update set full_name=excluded.full_name,email=excluded.email,avatar_url=excluded.avatar_url,updated_at=now(); return new; end; $$;
revoke all on function public.handle_new_user() from public;
create trigger on_auth_user_created after insert or update on auth.users for each row execute function public.handle_new_user();

do $$ declare t text; begin foreach t in array array['organizations','profiles','memberships','clients','suppliers','supplies','supply_suppliers','supply_price_history','item_families','budgets','budget_versions','budget_items','item_cost_lines','orders','order_items','purchases','purchase_items','receivables','payables','calendar_events','attachments','audit_log'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;

create policy "profile self read" on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy "profile self update" on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy "memberships own read" on public.memberships for select to authenticated using(user_id=(select auth.uid()));
create policy "organization member read" on public.organizations for select to authenticated using(private.is_org_member(id));

do $$ declare t text; begin foreach t in array array['clients','suppliers','supplies','supply_price_history','item_families','budgets','budget_versions','budget_items','item_cost_lines','orders','order_items','purchases','purchase_items','receivables','payables','calendar_events','attachments','audit_log'] loop
 execute format('create policy "org members read" on public.%I for select to authenticated using(private.is_org_member(organization_id))',t);
 execute format('create policy "org members insert" on public.%I for insert to authenticated with check(private.is_org_member(organization_id))',t);
 execute format('create policy "org members update" on public.%I for update to authenticated using(private.is_org_member(organization_id)) with check(private.is_org_member(organization_id))',t);
end loop; end $$;

create policy "supply suppliers read" on public.supply_suppliers for select to authenticated using(exists(select 1 from public.supplies s where s.id=supply_id and private.is_org_member(s.organization_id)));
create policy "supply suppliers write" on public.supply_suppliers for all to authenticated using(exists(select 1 from public.supplies s where s.id=supply_id and private.is_org_member(s.organization_id))) with check(exists(select 1 from public.supplies s where s.id=supply_id and private.is_org_member(s.organization_id)));

grant usage on schema public to authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;
grant usage,select on all sequences in schema public to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('documents','documents',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy "members access organization documents" on storage.objects for all to authenticated
using(bucket_id='documents' and exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.active and m.organization_id::text=(storage.foldername(name))[1]))
with check(bucket_id='documents' and exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.active and m.organization_id::text=(storage.foldername(name))[1]));
