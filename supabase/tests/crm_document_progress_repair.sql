begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.memberships where organization_id='0e398095-cc22-421b-ae34-7bf0df8ad7b2' and active and role='admin' limit 1),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated')::text,true);
-- Fixture setup uses the owner role only; lifecycle is intentionally not client-writable.
do $$declare c uuid;begin
 insert into public.clients(organization_id,name,client_type,crm_lifecycle,created_by) values('0e398095-cc22-421b-ae34-7bf0df8ad7b2','TEST CRM PROGRESS REPAIR','Cliente final','legacy',auth.uid()) returning id into c;
 perform set_config('app.crm_test_client',c::text,true);
end $$;
set local role authenticated;
do $test$
declare org uuid:='0e398095-cc22-421b-ae34-7bf0df8ad7b2';c uuid;o uuid;second_opp uuid;doc public.budgets;doc2 public.budgets;old_due timestamptz;
begin
 -- Existing legacy contact has no automatic opportunity, but a new document must create one.
 c:=current_setting('app.crm_test_client')::uuid;
 if exists(select 1 from public.sales_opportunities where client_id=c) then raise exception 'Unexpected legacy opportunity';end if;
 doc:=public.create_commercial_draft(org,'pre_budget');
 update public.budgets set client_id=c where id=doc.id;
 select id into o from public.sales_opportunities where client_id=c and budget_id=doc.id;
 if o is null then raise exception 'Missing automatic opportunity';end if;
 insert into public.budget_items(organization_id,budget_id,position,description,quantity,cost_total,sale_total,affects_total) values(org,doc.id,1,'TEST',1,10,20,true);
 perform public.mark_budget_sent(org,doc.id);
 if (select commercial_phase from public.sales_opportunities where id=o)<>'proposal_sent' then raise exception 'Sent did not advance';end if;
 old_due:=now()-interval '2 days';
 update public.sales_opportunities set next_follow_up_at=old_due where id=o;
 -- Mimic reopening the document for a new revision without changing its send history.
 update public.budgets set status='draft' where id=doc.id;
 if (select commercial_phase from public.sales_opportunities where id=o)<>'proposal_sent' then raise exception 'Draft revision regressed progress';end if;
 update public.sales_opportunities set commercial_phase='preparing' where id=o;
 if (select commercial_phase from public.sales_opportunities where id=o)<>'proposal_sent' then raise exception 'Historical send was ignored';end if;
 if (select next_follow_up_at from public.sales_opportunities where id=o) is distinct from old_due then raise exception 'Existing follow-up changed';end if;
 doc2:=public.create_commercial_draft(org,'budget');
 update public.budgets set client_id=c where id=doc2.id;
 if not exists(select 1 from public.sales_opportunities where id=o and doc2.id=any(related_budget_ids) and commercial_phase='proposal_sent') then raise exception 'Secondary draft regressed progress';end if;
 update public.sales_opportunities set commercial_phase='negotiating' where id=o;
 update public.budgets set status='sent' where id=doc2.id;
 if (select commercial_phase from public.sales_opportunities where id=o)<>'negotiating' then raise exception 'Negotiation overwritten';end if;
 update public.sales_opportunities set stage='lost',commercial_phase='lost',lost_reason='TEST CLOSED' where id=o;
 update public.budgets set status='sent' where id=doc.id;
 if (select stage from public.sales_opportunities where id=o)<>'lost' then raise exception 'Closed lead reopened';end if;
 if (select count(*) from public.sales_opportunities where client_id=c)<>1 then raise exception 'Duplicate opportunity';end if;
 -- Ambiguous ownership remains explicit, never attached by client name.
 insert into public.sales_opportunities(organization_id,client_id,name,created_by) values(org,c,'TEST ACTIVE ONE',auth.uid()) returning id into o;
 insert into public.sales_opportunities(organization_id,client_id,name,created_by) values(org,c,'TEST ACTIVE TWO',auth.uid()) returning id into second_opp;
 doc2:=public.create_commercial_draft(org,'pre_budget');update public.budgets set client_id=c where id=doc2.id;
 if exists(select 1 from public.sales_opportunities where budget_id=doc2.id or doc2.id=any(related_budget_ids)) then raise exception 'Ambiguous link guessed';end if;
end $test$;
set constraints all immediate;
rollback;

