-- Aplicada no Supabase SISTEMA: 2026-11-02.
-- Impede reagendar duas vezes ao pressionar Liberar.
create or replace function public.kiara_set_reply_hold(org_id uuid,target_conversation_id uuid,new_hold boolean)
returns jsonb language plpgsql security definer set search_path='' as $kiara_hold$
declare v_status text; v_hold boolean; v_previous boolean; v_changed boolean;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then
  raise exception 'Not authorized' using errcode='42501';
 end if;
 select reply_held into v_previous from public.kiara_conversations
 where organization_id=org_id and id=target_conversation_id for update;
 if not found then raise exception 'Conversation not found' using errcode='P0002'; end if;
 v_changed := v_previous is distinct from new_hold;
 if v_changed then
  update public.kiara_conversations set
   reply_held=new_hold,
   reply_held_since=case when new_hold then now() else null end,
   reply_held_by=case when new_hold then auth.uid() else null end,
   updated_at=now()
  where organization_id=org_id and id=target_conversation_id
  returning status,reply_held into v_status,v_hold;
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,after_data)
  values(org_id,auth.uid(),'kiara',target_conversation_id,
    case when new_hold then 'hold_reply' else 'release_reply' end,
    jsonb_build_object('held',new_hold,'status',v_status));
 else
  select status,reply_held into v_status,v_hold from public.kiara_conversations
   where organization_id=org_id and id=target_conversation_id;
 end if;
 return jsonb_build_object('ok',true,'held',v_hold,'changed',v_changed,
   'conversation_id',target_conversation_id,'status',v_status);
end $kiara_hold$;
revoke all on function public.kiara_set_reply_hold(uuid,uuid,boolean) from public,anon;
grant execute on function public.kiara_set_reply_hold(uuid,uuid,boolean) to authenticated;
