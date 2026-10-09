-- Financial tables deliberately use authorized RPCs rather than direct writes.
-- Preserve collected rows and reuse unpaid rows; excess rows are soft-cancelled.
create or replace function public.revise_order_receivables(
 org_id uuid, target_order_id uuid, new_payment_method text,
 new_installments jsonb, expected_receivables jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare
 target public.orders; current_snapshot jsonb; before_rows jsonb;
 pending_ids uuid[]; fixed_numbers integer[]; pending_total numeric;
 part jsonb; total_amount numeric:=0; n integer; i integer:=0;
 slot integer:=0; total_count integer; revision_group uuid; fixed_count integer;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','financeiro']::public.app_role[]) then
  raise exception 'Not authorized' using errcode='42501';
 end if;
 select * into target from public.orders where id=target_order_id and organization_id=org_id for update;
 if target.id is null then raise exception 'Order not found' using errcode='P0002'; end if;
 if target.status='cancelled' then raise exception 'Cancelled order' using errcode='23514'; end if;
 perform 1 from public.receivables where order_id=target_order_id and organization_id=org_id order by id for update;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'amount',r.amount,'paid_amount',r.paid_amount,'status',r.status,'due_date',r.due_date,'payment_method',r.payment_method,'installment',r.installment,'installment_count',r.installment_count) order by r.id),'[]'::jsonb),coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb)
 into current_snapshot,before_rows from public.receivables r where r.order_id=target_order_id and r.organization_id=org_id and r.status<>'cancelled';
 if expected_receivables is null or current_snapshot<>expected_receivables then
  raise exception 'Receivables changed; reopen revision' using errcode='40001';
 end if;
 select array_agg(r.id order by r.installment,r.id),sum(r.amount) into pending_ids,pending_total
 from public.receivables r where r.organization_id=org_id and r.order_id=target_order_id and r.status in ('open','overdue') and r.paid_amount=0;
 if coalesce(cardinality(pending_ids),0)=0 then raise exception 'No editable receivables' using errcode='23514'; end if;
 select array_agg(r.installment),count(*) into fixed_numbers,fixed_count from public.receivables r
 where r.organization_id=org_id and r.order_id=target_order_id and r.status<>'cancelled' and not(r.status in ('open','overdue') and r.paid_amount=0);
 if new_installments is null or jsonb_typeof(new_installments)<>'array' then raise exception 'Invalid installments' using errcode='23514'; end if;
 n:=jsonb_array_length(new_installments);
 if n<1 or n>60 or length(btrim(coalesce(new_payment_method,'')))=0 or length(new_payment_method)>100 then raise exception 'Invalid data' using errcode='23514'; end if;
 for part in select * from jsonb_array_elements(new_installments) loop
  if (part->>'amount')::numeric is null or (part->>'amount')::numeric::text in ('NaN','Infinity','-Infinity') or round((part->>'amount')::numeric,2)<=0 or nullif(part->>'due_date','') is null then raise exception 'Invalid installment' using errcode='23514'; end if;
  perform (part->>'due_date')::date;
  total_amount:=total_amount+round((part->>'amount')::numeric,2);
 end loop;
 if total_amount<>round(pending_total,2) then raise exception 'Installments must equal pending total' using errcode='23514'; end if;
 select group_id into revision_group from public.receivables where id=pending_ids[1];
 total_count:=greatest(n+fixed_count,coalesce((select max(x) from unnest(fixed_numbers) x),0));
 for part in select * from jsonb_array_elements(new_installments) loop
  i:=i+1; slot:=slot+1;
  while slot=any(coalesce(fixed_numbers,'{}'::integer[])) loop slot:=slot+1; end loop;
  if i<=cardinality(pending_ids) then
   update public.receivables set installment=slot,installment_count=total_count,
    description='Pedido '||target.display_number||' · parcela '||slot||'/'||total_count,
    due_date=(part->>'due_date')::date,amount=round((part->>'amount')::numeric,2),payment_method=btrim(new_payment_method),
    status=case when (part->>'due_date')::date<current_date then 'overdue'::public.financial_status else 'open'::public.financial_status end
   where organization_id=org_id and id=pending_ids[i];
  else
   insert into public.receivables(organization_id,order_id,group_id,installment,installment_count,description,due_date,amount,payment_method,status)
   values(org_id,target_order_id,revision_group,slot,total_count,'Pedido '||target.display_number||' · parcela '||slot||'/'||total_count,(part->>'due_date')::date,round((part->>'amount')::numeric,2),btrim(new_payment_method),case when (part->>'due_date')::date<current_date then 'overdue'::public.financial_status else 'open'::public.financial_status end);
  end if;
 end loop;
 if n<cardinality(pending_ids) then
  update public.receivables set status='cancelled',cancelled_at=now() where organization_id=org_id and id=any(pending_ids[n+1:cardinality(pending_ids)]);
 end if;
 update public.orders set payment_terms=case when fixed_count>0 then 'Conforme parcelas' else btrim(new_payment_method)||' · '||n||'x' end,updated_at=now()
 where organization_id=org_id and id=target_order_id;
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data)
 values(org_id,auth.uid(),'orders',target_order_id,'receivables_revised',before_rows,jsonb_build_object('payment_method',btrim(new_payment_method),'installments',new_installments,'preserved_received_rows',fixed_count));
end;
$$;
revoke all on function public.revise_order_receivables(uuid,uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.revise_order_receivables(uuid,uuid,text,jsonb,jsonb) to authenticated;
