-- Additive classifications. No historical records are guessed or rewritten.
alter table public.sales_opportunities drop constraint sales_opportunities_response_status_check;
alter table public.sales_opportunities add constraint sales_opportunities_response_status_check check(response_status in ('active','waiting','no_response','no_interaction','pre_proposal_no_response','proposal_no_response'));

-- A new unanswered attempt must not erase the operator's classification.
-- A recorded real answer resumes active attendance, as before.
CREATE OR REPLACE FUNCTION public.register_sales_contact(org_id uuid, target_opportunity_id uuid, activity_id uuid, contact_at timestamp with time zone, contact_channel text, contact_direction text, contact_outcome text, contact_notes text, next_return_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare lead public.sales_opportunities; days int; due timestamptz; existing public.sales_contact_activities;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into lead from public.sales_opportunities where id=target_opportunity_id and organization_id=org_id for update;
 if lead.id is null or lead.archived_at is not null then raise exception 'Oportunidade indisponível.'; end if;
 select * into existing from public.sales_contact_activities where id=activity_id;
 if existing.id is not null then
  if existing.organization_id<>org_id or existing.opportunity_id<>target_opportunity_id or existing.created_by<>auth.uid() then raise exception 'Identificador de contato inválido.'; end if;
  return existing.id;
 end if;
 if contact_at is null or contact_at>now()+interval '1 minute' then raise exception 'Informe uma data de contato válida, não futura.'; end if;
 if contact_channel not in ('whatsapp','email','phone','meeting','other') or contact_direction not in ('outbound','inbound') or contact_outcome not in ('answered','no_response','requested_return') or (contact_direction='inbound' and contact_outcome='no_response') then raise exception 'Contato inválido.'; end if;
 if next_return_at is not null and next_return_at<=now() then raise exception 'O próximo retorno deve estar no futuro.'; end if;
 select follow_up_days into days from public.sales_followup_settings where organization_id=org_id;
 due:=case when lead.stage in ('won','lost') then null else coalesce(next_return_at,now()+make_interval(days=>coalesce(days,3))) end;
 insert into public.sales_contact_activities(id,organization_id,opportunity_id,occurred_at,channel,direction,outcome,notes,next_follow_up_at,created_by)
 values(activity_id,org_id,target_opportunity_id,contact_at,contact_channel,contact_direction,contact_outcome,nullif(btrim(contact_notes),''),due,auth.uid());
 update public.sales_opportunities set next_follow_up_at=due,stage=case when stage='new' then 'contacted' else stage end,
  commercial_phase=case when commercial_phase='new' then 'contacted' when commercial_phase='proposal_sent' and contact_outcome<>'no_response' then 'negotiating' else commercial_phase end,
  response_status=case when contact_outcome<>'no_response' then 'active' when lead.response_status in ('no_interaction','pre_proposal_no_response','proposal_no_response','no_response') then lead.response_status else 'waiting' end where id=lead.id and organization_id=org_id;
 return activity_id;
end $function$;
