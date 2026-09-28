begin;

alter table public.budgets drop constraint if exists budgets_organization_id_number_key;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='budgets_organization_document_type_number_key') then
    alter table public.budgets add constraint budgets_organization_document_type_number_key unique(organization_id,document_type,number);
  end if;
end $$;

create or replace function private.guard_budget()
returns trigger language plpgsql set search_path=''
as $$
begin
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or ((new.number is distinct from old.number or new.display_number is distinct from old.display_number)
       and not (old.document_type='pre_budget' and new.document_type='budget' and new.pre_budget_display_number=old.display_number)) then
    raise exception 'Budget identity cannot change' using errcode='23514';
  end if;
  new.updated_at:=now();
  return new;
end;
$$;

create or replace function public.create_commercial_draft(org_id uuid,new_document_type text)
returns public.budgets language plpgsql security definer set search_path=''
as $$
declare next_number bigint; created public.budgets; prefix text;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  if new_document_type not in ('pre_budget','budget') then raise exception 'Invalid document type' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended('commercial-document:'||org_id::text||':'||new_document_type,0));
  select case when new_document_type='budget' then greatest(coalesce(max(number) filter(where document_type='budget'),0),271)+1 else greatest(coalesce(max(number) filter(where document_type='pre_budget'),0),271)+1 end into next_number from public.budgets where organization_id=org_id;
  prefix:=case when new_document_type='pre_budget' then 'PRE' else 'ORC' end;
  insert into public.budgets(organization_id,number,display_number,document_type,status,valid_until,payment_terms,delivery_terms,created_by)
  values(org_id,next_number,prefix||'-'||extract(year from current_date)::integer||'-'||lpad(next_number::text,6,'0'),new_document_type,'draft',current_date+10,'Conforme disposto em cada item','A definir',auth.uid()) returning * into created;
  return created;
end;
$$;

create or replace function public.convert_pre_budget_to_budget(org_id uuid,target_budget_id uuid)
returns public.budgets language plpgsql security definer set search_path=''
as $$
declare target public.budgets; updated public.budgets; next_number bigint;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into target from public.budgets where id=target_budget_id and organization_id=org_id for update;
  if target.id is null then raise exception 'Pre-budget not found' using errcode='P0002'; end if;
  if target.document_type<>'pre_budget' or target.status<>'draft' then raise exception 'Only draft pre-budgets can be converted' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended('commercial-document:'||org_id::text||':budget',0));
  select greatest(coalesce(max(number) filter(where document_type='budget'),0),271)+1 into next_number from public.budgets where organization_id=org_id;
  update public.budgets set number=next_number,document_type='budget',pre_budget_display_number=target.display_number,display_number='ORC-'||extract(year from current_date)::integer||'-'||lpad(next_number::text,6,'0'),current_revision=1,updated_at=now() where id=target.id returning * into updated;
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data) values(org_id,auth.uid(),'budgets',target.id,'converted_from_pre_budget',to_jsonb(target),to_jsonb(updated));
  return updated;
end;
$$;

commit;
