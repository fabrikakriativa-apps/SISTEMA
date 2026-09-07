begin;

create or replace function public.reverse_receivable_payment(org_id uuid,target_receivable_id uuid,reversal_scope text,reversal_reason text)
returns setof public.receivables language plpgsql security definer set search_path='' as $$
declare target public.receivables;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','financeiro']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  if reversal_scope not in ('single','group') or length(btrim(coalesce(reversal_reason,'')))<5 then raise exception 'Invalid reversal data' using errcode='23514'; end if;
  select * into target from public.receivables where id=target_receivable_id and organization_id=org_id for update;
  if target.id is null then raise exception 'Receivable not found' using errcode='P0002'; end if;
  if target.paid_amount<=0 or target.status not in ('partial','settled') then raise exception 'Receivable has no payment to reverse' using errcode='23514'; end if;
  if reversal_scope='single' then
    update public.receivables set paid_amount=0,paid_at=null,status=case when due_date is not null and due_date<current_date then 'overdue'::public.financial_status else 'open'::public.financial_status end where id=target.id;
  else
    update public.receivables r set paid_amount=0,paid_at=null,status=case when r.due_date is not null and r.due_date<current_date then 'overdue'::public.financial_status else 'open'::public.financial_status end
    where r.organization_id=org_id and r.group_id=target.group_id and r.paid_amount>0 and r.status in ('partial','settled');
  end if;
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(org_id,auth.uid(),'receivables',target.id,case when reversal_scope='group' then 'group_receipt_reversed' else 'receipt_reversed' end,to_jsonb(target),jsonb_build_object('scope',reversal_scope),btrim(reversal_reason));
  return query select * from public.receivables r where r.organization_id=org_id and (case when reversal_scope='group' then r.group_id=target.group_id else r.id=target.id end) order by r.installment;
end; $$;

revoke all on function public.reverse_receivable_payment(uuid,uuid,text,text) from public,anon;
grant execute on function public.reverse_receivable_payment(uuid,uuid,text,text) to authenticated;

commit;
