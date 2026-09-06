begin;

alter table public.receivables add column paid_at date;

create or replace function public.register_receivable_payment(
  org_id uuid,
  target_receivable_id uuid,
  payment_scope text,
  payment_amount numeric,
  payment_date date
)
returns setof public.receivables
language plpgsql
security definer
set search_path=''
as $$
declare
  target public.receivables;
  outstanding numeric;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','financeiro']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if payment_scope not in ('single','group') then raise exception 'Invalid payment scope' using errcode='23514'; end if;
  if payment_date is null then raise exception 'Payment date is required' using errcode='23514'; end if;

  select * into target from public.receivables
  where id=target_receivable_id and organization_id=org_id for update;
  if target.id is null then raise exception 'Receivable not found' using errcode='P0002'; end if;
  if target.status not in ('open','partial','overdue') then raise exception 'Receivable is not open' using errcode='23514'; end if;

  if payment_scope='single' then
    outstanding:=round(target.amount-target.paid_amount,2);
    if payment_amount is null or payment_amount<=0 or payment_amount>outstanding or payment_amount='NaN'::numeric then
      raise exception 'Invalid payment amount' using errcode='23514';
    end if;
    update public.receivables set
      paid_amount=round(paid_amount+payment_amount,2),
      status=case when round(paid_amount+payment_amount,2)>=amount then 'settled'::public.financial_status else 'partial'::public.financial_status end,
      paid_at=case when round(paid_amount+payment_amount,2)>=amount then payment_date else paid_at end
    where id=target.id;
  else
    update public.receivables r set paid_amount=r.amount,status='settled',paid_at=payment_date
    where r.organization_id=org_id and r.group_id=target.group_id and r.status in ('open','partial','overdue');
  end if;

  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data)
  values(org_id,auth.uid(),'receivables',target.id,
    case when payment_scope='group' then 'group_settled' else 'payment_registered' end,
    to_jsonb(target),jsonb_build_object('scope',payment_scope,'amount',case when payment_scope='single' then payment_amount else null end,'payment_date',payment_date));

  return query select * from public.receivables r
  where r.organization_id=org_id and (case when payment_scope='group' then r.group_id=target.group_id else r.id=target.id end)
  order by r.installment;
end;
$$;

revoke all on function public.register_receivable_payment(uuid,uuid,text,numeric,date) from public,anon;
grant execute on function public.register_receivable_payment(uuid,uuid,text,numeric,date) to authenticated;

commit;
