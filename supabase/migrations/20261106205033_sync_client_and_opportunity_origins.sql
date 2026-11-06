CREATE OR REPLACE FUNCTION private.prepare_crm_opportunity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare bought public.orders; doc public.budgets; first_days int; follow_days int;
begin
 -- Origin-only synchronization must not move stages, assign owners or reschedule follow-ups.
 if tg_op='UPDATE' and (to_jsonb(new)-array['origin','updated_at'])=(to_jsonb(old)-array['origin','updated_at']) then return new;end if;
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
  select * into doc from public.budgets b where b.organization_id=new.organization_id and (b.id=new.budget_id or b.id=any(new.related_budget_ids)) and b.status in ('draft','sent','approved','no_response') order by case when b.status in ('sent','approved') then 0 else 1 end,b.created_at desc limit 1;
  if doc.id is not null and new.commercial_phase in ('new','contacted','preparing') then
   new.commercial_phase:=case when doc.status in ('sent','approved','no_response') or exists(select 1 from public.budgets hb where hb.organization_id=new.organization_id and (hb.id=new.budget_id or hb.id=any(new.related_budget_ids)) and hb.status in ('draft','sent','approved','no_response') and exists(select 1 from public.sales_tracking_history h where h.organization_id=new.organization_id and h.entity_type='budget' and h.entity_id=hb.id and h.state->>'status' in ('sent','approved','no_response'))) then 'proposal_sent' else 'preparing' end;new.stage:='budgeting';
  end if;
  select s.first_contact_days,s.follow_up_days into first_days,follow_days from public.sales_followup_settings s where s.organization_id=new.organization_id;
  if tg_op='INSERT' and new.next_follow_up_at is null then new.next_follow_up_at:=now()+make_interval(days=>coalesce(first_days,1)); end if;
 end if;
 return new;
end $function$;
create function private.inherit_linked_client_origin() returns trigger language plpgsql security invoker set search_path='' as $$
declare registered_origin text;
begin
 new.origin:=nullif(btrim(new.origin),'');
 if new.client_id is not null and (tg_op='INSERT' or new.client_id is distinct from old.client_id) then
   select c.origin into registered_origin from public.clients c where c.id=new.client_id and c.organization_id=new.organization_id;
   if not found then raise exception 'Cliente não pertence à empresa.' using errcode='23514'; end if;
   if new.origin is null then new.origin:=nullif(btrim(registered_origin),''); end if;
 end if;
 return new;
end; $$;
revoke all on function private.inherit_linked_client_origin() from public,anon,authenticated;
create trigger zzzz_inherit_linked_origin before insert or update on public.sales_opportunities for each row execute function private.inherit_linked_client_origin();

create function private.sync_opportunity_origin_to_client() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.client_id is null or new.archived_at is not null then return new; end if;
 if tg_op='UPDATE' and new.origin is not distinct from old.origin and new.client_id is not distinct from old.client_id then return new; end if;
 update public.clients c set origin=new.origin where c.id=new.client_id and c.organization_id=new.organization_id and c.origin is distinct from new.origin;
 return new;
end; $$;
revoke all on function private.sync_opportunity_origin_to_client() from public,anon,authenticated;
create trigger crm_sync_opportunity_origin after insert or update on public.sales_opportunities for each row execute function private.sync_opportunity_origin_to_client();

create function private.sync_client_origin_to_opportunities() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.origin is not distinct from old.origin or auth.uid() is null then return new; end if;
 update public.sales_opportunities s set origin=nullif(btrim(new.origin),'')
 where s.organization_id=new.organization_id and s.client_id=new.id and s.archived_at is null and s.origin is distinct from nullif(btrim(new.origin),'');
 return new;
end; $$;
revoke all on function private.sync_client_origin_to_opportunities() from public,anon,authenticated;
create trigger crm_sync_client_origin after update of origin on public.clients for each row execute function private.sync_client_origin_to_opportunities();
