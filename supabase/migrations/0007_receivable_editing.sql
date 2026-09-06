begin;

create or replace function public.update_receivable(
  org_id uuid,
  target_receivable_id uuid,
  edit_scope text,
  new_due_date date,
  new_amount numeric,
  new_payment_method text
)
returns setof public.receivables
language plpgsql
security definer
set search_path=''
as $$
declare
  target public.receivables;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','financeiro']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if edit_scope not in ('single','group') then raise exception 'Invalid edit scope' using errcode='23514'; end if;
  if new_due_date is null then raise exception 'Due date is required' using errcode='23514'; end if;
  if length(btrim(coalesce(new_payment_method,'')))=0 then raise exception 'Payment method is required' using errcode='23514'; end if;

  select * into target from public.receivables
  where id=target_receivable_id and organization_id=org_id for update;
  if target.id is null then raise exception 'Receivable not found' using errcode='P0002'; end if;
  if target.status not in ('open','overdue') then raise exception 'Only open receivables can be edited' using errcode='23514'; end if;

  if edit_scope='single' then
    if new_amount is null or new_amount<=0 or new_amount='NaN'::numeric then raise exception 'Invalid amount' using errcode='23514'; end if;
    update public.receivables set due_date=new_due_date,amount=round(new_amount,2),payment_method=btrim(new_payment_method)
    where id=target.id;
  else
    update public.receivables r set
      due_date=(new_due_date+((r.installment-1)||' months')::interval)::date,
      payment_method=btrim(new_payment_method)
    where r.organization_id=org_id and r.group_id=target.group_id and r.status in ('open','overdue');
  end if;

  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data)
  values(org_id,auth.uid(),'receivables',target.id,
    case when edit_scope='group' then 'group_updated' else 'updated' end,
    to_jsonb(target),jsonb_build_object('scope',edit_scope,'due_date',new_due_date,'amount',case when edit_scope='single' then new_amount else null end,'payment_method',btrim(new_payment_method)));

  return query select * from public.receivables r
  where r.organization_id=org_id and (case when edit_scope='group' then r.group_id=target.group_id else r.id=target.id end)
  order by r.installment;
end;
$$;

revoke all on function public.update_receivable(uuid,uuid,text,date,numeric,text) from public,anon;
grant execute on function public.update_receivable(uuid,uuid,text,date,numeric,text) to authenticated;

commit;
