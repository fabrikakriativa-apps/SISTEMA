begin;

create or replace function public.confirm_supplier_purchase(
  org_id uuid,
  target_purchase_id uuid,
  selected_supplier_id uuid,
  new_external_number text,
  new_ordered_at date,
  new_payment_method text,
  new_installment_count integer
)
returns setof public.payables
language plpgsql security definer set search_path='' as $$
declare
  target public.purchases;
  customer_order_id uuid;
  new_group uuid:=gen_random_uuid();
  total_cents bigint;
  base_cents bigint;
  remainder_cents integer;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','compras']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if new_ordered_at is null or length(btrim(coalesce(new_external_number,'')))=0
    or length(btrim(coalesce(new_payment_method,'')))=0
    or new_installment_count<1 or new_installment_count>60 then
    raise exception 'Invalid purchase confirmation' using errcode='23514';
  end if;
  if not exists(select 1 from public.suppliers s where s.id=selected_supplier_id and s.organization_id=org_id and s.active) then
    raise exception 'Invalid supplier' using errcode='23514';
  end if;

  select * into target from public.purchases
  where id=target_purchase_id and organization_id=org_id for update;
  if target.id is null then raise exception 'Purchase not found' using errcode='P0002'; end if;
  if target.status<>'draft' then raise exception 'Purchase is not a draft' using errcode='23514'; end if;
  if exists(select 1 from public.payables where organization_id=org_id and purchase_id=target.id and status<>'cancelled') then
    raise exception 'Payables already configured' using errcode='23514';
  end if;

  select min(oi.order_id) into customer_order_id
  from public.purchase_items pi join public.order_items oi on oi.id=pi.order_item_id and oi.organization_id=pi.organization_id
  where pi.organization_id=org_id and pi.purchase_id=target.id;

  total_cents:=round(target.total*100)::bigint;
  base_cents:=total_cents/new_installment_count;
  remainder_cents:=(total_cents%new_installment_count)::integer;

  update public.purchases set supplier_id=selected_supplier_id,external_number=btrim(new_external_number),
    ordered_at=new_ordered_at,payment_terms=new_installment_count||'x · '||btrim(new_payment_method),
    status=case when mode='immediate' then 'completed' else 'awaiting_delivery' end,
    received_at=case when mode='immediate' then new_ordered_at else null end,updated_at=now()
  where id=target.id;

  insert into public.payables(organization_id,purchase_id,order_id,group_id,installment,installment_count,description,due_date,amount,paid_amount,status,payment_method,paid_at)
  select org_id,target.id,customer_order_id,new_group,n,new_installment_count,
    'Compra '||target.display_number||' · parcela '||n||'/'||new_installment_count,
    case when target.mode='immediate' then (new_ordered_at+((n-1)||' months')::interval)::date else null end,
    (base_cents+case when n<=remainder_cents then 1 else 0 end)/100.0,
    case when target.mode='immediate' and new_payment_method in ('PIX','Dinheiro','Cartão de débito') then (base_cents+case when n<=remainder_cents then 1 else 0 end)/100.0 else 0 end,
    case when target.mode='immediate' and new_payment_method in ('PIX','Dinheiro','Cartão de débito') then 'settled'::public.financial_status else 'open'::public.financial_status end,
    btrim(new_payment_method),
    case when target.mode='immediate' and new_payment_method in ('PIX','Dinheiro','Cartão de débito') then new_ordered_at else null end
  from generate_series(1,new_installment_count) n;

  update public.purchase_items set status=case when target.mode='immediate' then 'received' else 'ordered' end
  where organization_id=org_id and purchase_id=target.id;
  update public.order_items oi set status=case when target.mode='immediate' then 'preparing' else 'awaiting_supplier' end,updated_at=now()
  where oi.organization_id=org_id and exists(select 1 from public.purchase_items pi where pi.organization_id=org_id and pi.purchase_id=target.id and pi.order_item_id=oi.id);

  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,after_data)
  values(org_id,auth.uid(),'purchases',target.id,'confirmed',jsonb_build_object('supplier_id',selected_supplier_id,'external_number',btrim(new_external_number),'ordered_at',new_ordered_at,'group_id',new_group));
  return query select * from public.payables p where p.organization_id=org_id and p.group_id=new_group order by p.installment;
end; $$;

create or replace function public.set_purchase_supplier_due_date(org_id uuid,target_purchase_id uuid,new_supplier_due_date date)
returns public.purchases
language plpgsql security definer set search_path='' as $$
declare target public.purchases; updated public.purchases;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','compras']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  if new_supplier_due_date is null then raise exception 'Supplier due date is required' using errcode='23514'; end if;
  select * into target from public.purchases where id=target_purchase_id and organization_id=org_id for update;
  if target.id is null then raise exception 'Purchase not found' using errcode='P0002'; end if;
  if target.mode<>'made_to_order' or target.status not in ('awaiting_delivery','delayed') then raise exception 'Purchase does not accept a delivery forecast' using errcode='23514'; end if;

  update public.purchases set supplier_due_date=new_supplier_due_date,updated_at=now() where id=target.id returning * into updated;
  update public.payables p set due_date=(new_supplier_due_date+((p.installment-1)||' months')::interval)::date
  where p.organization_id=org_id and p.purchase_id=target.id and p.status in ('open','overdue');
  update public.order_items oi set supplier_due_date=new_supplier_due_date,updated_at=now()
  where oi.organization_id=org_id and exists(select 1 from public.purchase_items pi where pi.organization_id=org_id and pi.purchase_id=target.id and pi.order_item_id=oi.id);
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data)
  values(org_id,auth.uid(),'purchases',target.id,'supplier_due_date_updated',to_jsonb(target),to_jsonb(updated));
  return updated;
end; $$;

revoke all on function public.confirm_supplier_purchase(uuid,uuid,uuid,text,date,text,integer),
  public.set_purchase_supplier_due_date(uuid,uuid,date) from public,anon;
grant execute on function public.confirm_supplier_purchase(uuid,uuid,uuid,text,date,text,integer),
  public.set_purchase_supplier_due_date(uuid,uuid,date) to authenticated;

commit;
