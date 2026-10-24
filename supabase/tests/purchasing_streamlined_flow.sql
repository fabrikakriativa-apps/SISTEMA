begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.memberships where active and role='admin' limit 1),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare org uuid; a uuid;b uuid;vendor uuid;n1 public.procurement_needs;n2 public.procurement_needs;p uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();n3 public.procurement_needs;grp uuid;cnt integer;sa text;sb text;res uuid;
begin
 select organization_id into org from public.memberships where user_id=auth.uid() and active limit 1;
 select i.id into a from public.order_items i join public.orders o on o.id=i.order_id where i.organization_id=org and o.status not in ('cancelled','completed') limit 1;
 select i.id into b from public.order_items i join public.orders o on o.id=i.order_id where i.organization_id=org and o.status not in ('cancelled','completed') and i.order_id<>(select order_id from public.order_items where id=a) limit 1;
 select id into vendor from public.suppliers where organization_id=org and active limit 1;
 select status::text into sa from public.order_items where id=a;select status::text into sb from public.order_items where id=b;
 n1:=public.save_procurement_need_supplier(org,null,a,null,'TESTE descartável A',1,'un',10,null,'Fornecedor teste',false);
 n2:=public.save_procurement_need_supplier(org,null,b,null,'TESTE descartável B',1,'un',20,null,'Fornecedor teste',false);
 res:=public.manage_purchasing(org,p,'order',jsonb_build_object('supplier_id',vendor,'lines',jsonb_build_array(jsonb_build_object('id',n1.id,'unit_cost',10),jsonb_build_object('id',n2.id,'unit_cost',20)),'external_number','ORDER TEST','supplier_due_date',current_date+7,'ordered_at',current_date,'first_due',current_date+7,'method','Boleto','installments',2,'paid',false));
 res:=public.manage_purchasing(org,p,'order',jsonb_build_object('external_number','ORDER TEST','supplier_due_date',current_date+7));
 if not exists(select 1 from public.purchases where id=p and supplier_due_date=current_date+7 and external_number='ORDER TEST' and status='awaiting_delivery') then raise exception 'Order metadata lost';end if;
 if (select count(*) from public.payables where purchase_id=p)<>2 or (select sum(amount) from public.payables where purchase_id=p)<>30 then raise exception 'Payables totals';end if;
 select group_id into grp from public.payables where purchase_id=p limit 1;
 if (select count(*) from public.payable_allocations where group_id=grp)<>2 or (select sum(amount) from public.payable_allocations where group_id=grp)<>30 then raise exception 'Allocation totals';end if;
 begin
  perform public.review_item_purchasing(org,a,'not_required');
  raise exception 'Purchased item incorrectly waived';
 exception when others then if sqlerrm='Purchased item incorrectly waived' then raise;end if;end;
 begin
  perform public.cancel_supplier_purchase(org,p,'Teste de proteção agrupada');
  raise exception 'Legacy group cancelled';
 exception when others then if sqlerrm='Legacy group cancelled' then raise;end if;end;
 res:=public.manage_purchasing(org,p,'receive',jsonb_build_object('delivery_at',current_date));
 res:=public.manage_purchasing(org,p,'receive',jsonb_build_object('delivery_at',current_date));
 if (select count(*) from public.payables where purchase_id=p)<>2 then raise exception 'Receipt duplicated financials';end if;
 if exists(select 1 from public.procurement_needs where id in(n1.id,n2.id) and status<>'received') then raise exception 'Receipt did not close needs';end if;
 if (select status::text from public.order_items where id=a)<>sa or (select status::text from public.order_items where id=b)<>sb then raise exception 'Production status changed';end if;
 n3:=public.save_procurement_need_supplier(org,null,a,null,'TESTE loja',1,'un',15,null,'Fornecedor teste',false);
 begin
  perform public.manage_purchasing(org,p2,'direct',jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('id',n3.id,'unit_cost',15)),'supplier_id',vendor,'ordered_at',current_date,'first_due',current_date,'method','PIX','installments',0,'paid',false,'completed',true,'delivery_at',current_date));
  raise exception 'Invalid finance accepted';
 exception when others then if sqlerrm='Invalid finance accepted' then raise;end if;end;
 if exists(select 1 from public.purchases where id=p2) then raise exception 'Partial purchase survived failed financials';end if;
 res:=public.manage_purchasing(org,p2,'direct',jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('id',n3.id,'unit_cost',15)),'supplier_id',vendor,'ordered_at',current_date,'first_due',current_date,'method','Dinheiro','installments',1,'paid',true,'received_at',current_date,'completed',true,'delivery_at',current_date));
 res:=public.manage_purchasing(org,p2,'direct','{}');
 if not exists(select 1 from public.payables where purchase_id=p2 and status='settled' and paid_amount=15 and paid_at=current_date) then raise exception 'Already paid failed';end if;
 begin
  perform public.manage_purchasing(org,p2,'cancel','{"reason":"Não cancelar pago"}');
  raise exception 'Paid purchase cancelled';
 exception when others then if sqlerrm='Paid purchase cancelled' then raise;end if;end;
 begin
  perform public.manage_purchasing(gen_random_uuid(),gen_random_uuid(),'create','{}');
  raise exception 'Cross org accepted';
 exception when insufficient_privilege then null;end;
end $test$;
set constraints all immediate;

rollback;

