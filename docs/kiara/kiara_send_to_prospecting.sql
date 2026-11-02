-- Applied to Supabase SISTEMA on 2026-11-02. SQL release record; do not run twice without reviewing.

create or replace function public.kiara_send_to_prospecting(
  org_id uuid,
  target_conversation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
as $func$
declare
  actor uuid := auth.uid();
  chat public.kiara_conversations%rowtype;
  result_id uuid;
  linked boolean := false;
  normalized_phone text;
  match_count int;
  client_match uuid;
  matched_opp uuid;
  first_day date;
begin
  if actor is null or not private.has_org_role(org_id, array['admin','comercial']::public.app_role[]) then
    raise exception 'Acesso não autorizado à Prospecção' using errcode='42501';
  end if;

  select * into chat
    from public.kiara_conversations
   where organization_id=org_id and id=target_conversation_id
   for update;
  if not found then
    raise exception 'Conversa não encontrada para esta empresa' using errcode='22023';
  end if;

  normalized_phone := pg_catalog.regexp_replace(coalesce(chat.contact_phone,''),'[^0-9]','','g');
  if pg_catalog.length(normalized_phone)<10 or pg_catalog.length(normalized_phone)>15 then
    raise exception 'Contato sem telefone válido para vincular à Prospecção' using errcode='22023';
  end if;

  -- Serials concurrent promotion requests for one phone per organization.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(org_id::text||':kiara:'||normalized_phone,0)
  );

  if chat.lead_opportunity_id is not null then
    select s.id into result_id from public.sales_opportunities s
     where s.organization_id=org_id and s.id=chat.lead_opportunity_id;
    if result_id is null then
      raise exception 'Vínculo comercial inconsistente' using errcode='23503';
    end if;
    return pg_catalog.jsonb_build_object('ok',true,'opportunity_id',result_id,'created',false,'already_linked',true);
  end if;

  -- When an active opportunity already uses this phone, reuse it.
  select count(*),(array_agg(s.id order by s.created_at desc))[1] into match_count,matched_opp
    from public.sales_opportunities s
    where s.organization_id=org_id and s.archived_at is null
      and pg_catalog.regexp_replace(coalesce(s.phone,''),'[^0-9]','','g')=normalized_phone;
  if match_count>1 then
    raise exception 'Existem várias oportunidades ativas para este telefone. Vincule manualmente na Prospecção.'
      using errcode='23505';
  end if;
  if match_count=1 then
    result_id:=matched_opp;
    linked:=true;
  else
    select count(*),(array_agg(c.id order by c.created_at desc))[1] into match_count,client_match
      from public.clients c
      where c.organization_id=org_id and c.archived_at is null
        and pg_catalog.regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')=normalized_phone;
    if match_count>1 then
      raise exception 'Há mais de um cliente com este telefone. Confirme o cadastro na Prospecção.'
        using errcode='23505';
    end if;
    first_day := (coalesce(chat.first_message_at,chat.created_at) at time zone 'America/Sao_Paulo')::date;
    if first_day>(now() at time zone 'America/Sao_Paulo')::date then
      first_day:=(now() at time zone 'America/Sao_Paulo')::date;
    end if;
    insert into public.sales_opportunities(
      organization_id,name,phone,origin,stage,client_id,
      capture_source,capture_kind,campaign,received_on,customer_kind,response_status,
      notes,created_by
    ) values(
      org_id,
      coalesce(nullif(pg_catalog.btrim(chat.contact_name),''),'Contato WhatsApp '||pg_catalog.right(normalized_phone,4)),
      normalized_phone,
      coalesce(nullif(pg_catalog.btrim(chat.origin),''),'WhatsApp · Kiara'),
      'new',
      client_match,
      'Kiara · WhatsApp',
      case when chat.ad_id is not null then 'paid' else 'unknown' end,
      nullif(pg_catalog.btrim(chat.campaign),''),
      first_day,
      'new_lead',
      'active',
      'Atendimento originado na Kiara. O histórico permanece vinculado à conversa no painel.',
      actor
    ) returning id into result_id;
  end if;

  update public.kiara_conversations
     set lead_opportunity_id=result_id,updated_at=now()
   where id=chat.id and organization_id=org_id;

  return pg_catalog.jsonb_build_object(
    'ok',true,'opportunity_id',result_id,'created',not linked,'already_linked',false
  );
end;
$func$;
revoke all on function public.kiara_send_to_prospecting(uuid,uuid) from public,anon;
grant execute on function public.kiara_send_to_prospecting(uuid,uuid) to authenticated;
