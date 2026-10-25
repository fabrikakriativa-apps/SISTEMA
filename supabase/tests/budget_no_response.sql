begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.memberships where active and role='admin' limit 1),true);
set local role authenticated;
do $test$
declare org uuid;c uuid;op uuid;doc public.budgets;kind text;revision int;version_count int;due timestamptz;
begin
 select organization_id into org from public.memberships where user_id=auth.uid() and active limit 1;
 foreach kind in array array['pre_budget','budget'] loop
  insert into public.clients(organization_id,name,client_type,created_by) values(org,'NO RESPONSE TEST ONLY','Cliente final',auth.uid()) returning id into c;
  select id into op from public.sales_opportunities where client_id=c and organization_id=org;
  doc:=public.create_commercial_draft(org,kind);
  update public.budgets set client_id=c where id=doc.id;
  insert into public.budget_items(organization_id,budget_id,position,description,quantity,cost_total,sale_total,affects_total) values(org,doc.id,1,'NO RESPONSE TEST',1,10,20,true);
  begin perform public.change_budget_status(org,doc.id,'no_response',null);raise exception 'Unsent document accepted';exception when check_violation then null;end;
  doc:=public.mark_budget_sent(org,doc.id);revision:=doc.current_revision;
  select count(*) into version_count from public.budget_versions where budget_id=doc.id;
  select next_follow_up_at into due from public.sales_opportunities where id=op;
  doc:=public.change_budget_status(org,doc.id,'no_response',null);
  if doc.status<>'no_response' or doc.total<>20 or doc.current_revision<>revision then raise exception 'Pending response changed values';end if;
  if not exists(select 1 from public.sales_opportunities where id=op and stage='budgeting' and response_status='no_response' and profile_status='unassessed' and next_follow_up_at is not distinct from due) then raise exception 'No response closed or modified the lead';end if;
  begin perform public.change_budget_status(gen_random_uuid(),doc.id,'sent',null);raise exception 'Cross org accepted';exception when insufficient_privilege then null;end;
  doc:=public.change_budget_status(org,doc.id,'sent',null);
  if doc.status<>'sent' or doc.current_revision<>revision or (select count(*) from public.budget_versions where budget_id=doc.id)<>version_count then raise exception 'Resume created new revision';end if;
  if (select response_status from public.sales_opportunities where id=op)<>'waiting' then raise exception 'CRM response not resumed';end if;
  perform public.change_budget_status(org,doc.id,'no_response',null);
  doc:=public.change_budget_status(org,doc.id,'rejected','Cliente decidiu não seguir');
  if not exists(select 1 from public.sales_opportunities where id=op and stage='lost' and response_status<>'no_response') then raise exception 'Explicit loss still treated as pending';end if;
  doc:=public.change_budget_status(org,doc.id,'draft',null);
  doc:=public.mark_budget_sent(org,doc.id);
  perform public.change_budget_status(org,doc.id,'no_response',null);
  doc:=public.change_budget_status(org,doc.id,'cancelled','Registro em duplicidade');
  if doc.status<>'cancelled' then raise exception 'Cancellation unavailable';end if;
 end loop;
end $test$;
set constraints all immediate;
rollback;
