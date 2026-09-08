begin;

create or replace function public.refresh_financial_overdues(org_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare receivable_changes integer:=0; payable_changes integer:=0;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','compras','financeiro']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  update public.receivables
  set status=case when due_date<current_date then 'overdue'::public.financial_status when paid_amount>0 then 'partial'::public.financial_status else 'open'::public.financial_status end
  where organization_id=org_id and status in ('open','partial','overdue') and due_date is not null
    and status is distinct from case when due_date<current_date then 'overdue'::public.financial_status when paid_amount>0 then 'partial'::public.financial_status else 'open'::public.financial_status end;
  get diagnostics receivable_changes=row_count;
  update public.payables
  set status=case when due_date<current_date then 'overdue'::public.financial_status when paid_amount>0 then 'partial'::public.financial_status else 'open'::public.financial_status end
  where organization_id=org_id and status in ('open','partial','overdue') and due_date is not null
    and status is distinct from case when due_date<current_date then 'overdue'::public.financial_status when paid_amount>0 then 'partial'::public.financial_status else 'open'::public.financial_status end;
  get diagnostics payable_changes=row_count;
  return receivable_changes+payable_changes;
end; $$;

revoke all on function public.refresh_financial_overdues(uuid) from public,anon;
grant execute on function public.refresh_financial_overdues(uuid) to authenticated;

commit;
