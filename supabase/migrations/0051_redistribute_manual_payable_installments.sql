create or replace function public.update_manual_payable_group(
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
  line jsonb;
  locked_record record;
  submitted_count integer;
  locked_count integer;
  locked_total numeric(14,2);
  submitted_total numeric(14,2):=0;
  submitted_locked_ids uuid[]:=array[]::uuid[];
  line_id uuid;
  line_amount numeric(14,2);
  line_due date;
  line_position integer:=0;
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

  select jsonb_agg(to_jsonb(p) order by p.installment)
  into before_group
  from public.payables p
  where p.organization_id=org_id and p.group_id=target_group_id;

  if before_group is null then
    raise exception 'Payable group not found' using errcode='23514';
  end if;

  submitted_count:=jsonb_array_length(installments_json);
  if submitted_count>60 then
    raise exception 'A maximum of 60 installments is allowed' using errcode='23514';
  end if;

  select count(*),coalesce(sum(p.amount),0)
  into locked_count,locked_total
  from public.payables p
  where p.organization_id=org_id and p.group_id=target_group_id
    and (p.paid_amount>0 or p.status not in ('open','overdue'));

  if submitted_count<locked_count then
    raise exception 'The installment count cannot be less than the paid installments' using errcode='23514';
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
    line_position:=line_position+1;
    if line_amount<=0 or line_due is null then
      raise exception 'Invalid installment data' using errcode='23514';
    end if;
    submitted_total:=submitted_total+line_amount;

    if nullif(line->>'id','') is not null then
      line_id:=(line->>'id')::uuid;
      select p.id,p.amount,p.due_date
      into locked_record
      from public.payables p
      where p.id=line_id and p.organization_id=org_id and p.group_id=target_group_id
        and (p.paid_amount>0 or p.status not in ('open','overdue'));
      if not found or line_amount<>locked_record.amount or line_due<>locked_record.due_date then
        raise exception 'Paid installments must remain unchanged' using errcode='23514';
      end if;
      submitted_locked_ids:=array_append(submitted_locked_ids,line_id);
    end if;
  end loop;

  if round(submitted_total,2)<locked_total then
    raise exception 'The total cannot be less than the paid installments' using errcode='23514';
  end if;

  if (select count(distinct id) from unnest(submitted_locked_ids) as ids(id))<>locked_count
    or exists(
      select 1 from public.payables p
      where p.organization_id=org_id and p.group_id=target_group_id
        and (p.paid_amount>0 or p.status not in ('open','overdue'))
        and not (p.id=any(submitted_locked_ids))
    ) then
    raise exception 'All paid installments must be kept' using errcode='23514';
  end if;

  update public.payables
  set description=btrim(payable_description),supplier_id=payable_supplier_id,order_id=payable_order_id,
      budget_item_id=payable_budget_item_id,payment_method=btrim(payable_method)
  where organization_id=org_id and group_id=target_group_id;

  delete from public.payables p
  where p.organization_id=org_id and p.group_id=target_group_id
    and p.id<>all(submitted_locked_ids);

  line_position:=0;
  for line in select value from jsonb_array_elements(installments_json) loop
    line_position:=line_position+1;
    line_amount:=round((line->>'amount')::numeric,2);
    line_due:=(line->>'due_date')::date;
    if nullif(line->>'id','') is not null then
      update public.payables
      set installment=line_position,installment_count=submitted_count
      where id=(line->>'id')::uuid and organization_id=org_id;
    else
      insert into public.payables(
        organization_id,purchase_id,order_id,group_id,installment,installment_count,
        description,due_date,amount,supplier_id,budget_item_id,payment_method
      ) values (
        org_id,null,payable_order_id,target_group_id,line_position,submitted_count,
        btrim(payable_description),line_due,line_amount,payable_supplier_id,payable_budget_item_id,btrim(payable_method)
      );
    end if;
  end loop;

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
