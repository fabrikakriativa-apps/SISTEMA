create or replace function public.configure_order_custom_receivables(org_id uuid,target_order_id uuid,payment_method text,installments_json jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare target public.orders; row_json jsonb; r public.receivables; n integer; total_amount numeric;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial','financeiro']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into target from public.orders where id=target_order_id and organization_id=org_id for update;
 if target.id is null then raise exception 'Order not found' using errcode='P0002'; end if;
 if jsonb_typeof(installments_json)<>'array' or installments_json is null then raise exception 'Invalid installments' using errcode='23514'; end if;
 n:=jsonb_array_length(installments_json);
 if n<1 or n>60 then raise exception 'Invalid installments' using errcode='23514'; end if;
 total_amount:=0;
 for row_json in select * from jsonb_array_elements(installments_json) loop
 if (row_json->>'amount')::numeric is null or (row_json->>'amount')::numeric<=0 or (row_json->>'amount')::numeric::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid amount' using errcode='23514'; end if;
 if not coalesce((row_json->>'on_delivery')::boolean,false) and nullif(row_json->>'due_date','') is null then raise exception 'Due date required' using errcode='23514'; end if;
 total_amount:=total_amount+round((row_json->>'amount')::numeric,2);
 end loop;
 if total_amount<>round(target.total,2) then raise exception 'Installments must equal order total' using errcode='23514'; end if;
 for r in select * from public.configure_order_receivables(org_id,target_order_id,n,current_date,payment_method) loop
 row_json:=installments_json->(r.installment-1);
 update public.receivables set amount=round((row_json->>'amount')::numeric,2),due_date=case when coalesce((row_json->>'on_delivery')::boolean,false) then target.promised_date else (row_json->>'due_date')::date end,description=r.description||case when coalesce((row_json->>'on_delivery')::boolean,false) then ' · na entrega' else '' end where id=r.id and organization_id=org_id;
 end loop;
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,after_data) values(org_id,auth.uid(),'orders',target_order_id,'custom_installments_configured',installments_json);
end; $$;
revoke all on function public.configure_order_custom_receivables(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.configure_order_custom_receivables(uuid,uuid,text,jsonb) to authenticated;

