begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.memberships where organization_id='0e398095-cc22-421b-ae34-7bf0df8ad7b2' and active and role='admin' limit 1),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare original public.sales_opportunities; changed public.sales_opportunities; registered_name text;
begin
 select * into original from public.sales_opportunities where organization_id='0e398095-cc22-421b-ae34-7bf0df8ad7b2' and archived_at is null and client_id is not null and stage='lost' limit 1;
 if original.id is null then raise exception 'Missing fixture';end if;
 select name into registered_name from public.clients where id=original.client_id;
 update public.sales_opportunities set name='TEST OVERRIDE' where id=original.id;
 select * into changed from public.sales_opportunities where id=original.id;
 if changed.name<>registered_name then raise exception 'Linked registration not authoritative';end if;
 if (to_jsonb(changed)-'name'-'updated_at') is distinct from (to_jsonb(original)-'name'-'updated_at') then raise exception 'Commercial fields changed';end if;
 update public.clients set name='TEST REGISTERED NAME ROLLBACK' where id=original.client_id;
 select * into changed from public.sales_opportunities where id=original.id;
 if changed.name<>'TEST REGISTERED NAME ROLLBACK' then raise exception 'Registration rename not propagated';end if;
 if (to_jsonb(changed)-'name'-'updated_at') is distinct from (to_jsonb(original)-'name'-'updated_at') then raise exception 'Rename changed commercial fields';end if;
 if has_function_privilege('authenticated','private.crm_registered_opportunity_name()','EXECUTE') or has_function_privilege('anon','private.crm_refresh_registered_name()','EXECUTE') then raise exception 'Internal function exposed';end if;
end $$;
reset role;
set constraints all immediate;
rollback;
