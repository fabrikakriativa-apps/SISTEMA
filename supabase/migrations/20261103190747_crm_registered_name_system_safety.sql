-- Background imports may update registration without a commercial session.
-- Do not make those existing workflows depend on prospecting assignment checks.
-- The UI resolves the registered name; the next commercial save persists it.
create or replace function private.crm_refresh_registered_name() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_schema<>'public' or tg_table_name<>'clients' then raise exception 'Invalid registration source';end if;
 if auth.uid() is null then return new;end if;
 if new.name is distinct from old.name then
  update public.sales_opportunities s set name=new.name
  where s.organization_id=new.organization_id and s.client_id=new.id and s.name is distinct from new.name;
 end if;
 return new;
end $$;
revoke all on function private.crm_refresh_registered_name() from public,anon,authenticated;
