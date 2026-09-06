begin;

alter table public.receivables add column payment_method text;
create index receivables_org_order_idx on public.receivables(organization_id,order_id);
create index receivables_org_group_idx on public.receivables(organization_id,group_id,installment);

grant select on public.receivables to authenticated;
create policy "receivable member read" on public.receivables
for select to authenticated
using (private.has_org_role(organization_id,array['admin','comercial','financeiro']::public.app_role[]));

create or replace function public.configure_order_receivables(
  org_id uuid,
  target_order_id uuid,
  installment_count integer,
  first_due_date date,
  payment_method text
)
returns setof public.receivables
language plpgsql
security definer
set search_path=''
as $$
declare
  target public.orders;
  new_group uuid:=gen_random_uuid();
  base_cents bigint;
  total_cents bigint;
  remainder_cents integer;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial','financeiro']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if installment_count < 1 or installment_count > 60 then
    raise exception 'Invalid installment count' using errcode='23514';
  end if;
  if first_due_date is null then raise exception 'First due date is required' using errcode='23514'; end if;
  if length(btrim(coalesce(payment_method,'')))=0 then raise exception 'Payment method is required' using errcode='23514'; end if;

  select * into target from public.orders
  where id=target_order_id and organization_id=org_id for update;
  if target.id is null then raise exception 'Order not found' using errcode='P0002'; end if;
  if target.status <> 'awaiting_finance' then raise exception 'Order is not awaiting finance' using errcode='23514'; end if;
  if exists(select 1 from public.receivables where order_id=target.id and organization_id=org_id and status<>'cancelled') then
    raise exception 'Receivables already configured' using errcode='23514';
  end if;

  total_cents:=round(target.total*100)::bigint;
  base_cents:=total_cents/installment_count;
  remainder_cents:=(total_cents%installment_count)::integer;

  insert into public.receivables(organization_id,order_id,group_id,installment,installment_count,description,due_date,amount,status,payment_method)
  select org_id,target.id,new_group,n,installment_count,
    'Pedido '||target.display_number||' · parcela '||n||'/'||installment_count,
    (first_due_date+((n-1)||' months')::interval)::date,
    (base_cents+case when n<=remainder_cents then 1 else 0 end)/100.0,
    'open',btrim(payment_method)
  from generate_series(1,installment_count) n;

  update public.orders set status='awaiting_purchase',payment_terms=installment_count||'x · '||btrim(payment_method),updated_at=now()
  where id=target.id;
  update public.order_items set status='awaiting_purchase',updated_at=now() where order_id=target.id and organization_id=org_id;

  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,after_data)
  values(org_id,auth.uid(),'orders',target.id,'receivables_configured',jsonb_build_object('group_id',new_group,'installments',installment_count,'payment_method',btrim(payment_method)));

  return query select * from public.receivables where order_id=target.id and group_id=new_group order by installment;
end;
$$;

revoke all on function public.configure_order_receivables(uuid,uuid,integer,date,text) from public,anon;
grant execute on function public.configure_order_receivables(uuid,uuid,integer,date,text) to authenticated;

commit;
