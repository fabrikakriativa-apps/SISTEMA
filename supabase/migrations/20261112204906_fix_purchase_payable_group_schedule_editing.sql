CREATE OR REPLACE FUNCTION private.update_purchase_payable_schedule(org_id uuid, target_group_id uuid, payable_description text, payable_supplier_id uuid, payable_method text, installments_json jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE p public.payables; line jsonb; n integer:=0; cnt integer;
BEGIN
 IF auth.uid() IS NULL OR NOT private.has_org_role(org_id,array['admin','financeiro']::public.app_role[]) THEN RAISE EXCEPTION 'Not authorized' USING errcode='42501'; END IF;
 IF jsonb_typeof(installments_json) IS DISTINCT FROM 'array' OR length(btrim(coalesce(payable_description,'')))=0 OR length(btrim(coalesce(payable_method,'')))=0 THEN RAISE EXCEPTION 'Invalid payable data' USING errcode='23514'; END IF;
 PERFORM 1 FROM public.payables WHERE organization_id=org_id AND group_id=target_group_id ORDER BY installment,id FOR UPDATE;
 SELECT count(*) INTO cnt FROM public.payables WHERE organization_id=org_id AND group_id=target_group_id;
 IF cnt=0 OR cnt<>jsonb_array_length(installments_json) THEN RAISE EXCEPTION 'Mantenha a quantidade de parcelas da compra.' USING errcode='23514'; END IF;
 FOR p IN SELECT * FROM public.payables WHERE organization_id=org_id AND group_id=target_group_id ORDER BY installment,id LOOP
   line:=installments_json->n; n:=n+1;
   IF p.purchase_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.purchases c WHERE c.id=p.purchase_id AND c.organization_id=org_id AND c.status::text<>'cancelled') THEN RAISE EXCEPTION 'Invalid purchase' USING errcode='23514'; END IF;
   IF payable_supplier_id IS DISTINCT FROM p.supplier_id THEN RAISE EXCEPTION 'Altere o fornecedor pela compra de origem.' USING errcode='23514'; END IF;
   IF nullif(line->>'amount','') IS NULL OR (line->>'amount')::numeric<=0 OR (line->>'amount')::numeric='NaN'::numeric OR round((line->>'amount')::numeric,2)<>(line->>'amount')::numeric OR nullif(line->>'due_date','') IS NULL THEN RAISE EXCEPTION 'Invalid installment data' USING errcode='23514'; END IF;
   IF p.paid_amount>0 OR p.status NOT IN ('open','overdue') THEN
     IF nullif(line->>'id','')::uuid IS DISTINCT FROM p.id OR (line->>'amount')::numeric IS DISTINCT FROM p.amount OR (line->>'due_date')::date IS DISTINCT FROM p.due_date THEN RAISE EXCEPTION 'Paid installments must remain unchanged' USING errcode='23514'; END IF;
   ELSE
     IF nullif(line->>'id','') IS NOT NULL AND (line->>'id')::uuid<>p.id THEN RAISE EXCEPTION 'Invalid installment id' USING errcode='23514'; END IF;
     UPDATE public.payables SET amount=(line->>'amount')::numeric,due_date=(line->>'due_date')::date,payment_method=btrim(payable_method) WHERE id=p.id AND organization_id=org_id;
   END IF;
 END LOOP;
END $fn$;
REVOKE ALL ON FUNCTION private.update_purchase_payable_schedule(uuid,uuid,text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.save_allocated_payable_group(org_id uuid, target_group_id uuid, payable_description text, payable_supplier_id uuid, payable_method text, installments_json jsonb, allocations_json jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare grp uuid:=target_group_id; line jsonb; total numeric; allocated numeric; previous jsonb;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','financeiro']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 if jsonb_typeof(allocations_json) is distinct from 'array' or jsonb_array_length(allocations_json)>60 then raise exception 'Invalid allocations' using errcode='23514'; end if;
 select sum((x->>'amount')::numeric) into total from jsonb_array_elements(installments_json) x;
 select coalesce(sum((x->>'amount')::numeric),0) into allocated from jsonb_array_elements(allocations_json) x;
 if jsonb_array_length(allocations_json)>0 and allocated is distinct from total then raise exception 'O rateio deve somar o valor total.' using errcode='23514'; end if;
 -- Lock referenced orders in stable order, also serializing with cancellation.
 perform 1 from public.orders o where o.organization_id=org_id and o.id in(select (x->>'order_id')::uuid from jsonb_array_elements(allocations_json) x) order by o.id for update;
 for line in select value from jsonb_array_elements(allocations_json) loop
   if (line->>'amount')::numeric is null or (line->>'amount')::numeric<=0 or round((line->>'amount')::numeric,2)<>(line->>'amount')::numeric then raise exception 'Invalid allocation amount' using errcode='23514'; end if;
   if not exists(select 1 from public.orders where id=(line->>'order_id')::uuid and organization_id=org_id and status<>'cancelled') then raise exception 'Invalid order' using errcode='23514'; end if;
   if nullif(line->>'budget_item_id','') is not null and not exists(select 1 from public.order_items where organization_id=org_id and order_id=(line->>'order_id')::uuid and budget_item_id=(line->>'budget_item_id')::uuid and status<>'cancelled') then raise exception 'Invalid order item' using errcode='23514'; end if;
 end loop;
 if grp is null then
   select p.group_id into grp from public.create_manual_payable_group_with_link(org_id,payable_description,payable_supplier_id,null,null,payable_method,installments_json) p limit 1;
 else
   select jsonb_agg(to_jsonb(a)) into previous from public.payable_allocations a where organization_id=org_id and group_id=grp;
   if exists(select 1 from public.payables p where p.organization_id=org_id and p.group_id=grp and p.purchase_id is not null) then
     perform private.update_purchase_payable_schedule(org_id,grp,payable_description,payable_supplier_id,payable_method,installments_json);
   else
     perform public.update_manual_payable_group(org_id,grp,payable_description,payable_supplier_id,null,null,payable_method,installments_json);
   end if;
 end if;
 delete from public.payable_allocations where organization_id=org_id and group_id=grp;
 insert into public.payable_allocations(organization_id,group_id,order_id,budget_item_id,amount)
 select org_id,grp,(x->>'order_id')::uuid,nullif(x->>'budget_item_id','')::uuid,(x->>'amount')::numeric from jsonb_array_elements(allocations_json) x;
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data)
 values(org_id,auth.uid(),'payables',grp,'allocation_saved',previous,allocations_json);
 return grp;
end; $function$
;