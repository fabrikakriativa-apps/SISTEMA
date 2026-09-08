begin;

do $$
declare
  org uuid; actor uuid; v_client_id uuid:=gen_random_uuid(); v_supplier_id uuid:=gen_random_uuid(); v_supply_id uuid:=gen_random_uuid();
  v_family_id uuid; v_budget_id uuid; v_budget_item_id uuid:=gen_random_uuid(); created_order_id uuid; created_order_item_id uuid;
  whole_need uuid; supply_need uuid; purchase_one uuid; purchase_two uuid; actual text; amount_count integer;
begin
  select organization_id,user_id into org,actor from public.memberships where role='admin' and active limit 1;
  if org is null then raise exception 'Integration test requires an active admin membership'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  select id into v_family_id from public.item_families where organization_id=org and form_key='curtain' and active limit 1;

  insert into public.clients(id,organization_id,client_type,name,created_by) values(v_client_id,org,'Cliente final','TESTE TRANSACIONAL',actor);
  insert into public.suppliers(id,organization_id,name,supplier_types) values(v_supplier_id,org,'FORNECEDOR TESTE TRANSACIONAL',array['Cortina','Insumo']);
  insert into public.supplies(id,organization_id,code,name,category,purchase_unit,usage_unit,current_cost) values(v_supply_id,org,'TESTE-TX','Insumo teste','Teste','un','un',25);

  select id into v_budget_id from public.create_budget_draft(org);
  update public.budgets set client_id=v_client_id where id=v_budget_id;
  insert into public.budget_items(id,organization_id,budget_id,family_id,position,description,quantity,configuration,cost_total,margin_percent,sale_total)
  values(v_budget_item_id,org,v_budget_id,v_family_id,1,'Cortina de teste integrada',1,'{"manufacturer_cost":100,"installation_cost":0,"additional_cost":0}',150,50,225);
  perform public.replace_budget_item_cost_lines(org,v_budget_item_id,jsonb_build_array(
    jsonb_build_object('kind','product','description','Cortina fabricante','quantity',1,'unit','un','unit_cost',100),
    jsonb_build_object('kind','supply','supply_id',v_supply_id,'description','Insumo teste','quantity',2,'unit','un','unit_cost',25)
  ));
  perform public.change_budget_status(org,v_budget_id,'sent',null);
  select id into created_order_id from public.approve_budget_and_create_order(org,v_budget_id);
  select id into created_order_item_id from public.order_items where order_id=created_order_id;
  perform public.configure_order_receivables(org,created_order_id,2,current_date,'PIX');

  select id into whole_need from public.procurement_needs where order_item_id=created_order_item_id and kind='whole_item';
  select id into supply_need from public.procurement_needs where order_item_id=created_order_item_id and kind='supply';
  if whole_need is null or supply_need is null then raise exception 'Component needs were not created'; end if;

  select id into purchase_one from public.create_supplier_purchase(org,array[whole_need],v_supplier_id,'made_to_order');
  perform public.confirm_supplier_purchase(org,purchase_one,v_supplier_id,'PED-TESTE-1',current_date,'Boleto',1);
  perform public.receive_supplier_purchase(org,purchase_one,current_date);
  select status::text into actual from public.order_items where id=created_order_item_id;
  if actual<>'awaiting_purchase' then raise exception 'Partial receipt advanced item incorrectly: %',actual; end if;

  select id into purchase_two from public.create_supplier_purchase(org,array[supply_need],v_supplier_id,'immediate');
  perform public.confirm_supplier_purchase(org,purchase_two,v_supplier_id,'PED-TESTE-2',current_date,'Cartão de crédito',1);
  select status::text into actual from public.order_items where id=created_order_item_id;
  if actual<>'preparing' then raise exception 'Complete procurement did not release item: %',actual; end if;
  select status::text into actual from public.orders where id=created_order_id;
  if actual<>'preparing' then raise exception 'Order status did not follow its item: %',actual; end if;
  select count(*) into amount_count from public.receivables where order_id=created_order_id;
  if amount_count<>2 then raise exception 'Expected 2 receivables, found %',amount_count; end if;
  select count(*) into amount_count from public.payables where purchase_id in (purchase_one,purchase_two);
  if amount_count<>2 then raise exception 'Expected 2 payables, found %',amount_count; end if;
end $$;

rollback;
