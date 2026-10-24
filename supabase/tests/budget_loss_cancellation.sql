begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.memberships where active and role='admin' limit 1),true);
set local role authenticated;
do $test$
declare org uuid;c uuid;op uuid;other_op uuid;doc public.budgets;other public.budgets;kind text;revisions int;
begin
 select organization_id into org from public.memberships where user_id=auth.uid() and active limit 1;
 foreach kind in array array['pre_budget','budget'] loop
  insert into public.clients(organization_id,name,client_type,created_by) values(org,'STATUS TEST ONLY','Cliente final',auth.uid()) returning id into c;
  select id into op from public.sales_opportunities where organization_id=org and client_id=c;
  doc:=public.create_commercial_draft(org,kind);
  update public.budgets set client_id=c where id=doc.id;
  begin perform public.change_budget_status(org,doc.id,'rejected','');raise exception 'Missing reason accepted';exception when check_violation then null;end;
  revisions:=doc.current_revision;
  doc:=public.change_budget_status(org,doc.id,'rejected','Cliente não seguirá com a compra');
  if doc.status<>'rejected' or doc.status_reason is null or doc.status_changed_at is null then raise exception 'Loss metadata missing';end if;
  if not exists(select 1 from public.sales_opportunities where id=op and stage='lost' and next_follow_up_at is null and profile_status='unassessed') then raise exception 'Scoped CRM loss failed';end if;
  doc:=public.change_budget_status(org,doc.id,'draft',null);
  if doc.status<>'draft' or doc.current_revision<>revisions+1 or doc.status_reason is not null then raise exception 'Reopen failed';end if;
  if not exists(select 1 from public.sales_opportunities where id=op and stage='budgeting') then raise exception 'CRM reopen failed';end if;
  -- A second active proposal for the same negotiation must remain open.
  other:=public.create_commercial_draft(org,kind);
  update public.budgets set client_id=c where id=other.id;
  perform public.change_budget_status(org,doc.id,'rejected','Cliente descartou esta alternativa');
  if (select stage from public.sales_opportunities where id=op)='lost' then raise exception 'Other live proposal was closed';end if;
  perform public.change_budget_status(org,doc.id,'cancelled','Duplicidade confirmada no cadastro');
  if (select status from public.budgets where id=other.id)<>'draft' then raise exception 'Other document modified';end if;
  if (select stage from public.sales_opportunities where id=op)='lost' then raise exception 'Cancellation closed the lead';end if;
  begin perform public.change_budget_status(org,doc.id,'draft',null);raise exception 'Cancelled document reopened';exception when check_violation then null;end;
  begin perform public.change_budget_status(gen_random_uuid(),other.id,'rejected','Foreign organization');raise exception 'Cross org accepted';exception when insufficient_privilege then null;end;
  -- A later manual CRM decision must not be undone by a document reopen.
  perform public.change_budget_status(org,other.id,'rejected','Negociação encerrada pelo orçamento');
  update public.sales_opportunities set lost_reason='Decisão manual posterior' where id=op;
  perform public.change_budget_status(org,other.id,'draft',null);
  if not exists(select 1 from public.sales_opportunities where id=op and stage='lost' and lost_reason='Decisão manual posterior') then raise exception 'Manual CRM decision overwritten';end if;
 end loop;
 -- Approval remains terminal: no accidental cancellation of an existing order.
 doc:=public.create_commercial_draft(org,'budget');
 insert into public.clients(organization_id,name,client_type,created_by) values(org,'STATUS APPROVAL TEST ONLY','Cliente final',auth.uid()) returning id into c;
 update public.budgets set client_id=c where id=doc.id;
 insert into public.budget_items(organization_id,budget_id,position,description,quantity,cost_total,sale_total,affects_total) values(org,doc.id,1,'STATUS TEST',1,10,20,true);
 perform public.mark_budget_sent(org,doc.id);
 perform public.approve_budget_and_create_order(org,doc.id);
 begin perform public.change_budget_status(org,doc.id,'rejected','Should not lose order');raise exception 'Approved loss accepted';exception when check_violation then null;end;
 begin perform public.change_budget_status(org,doc.id,'cancelled','Should not cancel order');raise exception 'Approved cancel accepted';exception when check_violation then null;end;
end $test$;
set constraints all immediate;
rollback;
