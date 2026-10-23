create index if not exists sales_opportunities_client_active_idx on public.sales_opportunities(organization_id,client_id) where archived_at is null;
create function private.crm_lead_registered() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if pg_trigger_depth()>1 or new.crm_lifecycle<>'lead' or new.client_type<>'Cliente final' or new.archived_at is not null or nullif(current_setting('app.explicit_sales_opportunity',true),'') is not null then return new;end if;
 if auth.uid() is null or not private.has_org_role(new.organization_id,array['admin','comercial']::public.app_role[]) then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended('crm-client:'||new.id::text,0));
 if not exists(select 1 from public.sales_opportunities where organization_id=new.organization_id and client_id=new.id) then
 insert into public.sales_opportunities(organization_id,client_id,name,phone,email,origin,notes,created_by,received_on,stage,commercial_phase,customer_kind)
 values(new.organization_id,new.id,new.name,new.phone,new.email,new.origin,new.notes,auth.uid(),(new.created_at at time zone 'America/Sao_Paulo')::date,'new','new','new_lead');
 end if;return new;
end $$;
revoke all on function private.crm_lead_registered() from public,anon,authenticated;
create trigger crm_lead_registered after insert or update of crm_lifecycle on public.clients for each row execute function private.crm_lead_registered();

create function private.crm_link_unique_budget() returns trigger language plpgsql security definer set search_path='' as $$
declare candidate uuid; candidates integer;
begin
 if new.client_id is null or new.status not in ('draft','sent','approved') then return new;end if;
 if auth.uid() is null or not private.has_org_role(new.organization_id,array['admin','comercial']::public.app_role[]) then return new;end if;
 if nullif(current_setting('app.explicit_sales_opportunity',true),'') is not null then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended('crm-client:'||new.client_id::text,0));
 if exists(select 1 from public.sales_opportunities where organization_id=new.organization_id and (budget_id=new.id or new.id=any(related_budget_ids))) then return new;end if;
 select count(*),(array_agg(id))[1] into candidates,candidate from public.sales_opportunities where organization_id=new.organization_id and client_id=new.client_id and archived_at is null and stage not in ('won','lost');
 if candidates=1 then
 update public.sales_opportunities set budget_id=coalesce(budget_id,new.id),related_budget_ids=case when budget_id is null then related_budget_ids else array_append(related_budget_ids,new.id) end where id=candidate and organization_id=new.organization_id;
 end if;return new;
end $$;
revoke all on function private.crm_link_unique_budget() from public,anon,authenticated;
create trigger crm_link_unique_budget after insert or update of client_id on public.budgets for each row execute function private.crm_link_unique_budget();

create function public.link_budget_opportunity(org_id uuid,document_id uuid,opportunity_id uuid) returns void language plpgsql security invoker set search_path='' as $$
declare doc public.budgets; opportunity public.sales_opportunities;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501';end if;
 select * into doc from public.budgets where id=document_id and organization_id=org_id;
 if doc.id is null or doc.client_id is null then raise exception 'Selecione e salve o contato do orçamento primeiro';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm-client:'||doc.client_id::text,0));
 select * into opportunity from public.sales_opportunities where id=opportunity_id and organization_id=org_id and client_id=doc.client_id and archived_at is null and stage not in ('won','lost') for update;
 if opportunity.id is null then raise exception 'Oportunidade indisponível para este contato';end if;
 if exists(select 1 from public.sales_opportunities where organization_id=org_id and id<>opportunity_id and (budget_id=document_id or document_id=any(related_budget_ids))) then raise exception 'Orçamento já vinculado a outra oportunidade';end if;
 if opportunity.budget_id=document_id or document_id=any(opportunity.related_budget_ids) then return;end if;
 update public.sales_opportunities set budget_id=coalesce(budget_id,document_id),related_budget_ids=case when budget_id is null then related_budget_ids else array_append(related_budget_ids,document_id) end where id=opportunity_id and organization_id=org_id;
end $$;
revoke all on function public.link_budget_opportunity(uuid,uuid,uuid) from public,anon;
grant execute on function public.link_budget_opportunity(uuid,uuid,uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.convert_opportunity_to_budget(org_id uuid, target_opportunity_id uuid)
 RETURNS budgets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  opportunity public.sales_opportunities;
  linked_client public.clients;
  created_budget public.budgets;
  next_number bigint;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select * into opportunity from public.sales_opportunities where id=target_opportunity_id and organization_id=org_id for update;
  if opportunity.id is null then raise exception 'Opportunity not found' using errcode='P0002'; end if;
  if opportunity.stage='lost' then raise exception 'Lost opportunity cannot create a budget' using errcode='23514'; end if;
  if opportunity.budget_id is not null then
    select * into created_budget from public.budgets where id=opportunity.budget_id and organization_id=org_id;
    if created_budget.id is not null then return created_budget; end if;
  end if;
  perform set_config('app.explicit_sales_opportunity',target_opportunity_id::text,true);
  if opportunity.client_id is not null then
    select * into linked_client from public.clients where id=opportunity.client_id and organization_id=org_id and archived_at is null;
  end if;
  if linked_client.id is null then
    insert into public.clients(organization_id,client_type,name,email,phone,origin,notes,created_by)
    values(org_id,'Cliente final',btrim(opportunity.name),nullif(btrim(coalesce(opportunity.email,'')),''),nullif(btrim(coalesce(opportunity.phone,'')),''),nullif(btrim(coalesce(opportunity.origin,'')),''),nullif(btrim(coalesce(opportunity.notes,'')),''),auth.uid())
    returning * into linked_client;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(org_id::text,0));
  select coalesce(max(number),0)+1 into next_number from public.budgets where organization_id=org_id;
  insert into public.budgets(organization_id,number,display_number,client_id,client_address,status,valid_until,payment_terms,delivery_terms,created_by)
  values(org_id,next_number,'ORC-'||extract(year from current_date)::integer||'-'||lpad(next_number::text,6,'0'),linked_client.id,nullif(concat_ws(' · ',linked_client.address,linked_client.city),''),'draft',current_date+10,'Conforme disposto em cada item','A definir',auth.uid())
  returning * into created_budget;
  perform set_config('app.explicit_sales_opportunity','',true);
  update public.sales_opportunities set client_id=linked_client.id,budget_id=created_budget.id,stage='budgeting',updated_at=now() where id=opportunity.id;
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,after_data)
  values(org_id,auth.uid(),'sales_opportunities',opportunity.id,'converted_to_budget',jsonb_build_object('client_id',linked_client.id,'budget_id',created_budget.id));
  return created_budget;
end;
$function$
;

