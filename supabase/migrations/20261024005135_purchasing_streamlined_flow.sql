CREATE OR REPLACE FUNCTION private.purchasing_action(org_id uuid, request_id uuid, action text, payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target public.purchases; line jsonb; need public.procurement_needs; next_number bigint; vendor uuid; day date; receipt date; first_due date; method text; total_cents bigint; base_cents bigint; remainder integer; installments integer; grp uuid; paid boolean; n integer; amount numeric; selected_ids uuid[]; seen uuid[]:='{}'; order_id uuid; budget_id uuid; reason text;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','compras']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501';end if;
 if payload is null or octet_length(payload::text)>100000 or request_id is null or action is null or action not in ('direct','order','create','edit','confirm','receive','cancel') then raise exception 'Requisição inválida';end if;
 if action in ('direct','order') then
  if action='order' and (nullif(btrim(payload->>'external_number'),'') is null or nullif(payload->>'supplier_due_date','') is null) then raise exception 'Informe o número do pedido e a previsão de entrega';end if;
  perform private.purchasing_action(org_id,request_id,'create',payload||jsonb_build_object('formal_document',action='order'));
  perform private.purchasing_action(org_id,request_id,'confirm',payload||jsonb_build_object('completed',case when action='order' then false else coalesce((payload->>'completed')::boolean,true) end));
  return request_id;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('workspace-purchase:'||org_id::text,0));
 select * into target from public.purchases where id=request_id and organization_id=org_id for update;
 if action='create' then
  if target.id is not null then return target.id;end if;
  vendor:=nullif(payload->>'supplier_id','')::uuid;
  if vendor is not null and not exists(select 1 from public.suppliers where id=vendor and organization_id=org_id and active) then raise exception 'Fornecedor inválido';end if;
  if coalesce(jsonb_typeof(payload->'lines'),'')<>'array' or jsonb_array_length(payload->'lines') not between 1 and 200 then raise exception 'Selecione de 1 a 200 necessidades';end if;
  -- Deterministic row locking serializes competing selections.
  select array_agg((x->>'id')::uuid) into selected_ids from jsonb_array_elements(payload->'lines') x;
  perform 1 from public.procurement_needs where id=any(selected_ids) and organization_id=org_id order by id for update;
  for line in select * from jsonb_array_elements(payload->'lines') loop
   select n.* into need from public.procurement_needs n join public.order_items i on i.id=n.order_item_id and i.organization_id=n.organization_id join public.orders o on o.id=i.order_id and o.organization_id=i.organization_id where n.id=(line->>'id')::uuid and n.organization_id=org_id and n.status in ('awaiting_finance','awaiting_purchase') and o.status not in ('cancelled','completed');
   if need.id is null or need.id=any(seen) or exists(select 1 from public.purchase_items where procurement_need_id=need.id and status not in ('cancelled','returned')) then raise exception 'Necessidade indisponível ou repetida';end if;
   if (line->>'unit_cost') is null or (line->>'unit_cost')::numeric<0 or (line->>'unit_cost')::numeric::text in ('NaN','Infinity','-Infinity') then raise exception 'Custo inválido';end if;
   seen:=array_append(seen,need.id);
  end loop;
  perform pg_advisory_xact_lock(hashtextextended('purchases:'||org_id::text,0));
  select coalesce(max(number),0)+1 into next_number from public.purchases where organization_id=org_id;
  insert into public.purchases(id,organization_id,number,display_number,supplier_id,mode,status,total,created_by,workspace_managed,formal_document)
  values(request_id,org_id,next_number,'CMP-'||extract(year from current_date)::integer||'-'||lpad(next_number::text,6,'0'),vendor,case when coalesce((payload->>'formal_document')::boolean,false) then 'made_to_order' else 'immediate' end,'draft',0,auth.uid(),true,coalesce((payload->>'formal_document')::boolean,false));
  for line in select * from jsonb_array_elements(payload->'lines') loop
   select * into need from public.procurement_needs where id=(line->>'id')::uuid and organization_id=org_id;
   insert into public.purchase_items(organization_id,purchase_id,order_item_id,procurement_need_id,supply_id,description,quantity,unit,unit_cost,status)
   values(org_id,request_id,need.order_item_id,need.id,need.supply_id,need.description,need.quantity,need.unit,round((line->>'unit_cost')::numeric,2),'ordered');
   update public.order_items set procurement_review='needed' where id=need.order_item_id and organization_id=org_id;
  end loop;
  update public.purchases set total=(select sum(round(quantity*unit_cost,2)) from public.purchase_items where purchase_id=request_id and organization_id=org_id) where id=request_id and organization_id=org_id;
 elsif action='edit' then
  if target.id is null or target.status<>'draft' then raise exception 'Somente compras pendentes podem ser editadas';end if;
  if exists(select 1 from public.payables where purchase_id=target.id and organization_id=org_id and status<>'cancelled') then raise exception 'Compra com financeiro gerado não pode ser editada';end if;
  vendor:=nullif(payload->>'supplier_id','')::uuid;
  if vendor is not null and not exists(select 1 from public.suppliers where id=vendor and organization_id=org_id and active) then raise exception 'Fornecedor inválido';end if;
  if coalesce(jsonb_typeof(payload->'lines'),'')<>'array' then raise exception 'Itens inválidos';end if;
  if jsonb_array_length(payload->'lines')<>(select count(*) from public.purchase_items where purchase_id=target.id and organization_id=org_id) then raise exception 'Revise todos os itens da compra';end if;
  for line in select * from jsonb_array_elements(payload->'lines') loop
   if (line->>'id')::uuid=any(seen) or not exists(select 1 from public.purchase_items where id=(line->>'id')::uuid and purchase_id=target.id and organization_id=org_id and status='ordered') then raise exception 'Item inválido ou repetido';end if;
   if (line->>'unit_cost') is null or (line->>'quantity') is null or (line->>'unit_cost')::numeric<0 or (line->>'quantity')::numeric<=0 or (line->>'unit_cost')::numeric::text in ('NaN','Infinity','-Infinity') or (line->>'quantity')::numeric::text in ('NaN','Infinity','-Infinity') then raise exception 'Quantidade ou custo inválido';end if;
   seen:=array_append(seen,(line->>'id')::uuid);
   update public.purchase_items set quantity=(line->>'quantity')::numeric,unit_cost=round((line->>'unit_cost')::numeric,2) where id=(line->>'id')::uuid and purchase_id=target.id and organization_id=org_id;
  end loop;
  update public.purchases set supplier_id=vendor,formal_document=coalesce((payload->>'formal_document')::boolean,false),workspace_managed=true,total=(select sum(round(quantity*unit_cost,2)) from public.purchase_items where purchase_id=target.id and organization_id=org_id),updated_at=now() where id=target.id and organization_id=org_id;
 elsif target.id is null or not target.workspace_managed then raise exception 'Compra indisponível. Use a conferência do histórico para compras anteriores.';
 elsif action='confirm' then
  if target.status in ('awaiting_delivery','delayed','completed') and exists(select 1 from public.payables where purchase_id=target.id and organization_id=org_id and status<>'cancelled') then return target.id;end if;
  if target.status<>'draft' then raise exception 'Compra não está pendente';end if;
  vendor:=nullif(payload->>'supplier_id','')::uuid; day:=(payload->>'ordered_at')::date; first_due:=(payload->>'first_due')::date; receipt:=nullif(payload->>'received_at','')::date; method:=btrim(payload->>'method');paid:=coalesce((payload->>'paid')::boolean,false);installments:=(payload->>'installments')::integer;
  if vendor is null or not exists(select 1 from public.suppliers where id=vendor and organization_id=org_id and active) then raise exception 'Selecione um fornecedor ativo';end if;
  if day is null or day>current_date or first_due is null or coalesce(length(method),0)=0 or installments is null or installments not between 1 and 60 or target.total<=0 then raise exception 'Confira datas, valor e parcelamento';end if;
  if paid and (receipt is null or receipt>current_date or receipt<day) then raise exception 'Informe a data válida do pagamento';end if;
  if coalesce((payload->>'completed')::boolean,false) and (nullif(payload->>'delivery_at','') is null or (payload->>'delivery_at')::date<day or (payload->>'delivery_at')::date>current_date) then raise exception 'Informe a data do recebimento';end if;
  if exists(select 1 from public.payables where purchase_id=target.id and organization_id=org_id and status<>'cancelled') then raise exception 'Financeiro já gerado';end if;
  if exists(select 1 from public.purchase_items pi join public.order_items i on i.id=pi.order_item_id join public.orders o on o.id=i.order_id where pi.purchase_id=target.id and (pi.organization_id<>org_id or i.organization_id<>org_id or o.organization_id<>org_id or o.status='cancelled')) then raise exception 'Há pedido cancelado nesta compra';end if;
  if nullif(payload->>'supplier_due_date','') is not null and (payload->>'supplier_due_date')::date<day then raise exception 'A previsão não pode ser anterior à compra';end if;
  update public.purchases set supplier_due_date=nullif(payload->>'supplier_due_date','')::date,supplier_id=vendor,external_number=nullif(btrim(payload->>'external_number'),''),ordered_at=day,payment_terms=installments||'x · '||method,status=case when coalesce((payload->>'completed')::boolean,false) then 'completed' else 'awaiting_delivery' end,received_at=case when coalesce((payload->>'completed')::boolean,false) then (payload->>'delivery_at')::date else null end,updated_at=now() where id=target.id;
  grp:=gen_random_uuid(); total_cents:=round(target.total*100); if total_cents<installments then raise exception 'Parcelas não podem ter valor zero';end if; base_cents:=total_cents/installments;remainder:=(total_cents%installments)::integer;
  select case when count(distinct i.order_id)=1 then (array_agg(i.order_id))[1] end,case when count(distinct i.budget_item_id)=1 then (array_agg(i.budget_item_id))[1] end into order_id,budget_id from public.purchase_items pi join public.order_items i on i.id=pi.order_item_id and i.organization_id=pi.organization_id where pi.purchase_id=target.id and pi.organization_id=org_id;
  for n in 1..installments loop
   amount:=(base_cents+case when n<=remainder then 1 else 0 end)/100.0;
   insert into public.payables(organization_id,purchase_id,order_id,budget_item_id,supplier_id,group_id,installment,installment_count,description,due_date,amount,paid_amount,status,payment_method,paid_at)
   values(org_id,target.id,order_id,budget_id,vendor,grp,n,installments,'Compra '||target.display_number||' · parcela '||n||'/'||installments,(first_due+make_interval(months=>n-1))::date,amount,case when paid then amount else 0 end,case when paid then 'settled'::public.financial_status else 'open'::public.financial_status end,method,case when paid then receipt else null end);
  end loop;
  insert into public.payable_allocations(organization_id,group_id,order_id,budget_item_id,amount)
  select org_id,grp,i.order_id,case when count(distinct i.budget_item_id)=1 then (array_agg(i.budget_item_id))[1] end,sum(round(pi.quantity*pi.unit_cost,2))
  from public.purchase_items pi join public.order_items i on i.id=pi.order_item_id and i.organization_id=pi.organization_id where pi.purchase_id=target.id and pi.organization_id=org_id group by i.order_id having sum(round(pi.quantity*pi.unit_cost,2))>0;
  if coalesce((payload->>'completed')::boolean,false) then update public.purchase_items set status='received' where purchase_id=target.id and organization_id=org_id;end if;
 elsif action='receive' then
  if target.status='completed' then return target.id;end if;
  day:=(payload->>'delivery_at')::date;
  if target.status not in ('awaiting_delivery','delayed') or day is null or day>current_date or day<target.ordered_at then raise exception 'Recebimento inválido';end if;
  update public.purchases set status='completed',received_at=day,updated_at=now() where id=target.id;
  update public.purchase_items set status='received' where purchase_id=target.id and organization_id=org_id;
 elsif action='cancel' then
  if target.status='cancelled' then return target.id;end if;
  reason:=btrim(payload->>'reason');
  if target.status not in ('draft','awaiting_delivery','delayed') or coalesce(length(reason),0)<5 then raise exception 'Informe um motivo. Compras recebidas exigem devolução.';end if;
  if exists(select 1 from public.payables where purchase_id=target.id and organization_id=org_id and paid_amount>0 and status<>'cancelled') then raise exception 'Estorne os pagamentos no Financeiro antes de cancelar';end if;
  perform set_config('app.cancel_grouped_purchase',target.id::text,true);
  update public.payables set status='cancelled',cancelled_at=now() where purchase_id=target.id and organization_id=org_id and status<>'cancelled';
  update public.purchases set status='cancelled',cancelled_at=now(),cancellation_reason=reason where id=target.id;
  update public.purchase_items set status='cancelled' where purchase_id=target.id and organization_id=org_id;
 end if;
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,after_data) values(org_id,auth.uid(),'purchases',request_id,'workspace_'||action,payload);
 return request_id;
end $function$
;

