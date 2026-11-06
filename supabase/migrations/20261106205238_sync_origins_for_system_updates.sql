create or replace function private.sync_client_origin_to_opportunities() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.origin is not distinct from old.origin then return new; end if;
 update public.sales_opportunities s set origin=nullif(btrim(new.origin),'')
 where s.organization_id=new.organization_id and s.client_id=new.id and s.archived_at is null and s.origin is distinct from nullif(btrim(new.origin),'');
 return new;
end; $$;