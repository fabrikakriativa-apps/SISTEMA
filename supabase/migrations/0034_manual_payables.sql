create or replace function public.create_manual_payables(
  org_id uuid,
  payable_description text,
  total_amount numeric,
  installment_total integer,
  first_due_date date,
  payable_method text
)
returns setof public.payables
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_group uuid := gen_random_uuid();
  part numeric(14,2);
  part_amount numeric(14,2);
  position integer;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','financeiro']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if length(btrim(coalesce(payable_description,'')))=0
    or total_amount is null or total_amount<=0 or total_amount='NaN'::numeric
    or installment_total is null or installment_total<1 or installment_total>120
    or first_due_date is null or length(btrim(coalesce(payable_method,'')))=0 then
    raise exception 'Invalid payable data' using errcode='23514';
  end if;

  part := round(total_amount/installment_total,2);
  for position in 1..installment_total loop
    part_amount := case when position=installment_total
      then round(total_amount-(part*(installment_total-1)),2)
      else part end;
    insert into public.payables(
      organization_id,purchase_id,order_id,group_id,installment,installment_count,
      description,due_date,amount,paid_amount,status,payment_method
    ) values(
      org_id,null,null,new_group,position,installment_total,btrim(payable_description),
      (first_due_date+((position-1)||' months')::interval)::date,
      part_amount,0,'open',btrim(payable_method)
    );
  end loop;

  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,after_data)
  values(org_id,auth.uid(),'payables',new_group,'manual_group_created',jsonb_build_object(
    'description',btrim(payable_description),'total',round(total_amount,2),
    'installments',installment_total,'first_due_date',first_due_date,'payment_method',btrim(payable_method)
  ));

  return query select * from public.payables p
    where p.organization_id=org_id and p.group_id=new_group order by p.installment;
end;
$$;

revoke all on function public.create_manual_payables(uuid,text,numeric,integer,date,text) from public,anon;
grant execute on function public.create_manual_payables(uuid,text,numeric,integer,date,text) to authenticated;

