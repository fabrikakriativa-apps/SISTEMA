BEGIN;
select set_config('request.jwt.claim.sub',(select user_id::text from public.memberships where organization_id='0e398095-cc22-421b-ae34-7bf0df8ad7b2' and active and role='admin' limit 1),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated')::text,true);
set local role authenticated;
DO $test$
DECLARE org uuid:='0e398095-cc22-421b-ae34-7bf0df8ad7b2';item uuid;vendor uuid;n1 public.procurement_needs;n2 public.procurement_needs;p uuid:=gen_random_uuid();data jsonb;
BEGIN
 SELECT i.id INTO item FROM public.order_items i JOIN public.orders o ON o.id=i.order_id WHERE i.organization_id=org AND o.status NOT IN ('cancelled','completed') LIMIT 1;
 SELECT id INTO vendor FROM public.suppliers WHERE organization_id=org AND active LIMIT 1;
 n1:=public.save_procurement_need_supplier(org,null,item,null,'Teste descartável primeiro',1,'un',400,null,'Teste',false);
 n2:=public.save_procurement_need_supplier(org,null,item,null,'Teste descartável segundo',1,'un',263,null,'Teste',false);
 PERFORM public.manage_purchasing(org,p,'order_later',jsonb_build_object('supplier_id',vendor,'ordered_at',current_date,'lines',jsonb_build_array(jsonb_build_object('id',n1.id,'unit_cost',400))));
 data:=jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('id',n2.id)));
 PERFORM public.manage_purchasing(org,p,'append',data);
 PERFORM public.manage_purchasing(org,p,'append',data);
 IF (SELECT count(*) FROM public.purchase_items WHERE purchase_id=p)<>2 OR (SELECT total FROM public.purchases WHERE id=p)<>663 OR EXISTS(SELECT 1 FROM public.payables WHERE purchase_id=p) THEN RAISE EXCEPTION 'Vínculo ao pedido existente duplicou item ou gerou financeiro';END IF;
END $test$;
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT 'PASS: append existing supplier order, forecast retained, replay safe, no finance' AS result;
ROLLBACK;
