begin;

alter table public.payables add column payment_method text;
alter table public.payables add column paid_at date;
create index payables_org_group_idx on public.payables(organization_id,group_id,installment);
create index payables_org_purchase_idx on public.payables(organization_id,purchase_id);

grant select on public.payables to authenticated;
create policy "payable member read" on public.payables
for select to authenticated
using (private.has_org_role(organization_id,array['admin','compras','financeiro']::public.app_role[]));

create or replace function public.update_payable(org_id uuid,target_payable_id uuid,edit_scope text,new_due_date date,new_amount numeric,new_payment_method text)
returns setof public.payables language plpgsql security definer set search_path='' as $$
declare target public.payables;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','financeiro']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  if edit_scope not in ('single','group') or new_due_date is null or length(btrim(coalesce(new_payment_method,'')))=0 then raise exception 'Invalid data' using errcode='23514'; end if;
  select * into target from public.payables where id=target_payable_id and organization_id=org_id for update;
  if target.id is null then raise exception 'Payable not found' using errcode='P0002'; end if;
  if target.status not in ('open','overdue') then raise exception 'Only open payables can be edited' using errcode='23514'; end if;
  if edit_scope='single' then
    if new_amount is null or new_amount<=0 or new_amount='NaN'::numeric then raise exception 'Invalid amount' using errcode='23514'; end if;
    update public.payables set due_date=new_due_date,amount=round(new_amount,2),payment_method=btrim(new_payment_method) where id=target.id;
  else
    update public.payables p set due_date=(new_due_date+((p.installment-1)||' months')::interval)::date,payment_method=btrim(new_payment_method)
    where p.organization_id=org_id and p.group_id=target.group_id and p.status in ('open','overdue');
  end if;
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data) values(org_id,auth.uid(),'payables',target.id,case when edit_scope='group' then 'group_updated' else 'updated' end,to_jsonb(target),jsonb_build_object('scope',edit_scope,'due_date',new_due_date,'payment_method',btrim(new_payment_method)));
  return query select * from public.payables p where p.organization_id=org_id and (case when edit_scope='group' then p.group_id=target.group_id else p.id=target.id end) order by p.installment;
end; $$;

create or replace function public.register_payable_payment(org_id uuid,target_payable_id uuid,payment_scope text,payment_amount numeric,payment_date date)
returns setof public.payables language plpgsql security definer set search_path='' as $$
declare target public.payables; outstanding numeric;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','financeiro']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  if payment_scope not in ('single','group') or payment_date is null then raise exception 'Invalid data' using errcode='23514'; end if;
  select * into target from public.payables where id=target_payable_id and organization_id=org_id for update;
  if target.id is null then raise exception 'Payable not found' using errcode='P0002'; end if;
  if target.status not in ('open','partial','overdue') then raise exception 'Payable is not open' using errcode='23514'; end if;
  if payment_scope='single' then
    outstanding:=round(target.amount-target.paid_amount,2);
    if payment_amount is null or payment_amount<=0 or payment_amount>outstanding or payment_amount='NaN'::numeric then raise exception 'Invalid payment amount' using errcode='23514'; end if;
    update public.payables set paid_amount=round(paid_amount+payment_amount,2),status=case when round(paid_amount+payment_amount,2)>=amount then 'settled'::public.financial_status else 'partial'::public.financial_status end,paid_at=case when round(paid_amount+payment_amount,2)>=amount then payment_date else paid_at end where id=target.id;
  else
    update public.payables p set paid_amount=p.amount,status='settled',paid_at=payment_date where p.organization_id=org_id and p.group_id=target.group_id and p.status in ('open','partial','overdue');
  end if;
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data) values(org_id,auth.uid(),'payables',target.id,case when payment_scope='group' then 'group_settled' else 'payment_registered' end,to_jsonb(target),jsonb_build_object('scope',payment_scope,'amount',case when payment_scope='single' then payment_amount else null end,'payment_date',payment_date));
  return query select * from public.payables p where p.organization_id=org_id and (case when payment_scope='group' then p.group_id=target.group_id else p.id=target.id end) order by p.installment;
end; $$;

revoke all on function public.update_payable(uuid,uuid,text,date,numeric,text),public.register_payable_payment(uuid,uuid,text,numeric,date) from public,anon;
grant execute on function public.update_payable(uuid,uuid,text,date,numeric,text),public.register_payable_payment(uuid,uuid,text,numeric,date) to authenticated;
commit;
