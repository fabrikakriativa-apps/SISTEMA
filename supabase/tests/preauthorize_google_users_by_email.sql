begin;

select set_config('request.jwt.claim.sub','85bf0952-2dc8-4948-873a-97ffa45c159b',true);
do $test$
declare org uuid:='0e398095-cc22-421b-ae34-7bf0df8ad7b2'; who uuid:=gen_random_uuid(); cancelled uuid:=gen_random_uuid(); unknown uuid:=gen_random_uuid(); wrong uuid:=gen_random_uuid(); mail text:='__invite_test_'||who::text||'@example.com'; cmail text:='__cancel_test_'||cancelled::text||'@example.com';
begin
 perform public.authorize_membership_email(org,'  '||upper(mail)||'  ','comercial',true);
 if not exists(select 1 from public.membership_authorizations where organization_id=org and email=mail and accepted_at is null) then raise exception 'Pending authorization missing'; end if;
 perform public.authorize_membership_email(org,mail,'financeiro',true);
 insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
 values(who,mail,null,'{"provider":"google","providers":["google"]}','{}');
 if exists(select 1 from public.memberships where user_id=who) then raise exception 'Unverified email granted'; end if;
 update auth.users set email_confirmed_at=now() where id=who;
 if not exists(select 1 from public.memberships where user_id=who and organization_id=org and active and role='financeiro') then raise exception 'Verified first login not granted'; end if;
 -- Accept only once: unrelated subsequent logins cannot undo later role/revocation changes.
 update public.memberships set active=false where user_id=who and organization_id=org;
 update auth.users set last_sign_in_at=now() where id=who;
 if exists(select 1 from public.memberships where user_id=who and active) then raise exception 'Revoked access reactivated'; end if;
 perform public.authorize_membership_email(org,cmail,'comercial',true);
 perform public.authorize_membership_email(org,cmail,'comercial',false);
 insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values(cancelled,cmail,now(),'{"provider":"google"}','{}');
 if exists(select 1 from public.memberships where user_id=cancelled) then raise exception 'Cancelled grant accepted'; end if;
 insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values(unknown,'__unknown_'||unknown||'@example.com',now(),'{"provider":"google"}','{}');
 if exists(select 1 from public.memberships where user_id=unknown) then raise exception 'Unknown email granted'; end if;
 perform public.authorize_membership_email(org,'__wrong_'||wrong||'@example.com','admin',true);
 insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values(wrong,'__wrong_'||wrong||'@example.com',now(),'{}','{"provider":"google","providers":["google"]}');
 if exists(select 1 from public.memberships where user_id=wrong) then raise exception 'Editable metadata granted access'; end if;
 begin perform public.authorize_membership_email(org,'fabrikakriativa@gmail.com','comercial',false); raise exception 'Self removal accepted'; exception when check_violation then null; end;
end; $test$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$ begin
 begin perform public.authorize_membership_email('0e398095-cc22-421b-ae34-7bf0df8ad7b2','__unauthorized@example.com','admin',true); raise exception 'Unauthorized invitation accepted'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.membership_authorizations) then raise exception 'Unauthorized invitation listing'; end if;
end; $$;
reset role;
select 'pending, verified Google login, role change, cancellation, unknown identity, metadata spoofing, self-protection and RLS passed' as tests;

rollback;
