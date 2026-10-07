alter table public.orders add column if not exists commercial_terms jsonb;

create or replace function private.order_payment_choices(target public.orders)
returns jsonb language sql stable set search_path='' as $$
with original_items as (
 select oi.id,oi.budget_item_id,coalesce((oi.snapshot->>'original_sale_total')::numeric,(oi.snapshot->>'sale_total')::numeric,0) as base
 from public.order_items oi where oi.order_id=target.id and oi.organization_id=target.organization_id
), source_options as (
 select x->>'budget_item_id' as item_id,btrim(x->>'description') as label,
 (x->>'adjustment_percent')::numeric as adjustment,(x->>'final_value')::numeric as final
 from public.budget_versions v cross join lateral jsonb_array_elements(v.snapshot->'item_payment_options') x
 where v.id=target.budget_version_id and jsonb_array_length(coalesce(v.snapshot->'item_payment_options','[]'::jsonb))>0
 union all
 select p.budget_item_id::text,btrim(p.description),p.adjustment_percent,p.final_value
 from public.budget_item_payment_options p
 where p.organization_id=target.organization_id and not exists(select 1 from public.budget_versions v where v.id=target.budget_version_id and jsonb_array_length(coalesce(v.snapshot->'item_payment_options','[]'::jsonb))>0)
), candidates as (
 select lower(p.label) as key,min(p.label) as label,count(*) as count,
 sum(round(coalesce(p.final,i.base*(1+p.adjustment/100)),2)) as subtotal,
 jsonb_agg(jsonb_build_object('id',i.id,'value',round(coalesce(p.final,i.base*(1+p.adjustment/100)),2))) as items
 from original_items i join source_options p on p.item_id=i.budget_item_id::text
 group by lower(p.label) having count(*)=(select count(*) from original_items) and count(distinct i.id)=(select count(*) from original_items)
), all_choices as (
 select 'Valor original do orçamento'::text as label,coalesce(sum(base),0) as subtotal,jsonb_agg(jsonb_build_object('id',id,'value',base)) as items from original_items
 union all select label,subtotal,items from candidates
)
select coalesce(jsonb_agg(jsonb_build_object('label',label,'subtotal',subtotal,'total',greatest(0,subtotal-greatest(0,(select coalesce(sum(base),0) from original_items)-coalesce((target.commercial_terms->>'original_total')::numeric,target.total))),'items',items)),'[]'::jsonb) from all_choices;
$$;
revoke all on function private.order_payment_choices(public.orders) from public,anon,authenticated;

create or replace function public.get_order_payment_choices(org_id uuid,target_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.orders;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial','financeiro']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into target from public.orders where id=target_order_id and organization_id=org_id;
 if target.id is null then raise exception 'Order not found' using errcode='P0002'; end if;
 return private.order_payment_choices(target);
end; $$;

create or replace function public.set_order_payment_condition(org_id uuid,target_order_id uuid,condition_label text,additional_discount numeric)
returns void language plpgsql security definer set search_path='' as $$
declare target public.orders; choice jsonb; line jsonb; terms jsonb;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial','financeiro']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into target from public.orders where id=target_order_id and organization_id=org_id for update;
 if target.id is null then raise exception 'Order not found' using errcode='P0002'; end if;
 if target.status in ('cancelled','completed') or exists(select 1 from public.receivables where order_id=target.id and organization_id=org_id and (status<>'cancelled' or paid_amount>0)) then raise exception 'Pedido bloqueado: financeiro já configurado.' using errcode='23514'; end if;
 select x into choice from jsonb_array_elements(private.order_payment_choices(target)) x where x->>'label'=condition_label;
 if choice is null or additional_discount is null or additional_discount<0 or additional_discount::text in ('NaN','Infinity','-Infinity') or additional_discount>(choice->>'total')::numeric then raise exception 'Condição ou desconto inválido.' using errcode='23514'; end if;
 terms:=jsonb_build_object('condition',condition_label,'subtotal',(choice->>'subtotal')::numeric,'additional_discount',round(additional_discount,2),'original_total',coalesce((target.commercial_terms->>'original_total')::numeric,target.total),'total',round((choice->>'total')::numeric-additional_discount,2));
 for line in select * from jsonb_array_elements(choice->'items') loop
 update public.order_items set snapshot=snapshot||jsonb_build_object('original_sale_total',coalesce((snapshot->>'original_sale_total')::numeric,(snapshot->>'sale_total')::numeric),'sale_total',(line->>'value')::numeric),updated_at=now() where id=(line->>'id')::uuid and order_id=target.id and organization_id=org_id;
 end loop;
 update public.orders set total=(terms->>'total')::numeric,commercial_terms=terms,payment_terms=condition_label||case when additional_discount>0 then ' · desconto adicional R$ '||round(additional_discount,2)::text else '' end,updated_at=now() where id=target.id and organization_id=org_id;
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data) values(org_id,auth.uid(),'orders',target.id,'payment_condition_selected',jsonb_build_object('total',target.total,'commercial_terms',target.commercial_terms),terms);
end; $$;
revoke all on function public.get_order_payment_choices(uuid,uuid),public.set_order_payment_condition(uuid,uuid,text,numeric) from public,anon;
grant execute on function public.get_order_payment_choices(uuid,uuid),public.set_order_payment_condition(uuid,uuid,text,numeric) to authenticated;

-- Keep the agreed condition visible after installments are configured.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.configure_order_receivables(uuid,uuid,integer,date,text)'::regprocedure);
 definition:=replace(definition,'payment_terms=installment_count||''x · ''||btrim(payment_method)','payment_terms=case when target.commercial_terms is not null then target.payment_terms||'' · ''||installment_count||''x · ''||btrim(payment_method) else installment_count||''x · ''||btrim(payment_method) end');
 execute definition;
end; $$;

