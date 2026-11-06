create or replace function private.authorize_membership_email(org_id uuid,target_email text,new_role public.app_role,new_active boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare normalized text:=lower(btrim(target_email)); target_user uuid; invitation public.membership_authorizations; previous public.memberships;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin']::public.app_role[]) then raise exception 'Not allowed' using errcode='42501'; end if;
 if normalized is null or length(normalized)>254 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or new_role is null or new_active is null then raise exception 'Invalid authorization' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended(normalized,0));
 -- Email and provider come from Auth, never from editable profile/user metadata.
 select u.id into target_user from auth.users u join public.profiles p on p.id=u.id
 where lower(u.email)=normalized and u.email_confirmed_at is not null
 and (u.raw_app_meta_data->>'provider'='google' or coalesce(u.raw_app_meta_data->'providers','[]'::jsonb)?'google');
 if target_user=auth.uid() and (new_role<>'admin' or not new_active) then raise exception 'Administrator cannot remove own access' using errcode='23514'; end if;
 insert into public.membership_authorizations(organization_id,email,role,active,created_by,accepted_user_id,accepted_at)
 values(org_id,normalized,new_role,new_active,auth.uid(),target_user,case when target_user is not null then now() end)
 on conflict(organization_id,email) do update set role=excluded.role,active=excluded.active,updated_at=now(),accepted_user_id=excluded.accepted_user_id,accepted_at=excluded.accepted_at
 returning * into invitation;
 if target_user is not null then
   select * into previous from public.memberships where organization_id=org_id and user_id=target_user;
   insert into public.memberships(organization_id,user_id,role,active) values(org_id,target_user,new_role,new_active)
   on conflict(organization_id,user_id) do update set role=excluded.role,active=excluded.active;
 end if;
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data)
 values(org_id,auth.uid(),'memberships',coalesce(target_user,invitation.id),case when target_user is null then 'email_authorized' else 'access_updated' end,to_jsonb(previous),jsonb_build_object('email',normalized,'role',new_role,'active',new_active,'pending',target_user is null));
 return jsonb_build_object('email',normalized,'pending',target_user is null,'active',new_active);
end; $$;

create or replace function private.accept_membership_authorizations() returns trigger language plpgsql security definer set search_path='' as $$
declare invitation public.membership_authorizations;
begin
 if new.email is null or new.email_confirmed_at is null then return new; end if;
 if not (coalesce(new.raw_app_meta_data->>'provider','')='google' or coalesce(new.raw_app_meta_data->'providers','[]'::jsonb)?'google') then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(new.email),0));
 for invitation in select * from public.membership_authorizations
   where email=lower(new.email) and active and accepted_at is null for update
 loop
   insert into public.memberships(organization_id,user_id,role,active)
   values(invitation.organization_id,new.id,invitation.role,true)
   on conflict(organization_id,user_id) do update set role=excluded.role,active=true;
   update public.membership_authorizations set accepted_user_id=new.id,accepted_at=now(),updated_at=now() where id=invitation.id;
   insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,after_data)
   values(invitation.organization_id,new.id,'memberships',new.id,'authorized_first_login',jsonb_build_object('email',new.email,'role',invitation.role,'authorization_id',invitation.id));
 end loop;
 return new;
end; $$;
