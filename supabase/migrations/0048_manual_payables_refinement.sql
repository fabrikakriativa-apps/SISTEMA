create or replace function public.create_manual_payable_group(
  org_id uuid,
  payable_description text,
  payable_supplier_id uuid,
  payable_method text,
  installments_json jsonb
)
returns setof public.payables language plpgsql security definer set search_path='' as $$
declare new_group uuid:=gen_random_uuid(); line jsonb; position integer:=0; line_amount numeric; line_due date;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','financeiro']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  if length(btrim(coalesce(payable_description,'')))=0 or payable_supplier_id is null or length(btrim(coalesce(payable_method,'')))=0 or jsonb_typeof(installments_json)<>'array' or jsonb_array_length(installments_json)=0 then raise exception 'Invalid payable data' using errcode='23514'; end if;
  if not exists(select 1 from public.suppliers where id=payable_supplier_id and organization_id=org_id and active) then raise exception 'Invalid supplier' using errcode='23514'; end if;
  for line in select value from jsonb_array_elements(installments_json) loop
    position:=position+1; line_amount:=round((line->>'amount')::numeric,2); line_due:=(line->>'due_date')::date;
    if line_amount<=0 or line_due is null then raise exception 'Invalid installment data' using errcode='23514'; end if;
    insert into public.payables(organization_id,supplier_id,group_id,installment,installment_count,description,due_date,amount,paid_amount,status,payment_method)
    values(org_id,payable_supplier_id,new_group,position,jsonb_array_length(installments_json),btrim(payable_description),line_due,line_amount,0,'open',btrim(payable_method));
  end loop;
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,after_data)
  values(org_id,auth.uid(),'payables',new_group,'manual_group_created',jsonb_build_object('description',btrim(payable_description),'supplier_id',payable_supplier_id,'installments',installments_json,'payment_method',btrim(payable_method)));
  return query select * from public.payables p where p.organization_id=org_id and p.group_id=new_group order by p.installment;
end;
$$;

create or replace function public.cancel_manual_payable(org_id uuid,target_payable_id uuid)
returns public.payables language plpgsql security definer set search_path='' as $$
declare target public.payables; updated public.payables;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','financeiro']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into target from public.payables where id=target_payable_id and organization_id=org_id for update;
  if target.id is null then raise exception 'Payable not found' using errcode='P0002'; end if;
  if target.purchase_id is not null or target.order_id is not null or target.budget_item_id is not null or target.paid_amount>0 or target.status not in ('open','overdue') then raise exception 'Only unpaid manual payables can be cancelled' using errcode='23514'; end if;
  update public.payables set status='cancelled',cancelled_at=now() where id=target.id returning * into updated;
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data) values(org_id,auth.uid(),'payables',target.id,'manual_payable_cancelled',to_jsonb(target));
  return updated;
end;
$$;

revoke all on function public.create_manual_payable_group(uuid,text,uuid,text,jsonb),public.cancel_manual_payable(uuid,uuid) from public,anon;
grant execute on function public.create_manual_payable_group(uuid,text,uuid,text,jsonb),public.cancel_manual_payable(uuid,uuid) to authenticated;
