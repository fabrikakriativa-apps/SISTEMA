create or replace function public.delete_manual_payable_installment(org_id uuid,target_payable_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  target public.payables;
  before_group jsonb;
  after_group jsonb;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','financeiro']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  select * into target
  from public.payables
  where id=target_payable_id and organization_id=org_id
  for update;

  if target.id is null then
    raise exception 'Payable not found' using errcode='P0002';
  end if;

  if target.paid_amount>0 or target.status not in ('open','overdue') then
    raise exception 'Paid or cancelled installments cannot be deleted' using errcode='23514';
  end if;

  if not exists(
    select 1 from public.audit_log a
    where a.organization_id=org_id and a.entity_type='payables'
      and a.entity_id=target.group_id and a.action='manual_group_created'
  ) then
    raise exception 'Only manual payable installments can be deleted' using errcode='23514';
  end if;

  perform 1 from public.payables p
  where p.organization_id=org_id and p.group_id=target.group_id
  for update;

  select jsonb_agg(to_jsonb(p) order by p.installment)
  into before_group
  from public.payables p
  where p.organization_id=org_id and p.group_id=target.group_id;

  delete from public.payables
  where id=target.id and organization_id=org_id;

  with reordered as (
    select id,row_number() over(order by installment,created_at,id)::integer as next_installment,
      count(*) over()::integer as next_count
    from public.payables
    where organization_id=org_id and group_id=target.group_id
  )
  update public.payables p
  set installment=reordered.next_installment,installment_count=reordered.next_count
  from reordered
  where p.id=reordered.id;

  select jsonb_agg(to_jsonb(p) order by p.installment)
  into after_group
  from public.payables p
  where p.organization_id=org_id and p.group_id=target.group_id;

  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data)
  values(
    org_id,auth.uid(),'payables',target.group_id,'manual_installment_deleted',
    jsonb_build_object('deleted_installment',to_jsonb(target),'group_before',before_group),
    jsonb_build_object('group_after',coalesce(after_group,'[]'::jsonb))
  );
end;
$$;

revoke all on function public.delete_manual_payable_installment(uuid,uuid) from public,anon;
grant execute on function public.delete_manual_payable_installment(uuid,uuid) to authenticated;
