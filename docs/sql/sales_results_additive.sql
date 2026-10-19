-- Additive sales tracking. No existing budget/order rows or business RPCs are changed.
alter table public.sales_opportunities
 add column received_on date,
 add column profile_status text not null default 'unassessed' check(profile_status in ('unassessed','in_profile','out_of_profile')),
 add column profile_reason text,
 add column capture_source text,
 add column campaign text,
 add column customer_kind text not null default 'unknown' check(customer_kind in ('unknown','new_lead','repeat')),
 add column response_status text not null default 'active' check(response_status in ('active','waiting','no_response')),
 add column related_budget_ids uuid[] not null default '{}';

create table public.sales_tracking_history (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 entity_type text not null check(entity_type in ('opportunity','budget','order')),
 entity_id uuid not null,
 recorded_at timestamptz not null default clock_timestamp(),
 state jsonb not null
);
alter table public.sales_tracking_history enable row level security;
revoke all on public.sales_tracking_history from anon,authenticated;
grant select on public.sales_tracking_history to authenticated;
create policy "sales history commercial read" on public.sales_tracking_history
 for select to authenticated using(private.has_org_role(organization_id,array['admin','comercial']::public.app_role[]));
create index sales_tracking_history_entity on public.sales_tracking_history(organization_id,entity_type,entity_id,recorded_at);
create index sales_opportunities_received on public.sales_opportunities(organization_id,received_on);
create index sales_opportunities_related on public.sales_opportunities using gin(related_budget_ids);

create function private.check_sales_tracking() returns trigger language plpgsql security invoker set search_path='' as $$
declare doc uuid;
begin
 if new.profile_status='out_of_profile' and length(btrim(coalesce(new.profile_reason,'')))<3 then
  raise exception 'Informe o motivo de estar fora do perfil.' using errcode='23514';
 end if;
 if new.received_on > (now() at time zone 'America/Sao_Paulo')::date then
  raise exception 'A entrada do lead não pode estar no futuro.' using errcode='23514';
 end if;
 if new.received_on is not null and new.customer_kind='unknown' then
  raise exception 'Informe se é novo lead ou recompra.' using errcode='23514';
 end if;
 foreach doc in array array_remove(array_append(new.related_budget_ids,new.budget_id),null) loop
  if not exists(select 1 from public.budgets b where b.id=doc and b.organization_id=new.organization_id) then
   raise exception 'Orçamento não pertence à empresa.' using errcode='23514';
  end if;
  -- Organization lock serializes competing assignments of the same document.
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text||':sales-tracking',0));
  if exists(select 1 from public.sales_opportunities s where s.organization_id=new.organization_id and s.id<>new.id
    and (s.budget_id=doc or doc=any(s.related_budget_ids))) then
   raise exception 'Este orçamento já está vinculado a outra oportunidade.' using errcode='23514';
  end if;
 end loop;
 return new;
end $$;
revoke all on function private.check_sales_tracking() from public,anon,authenticated;
create trigger sales_tracking_check before insert or update on public.sales_opportunities for each row execute function private.check_sales_tracking();

-- Private trigger only: cannot be invoked through the API. It records facts but
-- never changes any source record, status, amount or existing authorization rule.
create function private.record_sales_tracking() returns trigger language plpgsql security definer set search_path='' as $$
declare snapshot jsonb; previous jsonb; kind text;
begin
 if tg_table_schema<>'public' or tg_table_name not in ('sales_opportunities','budgets','orders') then
  raise exception 'Invalid tracking source';
 end if;
 if tg_table_name='sales_opportunities' then
  kind:='opportunity';
  snapshot:=jsonb_build_object('stage',new.stage,'profile_status',new.profile_status,'profile_reason',new.profile_reason,'response_status',new.response_status,'archived_at',new.archived_at);
  if tg_op='UPDATE' then previous:=jsonb_build_object('stage',old.stage,'profile_status',old.profile_status,'profile_reason',old.profile_reason,'response_status',old.response_status,'archived_at',old.archived_at); end if;
 else
  kind:=case tg_table_name when 'budgets' then 'budget' else 'order' end;
  snapshot:=jsonb_build_object('status',new.status,'total',new.total);
  if tg_op='UPDATE' then previous:=jsonb_build_object('status',old.status,'total',old.total); end if;
 end if;
 if snapshot is distinct from previous then
  insert into public.sales_tracking_history(organization_id,entity_type,entity_id,state) values(new.organization_id,kind,new.id,snapshot);
 end if;
 return new;
end $$;
revoke all on function private.record_sales_tracking() from public,anon,authenticated;
create trigger sales_opportunity_history after insert or update on public.sales_opportunities for each row execute function private.record_sales_tracking();
create trigger sales_budget_history after insert or update of status,total on public.budgets for each row execute function private.record_sales_tracking();
create trigger sales_order_history after insert or update of status,total on public.orders for each row execute function private.record_sales_tracking();
-- Baseline is explicitly dated at activation, never backdated to creation.
insert into public.sales_tracking_history(organization_id,entity_type,entity_id,state)
 select organization_id,'budget',id,jsonb_build_object('status',status,'total',total,'baseline',true) from public.budgets;
insert into public.sales_tracking_history(organization_id,entity_type,entity_id,state)
 select organization_id,'order',id,jsonb_build_object('status',status,'total',total,'baseline',true) from public.orders;

