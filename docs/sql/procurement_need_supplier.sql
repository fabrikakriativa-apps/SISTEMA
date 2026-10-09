-- Supplier text is a snapshot: imported suppliers need not be registered yet.
alter table public.procurement_needs add column if not exists supplier_name text not null default '';
create or replace function public.save_procurement_need_supplier(
 org_id uuid,target_need_id uuid,target_order_item_id uuid,new_supply_id uuid,
 new_description text,new_quantity numeric,new_unit text,new_unit_cost numeric,
 new_deadline date,new_supplier_name text,remove_need boolean default false
) returns public.procurement_needs language plpgsql security definer set search_path='' as $$
declare saved public.procurement_needs; previous_name text;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','compras','operacao','comercial']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 if length(coalesce(new_supplier_name,''))>300 then raise exception 'Supplier name too long' using errcode='23514'; end if;
 -- Existing routine enforces organization, order, supply, purchase locks and audit.
 saved:=public.save_procurement_need(org_id,target_need_id,target_order_item_id,new_supply_id,new_description,new_quantity,new_unit,new_unit_cost,new_deadline,remove_need);
 if not remove_need then
  previous_name:=saved.supplier_name;
  update public.procurement_needs set supplier_name=btrim(coalesce(new_supplier_name,'')) where id=saved.id and organization_id=org_id returning * into saved;
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data)
  values(org_id,auth.uid(),'procurement_needs',saved.id,'supplier_saved',jsonb_build_object('supplier_name',previous_name),jsonb_build_object('supplier_name',saved.supplier_name));
 end if;
 return saved;
end $$;
revoke all on function public.save_procurement_need_supplier(uuid,uuid,uuid,uuid,text,numeric,text,numeric,date,text,boolean) from public,anon;
grant execute on function public.save_procurement_need_supplier(uuid,uuid,uuid,uuid,text,numeric,text,numeric,date,text,boolean) to authenticated;
