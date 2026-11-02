-- Kiara: estrutura isolada para sincronização de conversas.
-- Executar somente após revisão de segurança; não importa dados antigos.
begin;

create table public.kiara_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  source text not null default 'easy' check (source in ('easy','original')),
  phone_number_id text not null,
  contact_wa_id text not null,
  contact_name text,
  contact_phone text not null,
  status text not null default 'ai' check (status in ('ai','waiting_human','human','no_interaction')),
  origin text,
  campaign text,
  ad_id text,
  adset_id text,
  adset_name text,
  region text,
  initial_referral jsonb,
  lead_opportunity_id uuid,
  last_interaction_at timestamptz not null default now(),
  first_message_at timestamptz not null default now(),
  last_customer_message_at timestamptz,
  last_business_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,source,phone_number_id,contact_wa_id),
  unique(organization_id,id),
  constraint kiara_lead_org_fk foreign key (organization_id,lead_opportunity_id)
    references public.sales_opportunities(organization_id,id)
);
create index kiara_conversations_recent_idx
  on public.kiara_conversations(organization_id,last_interaction_at desc);
create index kiara_conversations_status_idx
  on public.kiara_conversations(organization_id,status,last_interaction_at desc);

create table public.kiara_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  conversation_id uuid not null,
  whatsapp_message_id text not null,
  direction text not null check(direction in ('incoming','outgoing')),
  sender text not null check(sender in ('customer','kiara','human')),
  message_type text not null default 'text',
  text_body text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint kiara_messages_conversation_org_fk foreign key (organization_id,conversation_id)
    references public.kiara_conversations(organization_id,id) on delete cascade,
  unique(organization_id,whatsapp_message_id)
);
create index kiara_messages_history_idx
  on public.kiara_messages(organization_id,conversation_id,occurred_at desc);

-- Future operator control. No browser write permissions are granted yet.
-- Worker must check these flags fail-closed BEFORE these controls can be enabled.
create table public.kiara_operational_control (
  organization_id uuid primary key references public.organizations(id),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.kiara_conversations enable row level security;
alter table public.kiara_messages enable row level security;
alter table public.kiara_operational_control enable row level security;

revoke all on public.kiara_conversations,public.kiara_messages,public.kiara_operational_control
  from public,anon,authenticated;

grant select on public.kiara_conversations,public.kiara_messages,public.kiara_operational_control
  to authenticated;

create policy kiara_conversations_org_read
 on public.kiara_conversations for select to authenticated
 using (private.has_org_role(organization_id,array['admin','comercial']::public.app_role[]));

create policy kiara_messages_org_read
 on public.kiara_messages for select to authenticated
 using (private.has_org_role(organization_id,array['admin','comercial']::public.app_role[]));

create policy kiara_control_org_read
 on public.kiara_operational_control for select to authenticated
 using (private.has_org_role(organization_id,array['admin','comercial']::public.app_role[]));

-- Authenticated operator commands. No direct browser writes to Kiara tables.
-- These actions MUST remain hidden/disabled until the Worker checks state
-- before every API send; changing this table alone does not stop the Worker.
create or replace function public.kiara_operator_action(
  org_id uuid,
  action_name text,
  target_conversation_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path=''
as $kiara_fn$
declare
  affected uuid;
  resulting_status text;
begin
  if auth.uid() is null or
     not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if action_name in ('pause_all','resume_all') then
    if target_conversation_id is not null then
      raise exception 'Global action does not accept a conversation';
    end if;
    if action_name = 'resume_all' and
       not private.has_org_role(org_id,array['admin']::public.app_role[]) then
      raise exception 'Only admin can reactivate Kiara' using errcode='42501';
    end if;
    insert into public.kiara_operational_control(organization_id,enabled,updated_at,updated_by)
    values(org_id,action_name='resume_all',now(),auth.uid())
    on conflict(organization_id) do update set enabled=excluded.enabled,updated_at=now(),updated_by=auth.uid();
    affected := org_id;
  elsif action_name in ('assume','return_to_ai') then
    if target_conversation_id is null then raise exception 'Select a conversation'; end if;
    update public.kiara_conversations
      set status=case when action_name='assume' then 'human' else 'ai' end,
          updated_at=now()
    where id=target_conversation_id and organization_id=org_id
    returning id,status into affected,resulting_status;
    if affected is null then raise exception 'Conversation not found' using errcode='P0002'; end if;
  else
    raise exception 'Unknown action' using errcode='22023';
  end if;
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,after_data)
  values(org_id,auth.uid(),'kiara',affected,action_name,
         jsonb_build_object('conversation_id',target_conversation_id,'status',resulting_status));
  return jsonb_build_object('ok',true,'action',action_name,'conversation_id',target_conversation_id);
end $kiara_fn$;

revoke all on function public.kiara_operator_action(uuid,text,uuid) from public,anon;
grant execute on function public.kiara_operator_action(uuid,text,uuid) to authenticated;

-- Only the trusted server-side ingestion may INSERT/UPDATE these tables
-- using its secret service_role credential. Never expose it in the browser.

commit;
