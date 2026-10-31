begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.memberships where organization_id='0e398095-cc22-421b-ae34-7bf0df8ad7b2' and active and role='admin' limit 1),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare original public.sales_opportunities; changed public.sales_opportunities; value text; activity uuid;
begin
 select * into original from public.sales_opportunities where organization_id='0e398095-cc22-421b-ae34-7bf0df8ad7b2' and archived_at is null and commercial_phase='proposal_sent' limit 1;
 if original.id is null then raise exception 'Missing fixture'; end if;
 foreach value in array array['no_interaction','pre_proposal_no_response','proposal_no_response'] loop
  update public.sales_opportunities set response_status=value where id=original.id;
  select * into changed from public.sales_opportunities where id=original.id;
  if changed.response_status<>value or changed.profile_status is distinct from original.profile_status or changed.stage is distinct from original.stage or changed.commercial_phase is distinct from original.commercial_phase or changed.next_follow_up_at is distinct from original.next_follow_up_at or changed.budget_id is distinct from original.budget_id then raise exception 'Classification changed unrelated progress'; end if;
  if not exists(select 1 from public.sales_tracking_history where entity_type='opportunity' and entity_id=original.id and state->>'response_status'=value) then raise exception 'Missing historical snapshot';end if;
  activity:=gen_random_uuid();
  perform public.register_sales_contact(original.organization_id,original.id,activity,now(),'whatsapp','outbound','no_response','TEST ROLLBACK',null);
  if (select response_status from public.sales_opportunities where id=original.id)<>value then raise exception 'Attempt erased classification';end if;
  -- Restore the schedule so the next iteration can check unrelated metadata.
  update public.sales_opportunities set next_follow_up_at=original.next_follow_up_at where id=original.id;
 end loop;
 perform public.register_sales_contact(original.organization_id,original.id,gen_random_uuid(),now(),'whatsapp','inbound','answered','TEST ROLLBACK',null);
 if (select response_status from public.sales_opportunities where id=original.id)<>'active' then raise exception 'Real response did not resume attendance';end if;
 begin
  update public.sales_opportunities set response_status='invalid' where id=original.id;
  raise exception 'Invalid value accepted';
 exception when check_violation then null;end;
end $$;
set constraints all immediate;
rollback;
