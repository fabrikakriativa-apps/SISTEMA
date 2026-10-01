create index if not exists payables_org_budget_item_idx
  on public.payables(organization_id,budget_item_id)
  where status<>'cancelled';

create function public.create_manual_payable_group_with_link(
  org_id uuid,
  payable_description text,
  payable_supplier_id uuid,
  payable_order_id uuid,
  payable_budget_item_id uuid,
  payable_method text,
  installments_json jsonb
)
returns setof public.payables language plpgsql security definer set search_path='' as $$
declare
  new_group uuid:=gen_random_uuid();
  line jsonb;
  position integer:=0;
  line_amount numeric;
  line_due date;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','financeiro']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  if length(btrim(coalesce(payable_description,'')))=0
    or payable_supplier_id is null
    or length(btrim(coalesce(payable_method,'')))=0
    or jsonb_typeof(installments_json)<>'array'
    or jsonb_array_length(installments_json)=0 then
    raise exception 'Invalid payable data' using errcode='23514';
  end if;

  if not exists(select 1 from public.suppliers where id=payable_supplier_id and organization_id=org_id and active) then
    raise exception 'Invalid supplier' using errcode='23514';
  end if;

  if (payable_order_id is null) <> (payable_budget_item_id is null) then
    raise exception 'Order and order item must be informed together' using errcode='23514';
  end if;

  if payable_order_id is not null and not exists(
    select 1
    from public.order_items oi
    join public.orders o on o.id=oi.order_id and o.organization_id=oi.organization_id
    where oi.organization_id=org_id
      and oi.order_id=payable_order_id
      and oi.budget_item_id=payable_budget_item_id
      and o.status<>'cancelled'
      and oi.status<>'cancelled'
  ) then
    raise exception 'Invalid order item' using errcode='23514';
  end if;

  for line in select value from jsonb_array_elements(installments_json) loop
    position:=position+1;
    line_amount:=round((line->>'amount')::numeric,2);
    line_due:=(line->>'due_date')::date;
    if line_amount<=0 or line_due is null then
      raise exception 'Invalid installment data' using errcode='23514';
    end if;

    insert into public.payables(
      organization_id,supplier_id,order_id,budget_item_id,group_id,installment,installment_count,
      description,due_date,amount,paid_amount,status,payment_method
    ) values(
      org_id,payable_supplier_id,payable_order_id,payable_budget_item_id,new_group,position,
      jsonb_array_length(installments_json),btrim(payable_description),line_due,line_amount,0,'open',btrim(payable_method)
    );
  end loop;

  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,after_data)
  values(
    org_id,auth.uid(),'payables',new_group,'manual_group_created',
    jsonb_build_object(
      'description',btrim(payable_description),'supplier_id',payable_supplier_id,
      'order_id',payable_order_id,'budget_item_id',payable_budget_item_id,
      'installments',installments_json,'payment_method',btrim(payable_method)
    )
  );

  return query
  select * from public.payables p
  where p.organization_id=org_id and p.group_id=new_group
  order by p.installment;
end;
$$;

revoke all on function public.create_manual_payable_group_with_link(uuid,text,uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.create_manual_payable_group_with_link(uuid,text,uuid,uuid,uuid,text,jsonb) to authenticated;
