alter table public.receivables add column if not exists gross_amount numeric(14,2);
alter table public.receivables add column if not exists fee_amount numeric(14,2) not null default 0;
create or replace function public.set_order_payment_plan(org_id uuid,target_order_id uuid,new_plan jsonb,expected_receivables jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare target public.orders; g jsonb; p jsonb; flat jsonb:='[]'; snap jsonb; gross numeric; fee numeric; net numeric; parts_total numeric; total_gross numeric:=0; n integer; idx integer:=0; group_idx integer:=0; label text:=''; method text; r public.receivables; new_group uuid:=gen_random_uuid(); has_existing boolean;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial','financeiro']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into target from public.orders where id=target_order_id and organization_id=org_id for update;
 if target.id is null or target.status in ('cancelled','completed') then raise exception 'Invalid order' using errcode='23514'; end if;
 perform 1 from public.receivables where order_id=target.id and organization_id=org_id order by id for update;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'amount',amount,'paid_amount',paid_amount,'status',status,'due_date',due_date,'payment_method',payment_method,'installment',installment,'installment_count',installment_count) order by id),'[]') into snap from public.receivables where order_id=target.id and organization_id=org_id and status<>'cancelled';
 if expected_receivables is null or expected_receivables<>snap then raise exception 'Receivables changed' using errcode='40001'; end if;
 has_existing:=jsonb_array_length(snap)>0;
 if has_existing and (not private.has_org_role(org_id,array['admin','financeiro']::public.app_role[]) or exists(select 1 from public.receivables where order_id=target.id and organization_id=org_id and status<>'cancelled' and (paid_amount<>0 or status not in ('open','overdue')))) then raise exception 'Received entries are protected' using errcode='23514'; end if;
 if new_plan is null or jsonb_typeof(new_plan)<>'array' or jsonb_array_length(new_plan) not between 1 and 2 then raise exception 'Invalid plan' using errcode='23514'; end if;
 for g in select * from jsonb_array_elements(new_plan) loop
  group_idx:=group_idx+1; new_group:=gen_random_uuid(); method:=g->>'method'; gross:=round((g->>'amount')::numeric,2); fee:=round(coalesce((g->>'fee')::numeric,0),2); n:=(g->>'installments')::integer;
  if method is null or method not in ('PIX','Transferência bancária','Boleto','Cartão de crédito','Cartão de débito','Dinheiro','A combinar') or gross is null or gross::text in ('NaN','Infinity','-Infinity') or gross<=0 or fee::text in ('NaN','Infinity','-Infinity') or fee<0 or fee>=gross or n is null or n not between 1 and 60 or (method<>'Cartão de crédito' and fee<>0) then raise exception 'Invalid payment' using errcode='23514'; end if;
  total_gross:=total_gross+gross;
  label:=label||case when label='' then '' else ' + ' end||method||' · '||n||'x'||case when jsonb_array_length(new_plan)>1 then ' — R$ '||replace(gross::text,'.',',') else '' end;
  if method='Cartão de crédito' then
   if nullif(g->>'due_date','') is null then raise exception 'Due date required' using errcode='23514'; end if;
   perform (g->>'due_date')::date;
   flat:=flat||jsonb_build_array(jsonb_build_object('group_id',new_group,'amount',gross,'net',gross-fee,'fee',fee,'due_date',g->>'due_date','method',method,'description','Pedido '||target.display_number||' · cartão '||n||'x · antecipado'));
  else
   if jsonb_typeof(g->'parts') is distinct from 'array' or jsonb_array_length(g->'parts')<>n then raise exception 'Invalid installments' using errcode='23514'; end if;
   parts_total:=0;idx:=0;
   for p in select * from jsonb_array_elements(g->'parts') loop
    idx:=idx+1;net:=round((p->>'amount')::numeric,2);
    if net is null or net::text in ('NaN','Infinity','-Infinity') or net<=0 or nullif(p->>'due_date','') is null then raise exception 'Invalid installment' using errcode='23514'; end if;
    perform (p->>'due_date')::date;parts_total:=parts_total+net;
    flat:=flat||jsonb_build_array(jsonb_build_object('group_id',new_group,'amount',net,'net',net,'fee',0,'due_date',p->>'due_date','method',method,'description','Pedido '||target.display_number||' · '||method||' · parcela '||idx||'/'||n));
   end loop;
   if parts_total<>gross then raise exception 'Installments must equal payment amount' using errcode='23514'; end if;
  end if;
 end loop;
 if total_gross<>round(target.total,2) or jsonb_array_length(flat)>60 then raise exception 'Payments must equal order total' using errcode='23514'; end if;
 if has_existing then
  update public.receivables set status='cancelled',cancelled_at=now() where order_id=target.id and organization_id=org_id and status<>'cancelled';
  idx:=0;for p in select * from jsonb_array_elements(flat) loop
   idx:=idx+1;
   insert into public.receivables(organization_id,order_id,group_id,installment,installment_count,description,due_date,amount,gross_amount,fee_amount,payment_method,status)
   values(org_id,target.id,(p->>'group_id')::uuid,idx,jsonb_array_length(flat),p->>'description',(p->>'due_date')::date,(p->>'net')::numeric,(p->>'amount')::numeric,(p->>'fee')::numeric,p->>'method','open');
  end loop;
 else
  perform public.configure_order_custom_receivables(org_id,target.id,'A combinar',flat);
  for r in select * from public.receivables where order_id=target.id and organization_id=org_id and status<>'cancelled' order by installment loop
   p:=flat->(r.installment-1);
   update public.receivables set group_id=(p->>'group_id')::uuid,amount=(p->>'net')::numeric,gross_amount=(p->>'amount')::numeric,fee_amount=(p->>'fee')::numeric,payment_method=p->>'method',description=p->>'description' where id=r.id;
  end loop;
 end if;
 update public.orders set payment_terms=label,commercial_terms=coalesce(commercial_terms,'{}')||jsonb_build_object('payment_plan',new_plan) where id=target.id;
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data) values(org_id,auth.uid(),'orders',target.id,'payment_plan_configured',snap,new_plan);
end $$;
revoke all on function public.set_order_payment_plan(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.set_order_payment_plan(uuid,uuid,jsonb,jsonb) to authenticated;
