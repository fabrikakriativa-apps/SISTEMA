create policy "membership admin read" on public.memberships for select to authenticated
using (private.has_org_role(organization_id,array['admin']::public.app_role[]));

create policy "profile organization admin read" on public.profiles for select to authenticated
using (
  id=(select auth.uid()) or exists(
    select 1 from public.memberships target
    where target.user_id=profiles.id
      and private.has_org_role(target.organization_id,array['admin']::public.app_role[])
  )
);

create or replace function public.manage_membership(org_id uuid,target_email text,new_role public.app_role,new_active boolean)
returns public.memberships
language plpgsql security definer set search_path=''
as $$
declare target_user uuid; previous public.memberships; updated public.memberships;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin']::public.app_role[]) then
    raise exception 'Not allowed' using errcode='42501';
  end if;
  select id into target_user from public.profiles where lower(email)=lower(btrim(target_email));
  if target_user is null then raise exception 'User must sign in once before authorization' using errcode='23503'; end if;
  if target_user=auth.uid() and (new_role<>'admin' or not new_active) then
    raise exception 'Administrator cannot remove own access' using errcode='23514';
  end if;
  select * into previous from public.memberships where organization_id=org_id and user_id=target_user;
  insert into public.memberships(organization_id,user_id,role,active)
  values(org_id,target_user,new_role,new_active)
  on conflict(organization_id,user_id) do update set role=excluded.role,active=excluded.active
  returning * into updated;
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data)
  values(org_id,auth.uid(),'memberships',target_user,'access_updated',to_jsonb(previous),to_jsonb(updated));
  return updated;
end $$;

revoke all on function public.manage_membership(uuid,text,public.app_role,boolean) from public,anon;
grant execute on function public.manage_membership(uuid,text,public.app_role,boolean) to authenticated;
