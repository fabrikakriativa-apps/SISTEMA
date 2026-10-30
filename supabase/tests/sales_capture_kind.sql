begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.memberships where organization_id='0e398095-cc22-421b-ae34-7bf0df8ad7b2' and active and role='admin' limit 1),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare before_row public.sales_opportunities;after_row public.sales_opportunities;client_origin text;
begin
 select * into before_row from public.sales_opportunities where organization_id='0e398095-cc22-421b-ae34-7bf0df8ad7b2' and archived_at is null and commercial_phase='proposal_sent' limit 1;
 if before_row.id is null then raise exception 'No test fixture';end if;
 select origin into client_origin from public.clients where id=before_row.client_id;
 update public.sales_opportunities set capture_kind='paid',campaign='TEST ROLLBACK',origin='Meta — Instagram/Facebook' where id=before_row.id;
 select * into after_row from public.sales_opportunities where id=before_row.id;
 if after_row.capture_kind<>'paid' or after_row.campaign<>'TEST ROLLBACK' then raise exception 'Attribution not persisted';end if;
 if after_row.stage is distinct from before_row.stage or after_row.commercial_phase is distinct from before_row.commercial_phase or after_row.next_follow_up_at is distinct from before_row.next_follow_up_at or after_row.budget_id is distinct from before_row.budget_id or after_row.related_budget_ids is distinct from before_row.related_budget_ids or after_row.profile_status is distinct from before_row.profile_status then raise exception 'CRM progress was changed';end if;
 if (select origin from public.clients where id=before_row.client_id) is distinct from client_origin then raise exception 'Contact registration was overwritten';end if;
 update public.sales_opportunities set capture_kind='organic' where id=before_row.id;
 if (select campaign from public.sales_opportunities where id=before_row.id)<>'TEST ROLLBACK' then raise exception 'Campaign data lost';end if;
 begin
  update public.sales_opportunities set capture_kind='invalid' where id=before_row.id;
  raise exception 'Invalid attribution accepted';
 exception when check_violation then null;end;
end $$;
set constraints all immediate;
rollback;

