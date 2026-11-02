-- Applied to Supabase SISTEMA on 2026-11-02. Private coaching records, no automatic Worker activation.
begin;
create table public.kiara_guidance (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 conversation_id uuid,
 message_id uuid,
 scope text not null check (scope in ('conversation','global')),
 kind text not null check (kind in ('instruction','correction')),
 instruction text not null check (char_length(btrim(instruction)) between 5 and 2000),
 status text not null default 'recorded' check(status in ('recorded','pending_review','approved','archived')),
 created_by uuid not null references public.profiles(id),
 reviewed_by uuid references public.profiles(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 constraint kiara_guidance_fk_org_conv foreign key (organization_id,conversation_id)
 references public.kiara_conversations(organization_id,id),
 constraint kiara_guidance_valid_scope_status check(
  (scope='conversation' and conversation_id is not null and status in ('recorded','archived'))
  or (scope='global' and conversation_id is null and status in ('pending_review','approved','archived'))
 ),
 constraint kiara_guidance_valid_message check(message_id is null or kind='correction')
);
create index kiara_guidance_conversation_idx on public.kiara_guidance(organization_id,conversation_id,created_at desc);
create index kiara_guidance_review_idx on public.kiara_guidance(organization_id,status,created_at desc);
alter table public.kiara_guidance enable row level security;
revoke all on public.kiara_guidance from public,anon,authenticated;
grant select on public.kiara_guidance to authenticated;
grant insert(organization_id,conversation_id,message_id,scope,kind,instruction,status,created_by) on public.kiara_guidance to authenticated;
create policy kiara_guidance_read on public.kiara_guidance
 for select to authenticated
 using(private.has_org_role(organization_id,array['admin','comercial']::public.app_role[]));
create policy kiara_guidance_insert on public.kiara_guidance
 for insert to authenticated
 with check(
  created_by=(select auth.uid())
  and private.has_org_role(organization_id,array['admin','comercial']::public.app_role[])
  and ((scope='global' and status='pending_review') or (scope='conversation' and status='recorded'))
  and (message_id is null or exists(
   select 1 from public.kiara_messages m
   where m.id=message_id and m.organization_id=kiara_guidance.organization_id
     and m.conversation_id=kiara_guidance.conversation_id and m.sender='kiara'
  ))
 );
create function public.kiara_review_guidance(org_id uuid,guidance_id uuid,decision text)
returns void language plpgsql security definer set search_path='' as $kiara_review$
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin']::public.app_role[]) then
  raise exception 'Not authorized' using errcode='42501';
 end if;
 if decision not in ('approve','archive') then raise exception 'Invalid decision' using errcode='22023'; end if;
 update public.kiara_guidance
  set status=case when decision='approve' then 'approved' else 'archived' end,
      reviewed_by=auth.uid(), reviewed_at=now()
  where id=guidance_id and organization_id=org_id and scope='global' and status='pending_review';
 if not found then raise exception 'Guidance not available for review' using errcode='P0002'; end if;
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action)
 values(org_id,auth.uid(),'kiara_guidance',guidance_id,'review_'||decision);
end $kiara_review$;
revoke all on function public.kiara_review_guidance(uuid,uuid,text) from public,anon;
grant execute on function public.kiara_review_guidance(uuid,uuid,text) to authenticated;
commit;
