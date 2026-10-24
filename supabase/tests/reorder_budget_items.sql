begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.memberships where active and role='admin' limit 1),true);
set local role authenticated;
do $test$
declare org uuid;doc public.budgets;c uuid;a uuid;b uuid;before_hash text;after_hash text;total_before numeric;
begin
 select organization_id into org from public.memberships where user_id=auth.uid() and active limit 1;
 insert into public.clients(organization_id,name,client_type,created_by) values(org,'REORDER TEST ONLY','Cliente final',auth.uid()) returning id into c;
 doc:=public.create_commercial_draft(org,'budget');
 update public.budgets set client_id=c where id=doc.id;
 insert into public.budget_items(organization_id,budget_id,position,description,quantity,cost_total,sale_total,affects_total) values(org,doc.id,1,'REORDER A',1,10,30,true) returning id into a;
 insert into public.budget_items(organization_id,budget_id,position,description,quantity,cost_total,sale_total,affects_total,presentation) values(org,doc.id,2,'REORDER B',2,20,50,false,'option') returning id into b;
 select md5(string_agg(id::text||quantity::text||cost_total::text||sale_total::text||affects_total::text||configuration::text,',' order by id)) into before_hash from public.budget_items where budget_id=doc.id;
 select total into total_before from public.budgets where id=doc.id;
 perform public.reorder_budget_items(org,doc.id,array[b,a],array[a,b]);
 perform public.reorder_budget_items(org,doc.id,array[b,a],array[a,b]);
 if (select position from public.budget_items where id=b)<>1 or (select position from public.budget_items where id=a)<>2 then raise exception 'Order not saved';end if;
 select md5(string_agg(id::text||quantity::text||cost_total::text||sale_total::text||affects_total::text||configuration::text,',' order by id)) into after_hash from public.budget_items where budget_id=doc.id;
 if before_hash<>after_hash or total_before<>(select total from public.budgets where id=doc.id) then raise exception 'Values modified';end if;
 begin perform public.reorder_budget_items(org,doc.id,array[a,a],array[b,a]);raise exception 'Duplicates accepted';exception when check_violation then null;end;
 begin perform public.reorder_budget_items(org,doc.id,array[a],array[b,a]);raise exception 'Missing item accepted';exception when check_violation then null;end;
 begin perform public.reorder_budget_items(org,doc.id,array[a,gen_random_uuid()],array[b,a]);raise exception 'Foreign item accepted';exception when check_violation then null;end;
 begin perform public.reorder_budget_items(org,doc.id,array[a,b],array[a,b]);raise exception 'Stale order accepted';exception when serialization_failure then null;end;
 begin perform public.reorder_budget_items(gen_random_uuid(),doc.id,array[a,b],array[b,a]);raise exception 'Cross org accepted';exception when insufficient_privilege then null;end;
 perform public.mark_budget_sent(org,doc.id);
 begin perform public.reorder_budget_items(org,doc.id,array[a,b],array[b,a]);raise exception 'Sent version modified';exception when check_violation then null;end;
end $test$;
set constraints all immediate;
rollback;

