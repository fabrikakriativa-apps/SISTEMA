BEGIN;
select set_config('request.jwt.claim.sub',(select user_id::text from public.memberships where organization_id='0e398095-cc22-421b-ae34-7bf0df8ad7b2' and active and role='admin' limit 1),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated')::text,true);
set local role authenticated;
DO $test$
DECLARE org uuid:='0e398095-cc22-421b-ae34-7bf0df8ad7b2';item uuid;vendor uuid;n public.procurement_needs;p uuid;grp uuid;v numeric;expected numeric;pi uuid;
BEGIN
 SELECT i.id INTO item FROM public.order_items i JOIN public.orders o ON o.id=i.order_id WHERE i.organization_id=org AND o.status NOT IN ('cancelled','completed') LIMIT 1;
 SELECT id INTO vendor FROM public.suppliers WHERE organization_id=org AND active LIMIT 1;
 IF item IS NULL OR vendor IS NULL THEN RAISE EXCEPTION 'Missing fixture';END IF;
 FOREACH expected IN ARRAY ARRAY[598::numeric,598.01::numeric] LOOP
  n:=public.save_procurement_need_supplier(org,null,item,null,'Teste descartável desconto',13,'m',51,null,'Teste',false);p:=gen_random_uuid();
  PERFORM public.manage_purchasing(org,p,'direct',jsonb_build_object('supplier_id',vendor,'lines',jsonb_build_array(jsonb_build_object('id',n.id,'unit_cost',round(expected/13,2),'actual_total',expected)),'ordered_at',current_date,'first_due',current_date,'method','PIX','installments',1,'paid',true,'received_at',current_date,'completed',false,'parts',jsonb_build_array(jsonb_build_object('amount',expected,'due_date',current_date))));
  IF (SELECT total FROM public.purchases WHERE id=p)<>expected THEN RAISE EXCEPTION 'Total real perdeu centavos';END IF;
  IF (SELECT sum(amount) FROM public.payables WHERE purchase_id=p)<>expected OR (SELECT sum(paid_amount) FROM public.payables WHERE purchase_id=p)<>expected THEN RAISE EXCEPTION 'Financeiro incorreto';END IF;
  SELECT group_id INTO grp FROM public.payables WHERE purchase_id=p LIMIT 1;
  IF (SELECT sum(amount) FROM public.payable_allocations WHERE group_id=grp)<>expected THEN RAISE EXCEPTION 'Rateio incorreto';END IF;
  IF (SELECT unit_cost FROM public.procurement_needs WHERE id=n.id)<>51 THEN RAISE EXCEPTION 'Previsão alterada';END IF;
  PERFORM public.manage_purchasing(org,p,'direct','{}');
  IF (SELECT count(*) FROM public.payables WHERE purchase_id=p)<>1 THEN RAISE EXCEPTION 'Financeiro duplicado';END IF;
 END LOOP;
 n:=public.save_procurement_need_supplier(org,null,item,null,'Teste confirmação desconto',13,'m',51,null,'Teste',false);p:=gen_random_uuid();
 PERFORM public.manage_purchasing(org,p,'create',jsonb_build_object('supplier_id',vendor,'lines',jsonb_build_array(jsonb_build_object('id',n.id,'unit_cost',51))));
 SELECT id INTO pi FROM public.purchase_items WHERE purchase_id=p LIMIT 1;
 PERFORM public.manage_purchasing(org,p,'confirm',jsonb_build_object('supplier_id',vendor,'lines',jsonb_build_array(jsonb_build_object('id',pi,'quantity',13,'unit_cost',46,'actual_total',598)),'ordered_at',current_date,'first_due',current_date,'method','PIX','installments',1,'paid',false,'parts',jsonb_build_array(jsonb_build_object('amount',598,'due_date',current_date))));
 IF (SELECT total FROM public.purchases WHERE id=p)<>598 THEN RAISE EXCEPTION 'Confirmação ignorou desconto';END IF;
END $test$;
RESET ROLE;
SELECT 'PASS: direct 598 and 598.01, paid, allocations, forecast unchanged, idempotency, draft confirmation' AS result;

ROLLBACK;
