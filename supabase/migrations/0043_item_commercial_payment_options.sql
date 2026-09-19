begin;

create table public.budget_item_payment_options(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  budget_item_id uuid not null references public.budget_items(id) on delete cascade,
  position integer not null check(position > 0),
  description text not null check(length(btrim(description)) > 0),
  adjustment_percent numeric(14,6) not null default 0 check(adjustment_percent between -100 and 500),
  final_value numeric(14,2),
  observation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(budget_item_id,position)
);

alter table public.budget_item_payment_options enable row level security;
grant select on public.budget_item_payment_options to authenticated;
create policy "budget item payment option member read" on public.budget_item_payment_options
for select to authenticated
using (private.has_org_role(organization_id,array['admin','comercial','financeiro','operacao']::public.app_role[]));
create index budget_item_payment_options_budget_idx on public.budget_item_payment_options(organization_id,budget_item_id,position);

create or replace function public.replace_budget_item_payment_options(org_id uuid,target_budget_item_id uuid,new_options jsonb)
returns setof public.budget_item_payment_options
language plpgsql security definer set search_path=''
as $$
declare target public.budget_items; option_row jsonb; option_position integer;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select i.* into target
  from public.budget_items i join public.budgets b on b.id=i.budget_id and b.organization_id=i.organization_id
  where i.id=target_budget_item_id and i.organization_id=org_id and b.status='draft' for update;
  if target.id is null then raise exception 'Draft item not found' using errcode='P0002'; end if;
  if jsonb_typeof(coalesce(new_options,'[]'::jsonb)) <> 'array' then raise exception 'Invalid commercial options' using errcode='23514'; end if;

  delete from public.budget_item_payment_options where organization_id=org_id and budget_item_id=target.id;
  for option_row in select value from jsonb_array_elements(coalesce(new_options,'[]'::jsonb)) loop
    option_position:=coalesce((option_row->>'position')::integer,0);
    if option_position <= 0 or length(btrim(coalesce(option_row->>'description',''))) = 0 then
      raise exception 'Commercial option requires position and description' using errcode='23514';
    end if;
    if coalesce((option_row->>'adjustment_percent')::numeric,0) not between -100 and 500 then
      raise exception 'Invalid commercial adjustment' using errcode='23514';
    end if;
    if nullif(option_row->>'final_value','') is not null and coalesce((option_row->>'final_value')::numeric,-1) < 0 then
      raise exception 'Invalid commercial final value' using errcode='23514';
    end if;
    insert into public.budget_item_payment_options(organization_id,budget_item_id,position,description,adjustment_percent,final_value,observation)
    values(org_id,target.id,option_position,btrim(option_row->>'description'),coalesce((option_row->>'adjustment_percent')::numeric,0),nullif(option_row->>'final_value','')::numeric,nullif(btrim(option_row->>'observation'),''));
  end loop;
  return query select * from public.budget_item_payment_options where organization_id=org_id and budget_item_id=target.id order by position;
end;
$$;

create or replace function public.mark_budget_sent(org_id uuid, target_budget_id uuid)
returns public.budgets
language plpgsql security definer set search_path=''
as $$
declare target public.budgets;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into target from public.budgets where id=target_budget_id and organization_id=org_id for update;
  if target.id is null then raise exception 'Budget not found' using errcode='P0002'; end if;
  if target.status <> 'draft' then raise exception 'Only drafts can be sent' using errcode='23514'; end if;
  if target.client_id is null then raise exception 'Client is required' using errcode='23514'; end if;
  if not exists(select 1 from public.budget_items where budget_id=target.id and organization_id=org_id and affects_total) then raise exception 'At least one principal item is required' using errcode='23514'; end if;

  insert into public.budget_versions(organization_id,budget_id,revision,snapshot,created_by)
  select org_id,target.id,target.current_revision,
    jsonb_build_object(
      'budget',to_jsonb(target),
      'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.position) from public.budget_items i where i.budget_id=target.id and i.organization_id=org_id),'[]'::jsonb),
      'item_payment_options',coalesce((select jsonb_agg(to_jsonb(o) order by o.budget_item_id,o.position) from public.budget_item_payment_options o where o.budget_item_id in (select id from public.budget_items where budget_id=target.id and organization_id=org_id) and o.organization_id=org_id),'[]'::jsonb)
    ),auth.uid()
  on conflict(budget_id,revision) do update set snapshot=excluded.snapshot;

  update public.budgets set status='sent' where id=target.id returning * into target;
  return target;
end;
$$;

revoke all on function public.replace_budget_item_payment_options(uuid,uuid,jsonb) from public,anon;
grant execute on function public.replace_budget_item_payment_options(uuid,uuid,jsonb) to authenticated;

commit;
