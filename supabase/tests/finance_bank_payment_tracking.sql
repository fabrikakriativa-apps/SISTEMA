begin;

select set_config('request.jwt.claim.sub','85bf0952-2dc8-4948-873a-97ffa45c159b',true);
set local role authenticated;
do $test$
declare org uuid:='0e398095-cc22-421b-ae34-7bf0df8ad7b2'; b1 uuid; b2 uuid; p uuid; r uuid; n int;
begin
 insert into public.finance_banks(organization_id,name) values(org,'__TEST_BANK_A__') returning id into b1;
 insert into public.finance_banks(organization_id,name) values(org,'__TEST_BANK_B__') returning id into b2;
 select id into p from public.payables where organization_id=org and status in ('open','overdue') and paid_amount=0 and amount>2 limit 1;
 if p is null then raise exception 'Missing payable test candidate'; end if;
 perform public.register_payable_payment_with_bank(org,p,'single',1,current_date,b1);
 perform public.register_payable_payment_with_bank(org,p,'single',1,current_date,b2);
 select count(*) into n from public.bank_cash_entries where payable_id=p and bank_id in (b1,b2) and amount=1 and reversed_at is null;
 if n<>2 then raise exception 'Partial split failed'; end if;
 perform public.reverse_payable_payment(org,p,'single','Teste transacional de estorno');
 if exists(select 1 from public.bank_cash_entries where payable_id=p and reversed_at is null) then raise exception 'Reversal failed'; end if;
 select id into r from public.receivables where organization_id=org and status in ('open','overdue') and paid_amount=0 and amount>2 limit 1;
 if r is null then raise exception 'Missing receivable test candidate'; end if;
 perform public.register_receivable_payment_with_bank(org,r,'single',1,current_date,b1);
 if not exists(select 1 from public.bank_cash_entries where receivable_id=r and bank_id=b1 and amount=1 and direction='in') then raise exception 'Receipt failed'; end if;
 perform public.reverse_receivable_payment(org,r,'single','Teste transacional de estorno');
 begin
  perform public.register_receivable_payment_with_bank(org,r,'single',1,current_date,null);
  raise exception 'Missing bank accepted';
 exception when check_violation then null; end;
 begin
  insert into public.bank_cash_entries(organization_id,bank_id,receivable_id,amount,direction,movement_date,actor_id) values(org,b1,r,1,'in',current_date,auth.uid());
  raise exception 'Direct ledger insert accepted';
 exception when insufficient_privilege then null; end;
end; $test$;
reset role;
select 'bank payments, split, receipt, reversal, null bank and ledger permissions passed' as tests;

rollback;
