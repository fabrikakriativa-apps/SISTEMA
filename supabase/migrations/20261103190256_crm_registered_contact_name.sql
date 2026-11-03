-- Registration is the source of truth for a linked opportunity's name.
-- Both functions run with the caller's existing RLS and column permissions.
create function private.crm_registered_opportunity_name() returns trigger
language plpgsql security invoker set search_path='' as $$
declare registered_name text;
begin
 if tg_table_schema<>'public' or tg_table_name<>'sales_opportunities' then raise exception 'Invalid CRM source';end if;
 if new.client_id is not null then
  select c.name into registered_name from public.clients c where c.id=new.client_id and c.organization_id=new.organization_id;
  if nullif(btrim(registered_name),'') is not null then new.name:=registered_name;end if;
 end if;
 return new;
end $$;
revoke all on function private.crm_registered_opportunity_name() from public,anon,authenticated;
-- Run after prepare_crm_opportunity, which may resolve a document's client.
create trigger zzz_crm_registered_name before insert or update on public.sales_opportunities
 for each row execute function private.crm_registered_opportunity_name();

create function private.crm_refresh_registered_name() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_schema<>'public' or tg_table_name<>'clients' then raise exception 'Invalid registration source';end if;
 if new.name is distinct from old.name then
  update public.sales_opportunities s set name=new.name
  where s.organization_id=new.organization_id and s.client_id=new.id and s.name is distinct from new.name;
 end if;
 return new;
end $$;
revoke all on function private.crm_refresh_registered_name() from public,anon,authenticated;
create trigger crm_refresh_registered_name after update of name on public.clients
 for each row execute function private.crm_refresh_registered_name();

