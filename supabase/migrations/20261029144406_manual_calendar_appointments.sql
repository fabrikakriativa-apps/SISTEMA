-- Manual appointments are independent from generated production/delivery events.
create or replace function private.manage_calendar_appointment(org_id uuid,request_id uuid,action text,payload jsonb)
returns public.calendar_events language plpgsql security definer set search_path='' as $$
declare previous public.calendar_events; saved public.calendar_events; source_client uuid; linked_order uuid; linked_budget uuid; kind text; source_kind text; source_status text; begins timestamptz; finishes timestamptz; event_title text; event_description text;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial','operacao']::public.app_role[]) then raise exception 'Seu perfil não pode gerenciar compromissos' using errcode='42501';end if;
 if request_id is null or action is null or action not in ('create','update','cancel') or payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>30000 then raise exception 'Requisição inválida' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('appointment:'||request_id::text,0));
 select * into previous from public.calendar_events where id=request_id and organization_id=org_id for update;
 if previous.id is not null and previous.event_type<>'appointment' then raise exception 'Este compromisso deve ser alterado na origem' using errcode='23514';end if;
 if action='create' and previous.id is not null then return previous;end if;
 if action<>'create' and previous.id is null then raise exception 'Compromisso não encontrado' using errcode='P0002';end if;
 if action='cancel' then
  if previous.cancelled_at is not null then return previous;end if;
  update public.calendar_events set cancelled_at=now(),sync_status='pending',updated_at=now() where id=request_id and organization_id=org_id returning * into saved;
 else
  if previous.cancelled_at is not null then raise exception 'Compromisso cancelado não pode ser editado' using errcode='23514';end if;
  event_title:=btrim(coalesce(payload->>'title',''));begins:=(payload->>'starts_at')::timestamptz;finishes:=(payload->>'ends_at')::timestamptz;
  if length(event_title) not between 2 and 200 or begins is null or finishes is null or not isfinite(begins) or not isfinite(finishes) or finishes<=begins or finishes-begins>interval '7 days' then raise exception 'Confira título, data, horário e duração' using errcode='23514';end if;
  if length(coalesce(payload->>'address',''))>1000 or length(coalesce(payload->>'notes',''))>10000 then raise exception 'Endereço ou observações muito longos' using errcode='23514';end if;
  kind:=coalesce(payload->>'link_kind','none');
  if kind='order' then
   linked_order:=nullif(payload->>'link_id','')::uuid;
   select client_id,status::text into source_client,source_status from public.orders where id=linked_order and organization_id=org_id for share;
   if not found or source_status='cancelled' then raise exception 'Pedido inválido ou cancelado' using errcode='23503';end if;
  elsif kind in ('budget','pre_budget') then
   linked_budget:=nullif(payload->>'link_id','')::uuid;
   select client_id,document_type::text,status::text into source_client,source_kind,source_status from public.budgets where id=linked_budget and organization_id=org_id for share;
   if not found or source_kind<>kind or source_status='cancelled' then raise exception 'Orçamento ou pré-orçamento inválido' using errcode='23503';end if;
  elsif kind<>'none' or nullif(payload->>'link_id','') is not null then raise exception 'Vínculo inválido' using errcode='23514';
  end if;
  event_description:=nullif(concat_ws(E'\n',case when nullif(btrim(payload->>'address'),'') is not null then 'Endereço: '||btrim(payload->>'address') end,nullif(btrim(payload->>'notes'),'')),'');
  if action='create' then
   insert into public.calendar_events(id,organization_id,client_id,order_id,budget_id,event_type,title,description,starts_at,ends_at,created_by,sync_status)
   values(request_id,org_id,source_client,linked_order,linked_budget,'appointment',event_title,event_description,begins,finishes,auth.uid(),'pending') returning * into saved;
  else
   update public.calendar_events set client_id=source_client,order_id=linked_order,budget_id=linked_budget,title=event_title,description=event_description,starts_at=begins,ends_at=finishes,sync_status='pending',updated_at=now()
   where id=request_id and organization_id=org_id returning * into saved;
  end if;
 end if;
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data)
 values(org_id,auth.uid(),'calendar_events',saved.id,'appointment_'||action,case when previous.id is not null then to_jsonb(previous) end,to_jsonb(saved));
 return saved;
end $$;
revoke all on function private.manage_calendar_appointment(uuid,uuid,text,jsonb) from public,anon;
grant execute on function private.manage_calendar_appointment(uuid,uuid,text,jsonb) to authenticated;
create or replace function public.manage_calendar_appointment(org_id uuid,request_id uuid,action text,payload jsonb)
returns public.calendar_events language sql security invoker set search_path='' as $$
 select private.manage_calendar_appointment(org_id,request_id,action,payload)
$$;
revoke all on function public.manage_calendar_appointment(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.manage_calendar_appointment(uuid,uuid,text,jsonb) to authenticated;
