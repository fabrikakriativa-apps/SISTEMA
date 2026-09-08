begin;

create or replace function public.refresh_purchase_delays(org_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','compras','financeiro','operacao']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  update public.purchases
  set status=case when supplier_due_date<current_date then 'delayed' else 'awaiting_delivery' end,
      updated_at=case when status is distinct from case when supplier_due_date<current_date then 'delayed' else 'awaiting_delivery' end then now() else updated_at end
  where organization_id=org_id and status in ('awaiting_delivery','delayed') and supplier_due_date is not null
    and status is distinct from case when supplier_due_date<current_date then 'delayed' else 'awaiting_delivery' end;
  get diagnostics changed=row_count;
  return changed;
end; $$;
revoke all on function public.refresh_purchase_delays(uuid) from public,anon;
grant execute on function public.refresh_purchase_delays(uuid) to authenticated;

create or replace function public.set_purchase_supplier_due_date(org_id uuid,target_purchase_id uuid,new_supplier_due_date date)
returns public.purchases language plpgsql security definer set search_path='' as $$
declare target public.purchases; updated public.purchases;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','compras']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into target from public.purchases where id=target_purchase_id and organization_id=org_id for update;
  if target.id is null then raise exception 'Purchase not found' using errcode='P0002'; end if;
  if target.mode<>'made_to_order' or target.status not in ('awaiting_delivery','delayed') then raise exception 'Purchase does not accept a delivery forecast' using errcode='23514'; end if;
  if new_supplier_due_date is null then raise exception 'Delivery forecast is required' using errcode='23514'; end if;
  update public.purchases set supplier_due_date=new_supplier_due_date,status=case when new_supplier_due_date<current_date then 'delayed' else 'awaiting_delivery' end,updated_at=now() where id=target.id returning * into updated;
  return updated;
end; $$;
revoke all on function public.set_purchase_supplier_due_date(uuid,uuid,date) from public,anon;
grant execute on function public.set_purchase_supplier_due_date(uuid,uuid,date) to authenticated;

commit;
