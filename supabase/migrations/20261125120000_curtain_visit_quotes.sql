begin;

create table public.curtain_visit_quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  reference_code text not null default ('CT-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  status text not null default 'draft' check (status in ('draft','finalized','imported','cancelled')),
  client_name text,
  client_phone text,
  project_reference text,
  neighborhood text,
  calculator_state jsonb not null default '{}'::jsonb,
  result_payload jsonb not null default '{}'::jsonb,
  rules_version text not null default 'curtain-engine-v16',
  created_by uuid not null default auth.uid() references public.profiles(id),
  imported_budget_id uuid references public.budgets(id),
  imported_budget_item_id uuid references public.budget_items(id),
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,reference_code),
  unique(imported_budget_item_id),
  check (jsonb_typeof(calculator_state)='object'),
  check (jsonb_typeof(result_payload)='object')
);

create index curtain_visit_quotes_lookup_idx
  on public.curtain_visit_quotes(organization_id,status,updated_at desc);
create index curtain_visit_quotes_client_idx
  on public.curtain_visit_quotes(organization_id,lower(coalesce(client_name,'')),lower(coalesce(client_phone,'')));

alter table public.curtain_visit_quotes enable row level security;

grant select on public.curtain_visit_quotes to authenticated;
grant insert(organization_id,status,client_name,client_phone,project_reference,neighborhood,calculator_state,result_payload,rules_version,created_by)
  on public.curtain_visit_quotes to authenticated;
grant update(status,client_name,client_phone,project_reference,neighborhood,calculator_state,result_payload,rules_version,updated_at)
  on public.curtain_visit_quotes to authenticated;

create policy "curtain visit commercial read" on public.curtain_visit_quotes
for select to authenticated
using((select private.has_org_role(organization_id,array['admin','comercial']::public.app_role[])));

create policy "curtain visit commercial insert" on public.curtain_visit_quotes
for insert to authenticated
with check(
  created_by=(select auth.uid())
  and (select private.has_org_role(organization_id,array['admin','comercial']::public.app_role[]))
);

create policy "curtain visit commercial update" on public.curtain_visit_quotes
for update to authenticated
using((select private.has_org_role(organization_id,array['admin','comercial']::public.app_role[])))
with check(
  (select private.has_org_role(organization_id,array['admin','comercial']::public.app_role[]))
  and imported_budget_item_id is null
);

create function private.guard_curtain_visit_quote() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.id is distinct from old.id
      or new.organization_id is distinct from old.organization_id
      or new.reference_code is distinct from old.reference_code
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at then
      raise exception 'Protected curtain visit fields cannot change' using errcode='23514';
    end if;
    if old.status in ('imported','cancelled') then
      raise exception 'Closed curtain visit cannot change' using errcode='23514';
    end if;
  end if;
  new.client_name:=nullif(btrim(new.client_name),'');
  new.client_phone:=nullif(btrim(new.client_phone),'');
  new.project_reference:=nullif(btrim(new.project_reference),'');
  new.neighborhood:=nullif(btrim(new.neighborhood),'');
  new.updated_at:=now();
  return new;
end $$;

revoke all on function private.guard_curtain_visit_quote() from public,anon,authenticated;
create trigger curtain_visit_quotes_guard before insert or update on public.curtain_visit_quotes
for each row execute function private.guard_curtain_visit_quote();

create or replace function public.import_curtain_visit_quote(
  org_id uuid,
  visit_quote_id uuid,
  target_budget_id uuid,
  curtain_family_id uuid
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  visit public.curtain_visit_quotes;
  target_budget public.budgets;
  item public.budget_items;
  payload jsonb;
  summary jsonb;
  material_cost numeric;
  installation_cost numeric;
  total_cost numeric;
  sale_total numeric;
  next_position integer;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  select * into visit from public.curtain_visit_quotes
  where id=visit_quote_id and organization_id=org_id for update;
  if visit.id is null then raise exception 'Curtain visit not found' using errcode='P0002'; end if;

  if visit.imported_budget_item_id is not null then
    if visit.imported_budget_id=target_budget_id then
      return jsonb_build_object('budget_item_id',visit.imported_budget_item_id,'already_imported',true,'reference_code',visit.reference_code);
    end if;
    raise exception 'Curtain visit already imported' using errcode='23505';
  end if;
  if visit.status not in ('draft','finalized') then raise exception 'Curtain visit is closed' using errcode='23514'; end if;

  select * into target_budget from public.budgets
  where id=target_budget_id and organization_id=org_id and status='draft' for update;
  if target_budget.id is null then raise exception 'Draft budget not found' using errcode='P0002'; end if;
  if not exists(select 1 from public.item_families f where f.id=curtain_family_id and f.organization_id=org_id and f.active and f.form_key='curtain') then
    raise exception 'Curtain family not found' using errcode='23514';
  end if;

  payload:=visit.result_payload;
  if payload->>'schema'<>'fk-curtain-calculation-v1' or jsonb_typeof(payload->'faces')<>'array' or jsonb_array_length(payload->'faces')=0 then
    raise exception 'Invalid curtain calculation' using errcode='23514';
  end if;
  summary:=coalesce(payload->'summary','{}'::jsonb);
  material_cost:=greatest(0,coalesce((summary->>'cost')::numeric,0));
  installation_cost:=greatest(0,coalesce((summary->>'installation')::numeric,0));
  total_cost:=round(material_cost+installation_cost,2);
  sale_total:=greatest(0,coalesce((summary->>'total')::numeric,0));
  select coalesce(max(position),0)+1 into next_position from public.budget_items where organization_id=org_id and budget_id=target_budget.id;

  insert into public.budget_items(
    organization_id,budget_id,family_id,position,presentation,environment,description,quantity,
    configuration,cost_total,margin_percent,sale_total,affects_total
  ) values (
    org_id,target_budget.id,curtain_family_id,next_position,'principal',nullif(payload->>'environment',''),
    coalesce(nullif(payload->>'description',''),'Cortina sob medida'),1,
    jsonb_build_object(
      'source','curtain_visit','curtain_visit_quote_id',visit.id,'curtain_visit_reference',visit.reference_code,
      'curtain_calculator',payload,'manufacturer_cost',material_cost,'additional_cost',installation_cost,'unit_price_input',true
    ),total_cost,
    case when total_cost>0 then round(((sale_total/total_cost)-1)*100,3) else 0 end,
    sale_total,true
  ) returning * into item;

  if material_cost>0 then
    insert into public.item_cost_lines(organization_id,budget_item_id,kind,description,quantity,unit,unit_cost)
    values(org_id,item.id,'product','Custo calculado de materiais e confecção',1,'un',material_cost);
  end if;
  if installation_cost>0 then
    insert into public.item_cost_lines(organization_id,budget_item_id,kind,description,quantity,unit,unit_cost)
    values(org_id,item.id,'installation','Instalação calculada',1,'un',installation_cost);
  end if;
  update public.budget_items set cost_total=total_cost,updated_at=now() where id=item.id;

  update public.curtain_visit_quotes set
    status='imported',imported_budget_id=target_budget.id,imported_budget_item_id=item.id,imported_at=now(),updated_at=now()
  where id=visit.id;

  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,after_data)
  values(org_id,auth.uid(),'curtain_visit_quotes',visit.id,'imported',jsonb_build_object('budget_id',target_budget.id,'budget_item_id',item.id,'reference_code',visit.reference_code));

  return jsonb_build_object('budget_item_id',item.id,'already_imported',false,'reference_code',visit.reference_code);
end $$;

revoke all on function public.import_curtain_visit_quote(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.import_curtain_visit_quote(uuid,uuid,uuid,uuid) to authenticated;

commit;
