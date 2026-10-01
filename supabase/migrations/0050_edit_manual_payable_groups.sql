create function public.update_manual_payable_group(
  org_id uuid,
  target_group_id uuid,
  payable_description text,
  payable_supplier_id uuid,
  payable_order_id uuid,
  payable_budget_item_id uuid,
  payable_method text,
  installments_json jsonb
)
returns setof public.payables language plpgsql security definer set search_path='' as $$
declare
  before_group jsonb;
  group_count integer;
  submitted_count integer;
  line jsonb;
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

  if not exists(
    select 1 from public.audit_log a
    where a.organization_id=org_id and a.entity_type='payables'
      and a.entity_id=target_group_id and a.action='manual_group_created'
  ) then
    raise exception 'Only manual payable groups can be edited' using errcode='23514';
  end if;

  perform 1 from public.payables p
  where p.organization_id=org_id and p.group_id=target_group_id
  for update;

  select count(*),jsonb_agg(to_jsonb(p) order by p.installment)
  into group_count,before_group
  from public.payables p
  where p.organization_id=org_id and p.group_id=target_group_id;

  submitted_count:=jsonb_array_length(installments_json);
  if group_count=0 or submitted_count<>group_count then
    raise exception 'Installment list does not match the payable group' using errcode='23514';
  end if;

  if exists(
    select 1 from public.payables p
    where p.organization_id=org_id and p.group_id=target_group_id
      and (p.paid_amount>0 or p.status not in ('open','overdue'))
  ) then
    raise exception 'Paid or cancelled installments cannot be edited' using errcode='23514';
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
    where oi.organization_id=org_id and oi.order_id=payable_order_id
      and oi.budget_item_id=payable_budget_item_id
      and o.status<>'cancelled' and oi.status<>'cancelled'
  ) then
    raise exception 'Invalid order item' using errcode='23514';
  end if;

  for line in select value from jsonb_array_elements(installments_json) loop
    line_amount:=round((line->>'amount')::numeric,2);
    line_due:=(line->>'due_date')::date;
    if (line->>'id') is null or line_amount<=0 or line_due is null
      or not exists(select 1 from public.payables p where p.id=(line->>'id')::uuid and p.organization_id=org_id and p.group_id=target_group_id) then
      raise exception 'Invalid installment data' using errcode='23514';
    end if;
  end loop;

  update public.payables
  set description=btrim(payable_description),supplier_id=payable_supplier_id,order_id=payable_order_id,
      budget_item_id=payable_budget_item_id,payment_method=btrim(payable_method)
  where organization_id=org_id and group_id=target_group_id;

  update public.payables p
  set due_date=(line.value->>'due_date')::date,
      amount=round((line.value->>'amount')::numeric,2)
  from jsonb_array_elements(installments_json) as line(value)
  where p.organization_id=org_id and p.group_id=target_group_id and p.id=(line.value->>'id')::uuid;

  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data)
  values(
    org_id,auth.uid(),'payables',target_group_id,'manual_group_updated',before_group,
    jsonb_build_object('description',btrim(payable_description),'supplier_id',payable_supplier_id,
      'order_id',payable_order_id,'budget_item_id',payable_budget_item_id,
      'installments',installments_json,'payment_method',btrim(payable_method))
  );

  return query select * from public.payables p
  where p.organization_id=org_id and p.group_id=target_group_id
  order by p.installment;
end;
$$;

revoke all on function public.update_manual_payable_group(uuid,uuid,text,uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.update_manual_payable_group(uuid,uuid,text,uuid,uuid,uuid,text,jsonb) to authenticated;
