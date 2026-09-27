begin;

-- A pre-budget is an estimate, not a commercial commitment. Existing records
-- remain formal budgets by default, so this addition is safe for production data.
alter table public.budgets
  add column if not exists document_type text not null default 'budget'
    check (document_type in ('pre_budget','budget')),
  add column if not exists pre_budget_display_number text;

create or replace function private.guard_budget()
returns trigger language plpgsql set search_path=''
as $$
begin
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.number is distinct from old.number
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or (
       new.display_number is distinct from old.display_number
       and not (
         old.document_type='pre_budget'
         and new.document_type='budget'
         and new.pre_budget_display_number=old.display_number
       )
     ) then
    raise exception 'Budget identity cannot change' using errcode='23514';
  end if;
  new.updated_at:=now();
  return new;
end;
$$;

create or replace function public.create_commercial_draft(org_id uuid, new_document_type text)
returns public.budgets
language plpgsql security definer set search_path=''
as $$
declare next_number bigint; created public.budgets; prefix text;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if new_document_type not in ('pre_budget','budget') then
    raise exception 'Invalid document type' using errcode='23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(org_id::text,0));
  select coalesce(max(number),0)+1 into next_number from public.budgets where organization_id=org_id;
  prefix:=case when new_document_type='pre_budget' then 'PRE' else 'ORC' end;

  insert into public.budgets(
    organization_id,number,display_number,document_type,status,valid_until,payment_terms,delivery_terms,created_by
  ) values (
    org_id,next_number,prefix||'-'||extract(year from current_date)::integer||'-'||lpad(next_number::text,6,'0'),
    new_document_type,'draft',current_date+10,'Conforme disposto em cada item','A definir',auth.uid()
  ) returning * into created;
  return created;
end;
$$;

create or replace function public.convert_pre_budget_to_budget(org_id uuid, target_budget_id uuid)
returns public.budgets
language plpgsql security definer set search_path=''
as $$
declare target public.budgets; updated public.budgets;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select * into target from public.budgets where id=target_budget_id and organization_id=org_id for update;
  if target.id is null then raise exception 'Pre-budget not found' using errcode='P0002'; end if;
  if target.document_type<>'pre_budget' or target.status<>'draft' then
    raise exception 'Only draft pre-budgets can be converted' using errcode='23514';
  end if;

  update public.budgets
  set document_type='budget',
      pre_budget_display_number=target.display_number,
      display_number='ORC-'||extract(year from current_date)::integer||'-'||lpad(target.number::text,6,'0'),
      current_revision=1,
      updated_at=now()
  where id=target.id
  returning * into updated;

  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data)
  values(org_id,auth.uid(),'budgets',target.id,'converted_from_pre_budget',to_jsonb(target),to_jsonb(updated));
  return updated;
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
  if target.document_type<>'budget' then raise exception 'Convert the pre-budget before sending' using errcode='23514'; end if;
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

revoke all on function public.create_commercial_draft(uuid,text),public.convert_pre_budget_to_budget(uuid,uuid) from public,anon;
grant execute on function public.create_commercial_draft(uuid,text),public.convert_pre_budget_to_budget(uuid,uuid) to authenticated;

commit;
