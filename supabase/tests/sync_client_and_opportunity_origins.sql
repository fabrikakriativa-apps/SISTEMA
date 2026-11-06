begin;

select set_config('request.jwt.claim.sub','85bf0952-2dc8-4948-873a-97ffa45c159b',true);
set local role authenticated;
do $test$
declare org uuid:='0e398095-cc22-421b-ae34-7bf0df8ad7b2'; target uuid; client uuid; previous jsonb;
begin
 select id,client_id,to_jsonb(s)-array['origin','updated_at'] into target,client,previous from public.sales_opportunities s where organization_id=org and client_id is not null and archived_at is null and capture_kind='paid' limit 1;
 if target is null then raise exception 'No linked test opportunity';end if;
 update public.clients set origin='Google' where id=client and organization_id=org;
 if exists(select 1 from public.sales_opportunities where organization_id=org and client_id=client and archived_at is null and origin is distinct from 'Google') then raise exception 'Client to lead sync failed';end if;
 update public.sales_opportunities set origin='Meta — Instagram/Facebook' where id=target and organization_id=org;
 if not exists(select 1 from public.clients where id=client and origin='Meta — Instagram/Facebook') then raise exception 'Lead to client sync failed';end if;
 update public.sales_opportunities set origin=null where id=target and organization_id=org;
 if exists(select 1 from public.clients where id=client and origin is not null) then raise exception 'Clearing origin failed';end if;
 if (select to_jsonb(s)-array['origin','updated_at'] from public.sales_opportunities s where id=target) is distinct from previous then raise exception 'Commercial metadata changed';end if;
 begin
  insert into public.sales_opportunities(organization_id,name,client_id) values(org,'__ORIGIN_TEST__','00000000-0000-0000-0000-000000000001');
  raise exception 'Invalid client accepted';
 exception when check_violation then null; end;
end; $test$;
reset role;
select 'bidirectional updates, clearing, tenant validation and commercial data preservation passed' as tests;

rollback;
