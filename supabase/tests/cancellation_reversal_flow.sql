begin;

do $$
declare
 org uuid;actor uuid;v_client uuid:=gen_random_uuid();v_supplier uuid:=gen_random_uuid();v_family uuid;v_budget uuid;v_item uuid:=gen_random_uuid();v_order uuid;v_order_item uuid;v_need uuid;v_purchase uuid;v_payable uuid;v_receivable uuid;actual text;blocked boolean;
begin
 select organization_id,user_id into org,actor from public.memberships where role='admin' and active limit 1;
 if org is null then raise exception 'Integration test requires an active admin';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
 select id into v_family from public.item_families where organization_id=org and form_key='curtain' and active limit 1;
 insert into public.clients(id,organization_id,client_type,name,created_by) values(v_client,org,'Cliente final','TESTE CANCELAMENTO',actor);
 insert into public.suppliers(id,organization_id,name,supplier_types) values(v_supplier,org,'FORNECEDOR TESTE CANCELAMENTO',array['Cortina']);
 select id into v_budget from public.create_budget_draft(org);update public.budgets set client_id=v_client where id=v_budget;
 insert into public.budget_items(id,organization_id,budget_id,family_id,position,description,quantity,configuration,cost_total,margin_percent,sale_total) values(v_item,org,v_budget,v_family,1,'Cortina teste cancelamento',1,'{"manufacturer_cost":100}',100,50,150);
 perform public.replace_budget_item_cost_lines(org,v_item,jsonb_build_array(jsonb_build_object('kind','product','description','Cortina fabricante','quantity',1,'unit','un','unit_cost',100)));
 perform public.change_budget_status(org,v_budget,'sent',null);select id into v_order from public.approve_budget_and_create_order(org,v_budget);select id into v_order_item from public.order_items where order_id=v_order;
 perform public.configure_order_receivables(org,v_order,1,current_date,'PIX');select id into v_receivable from public.receivables where order_id=v_order;
 select id into v_need from public.procurement_needs where order_item_id=v_order_item;select id into v_purchase from public.create_supplier_purchase(org,array[v_need],v_supplier,'made_to_order');perform public.confirm_supplier_purchase(org,v_purchase,v_supplier,'PED-CANCELA',current_date,'Boleto',1);select id into v_payable from public.payables where purchase_id=v_purchase;

 perform public.register_payable_payment(org,v_payable,'single',100,current_date);
 blocked:=false;begin perform public.cancel_supplier_purchase(org,v_purchase,'Teste de bloqueio');exception when sqlstate '23514' then blocked:=true;end;
 if not blocked then raise exception 'Paid purchase cancellation was not blocked';end if;
 perform public.reverse_payable_payment(org,v_payable,'single','Correção para cancelamento');perform public.cancel_supplier_purchase(org,v_purchase,'Cancelamento após estorno');
 select status into actual from public.payables where id=v_payable;if actual<>'cancelled' then raise exception 'Payable not cancelled: %',actual;end if;
 select status into actual from public.procurement_needs where id=v_need;if actual<>'awaiting_purchase' then raise exception 'Need not released: %',actual;end if;
 select status::text into actual from public.order_items where id=v_order_item;if actual<>'awaiting_purchase' then raise exception 'Item not returned to purchase: %',actual;end if;

 perform public.register_receivable_payment(org,v_receivable,'single',150,current_date);
 blocked:=false;begin perform public.cancel_customer_order(org,v_order,'Teste de bloqueio financeiro');exception when sqlstate '23514' then blocked:=true;end;
 if not blocked then raise exception 'Order cancellation with receipt was not blocked';end if;
 perform public.reverse_receivable_payment(org,v_receivable,'single','Correção para cancelar pedido');perform public.cancel_customer_order(org,v_order,'Cliente solicitou cancelamento');
 select status::text into actual from public.orders where id=v_order;if actual<>'cancelled' then raise exception 'Order not cancelled: %',actual;end if;
 select status into actual from public.receivables where id=v_receivable;if actual<>'cancelled' then raise exception 'Receivable not cancelled: %',actual;end if;
 select status into actual from public.procurement_needs where id=v_need;if actual<>'cancelled' then raise exception 'Derived need not cancelled: %',actual;end if;
end $$;

rollback;
