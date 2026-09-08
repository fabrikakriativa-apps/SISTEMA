begin;

grant select on public.attachments to authenticated;

create policy "attachment member read" on public.attachments
for select to authenticated
using (private.has_org_role(organization_id,array['admin','comercial','compras','financeiro','operacao']::public.app_role[]));

create policy "organization document read" on storage.objects
for select to authenticated
using (
  bucket_id='documents' and exists(
    select 1 from public.memberships m
    where m.user_id=(select auth.uid()) and m.active
      and m.organization_id::text=(storage.foldername(name))[1]
  )
);

create policy "commercial document upload" on storage.objects
for insert to authenticated
with check (
  bucket_id='documents' and exists(
    select 1 from public.memberships m
    where m.user_id=(select auth.uid()) and m.active
      and m.role in ('admin','comercial')
      and m.organization_id::text=(storage.foldername(name))[1]
  )
);

create policy "commercial document cleanup" on storage.objects
for delete to authenticated
using (
  bucket_id='documents' and exists(
    select 1 from public.memberships m
    where m.user_id=(select auth.uid()) and m.active
      and m.role in ('admin','comercial')
      and m.organization_id::text=(storage.foldername(name))[1]
  )
);

create or replace function public.register_budget_attachment(
  org_id uuid,
  target_budget_id uuid,
  object_path text,
  file_name text,
  content_type text,
  byte_size bigint,
  extracted_data jsonb default null
) returns public.attachments
language plpgsql security definer set search_path=''
as $$
declare created public.attachments;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if not exists(select 1 from public.budgets where id=target_budget_id and organization_id=org_id) then
    raise exception 'Invalid budget' using errcode='23503';
  end if;
  if object_path not like org_id::text||'/budgets/'||target_budget_id::text||'/%'
     or lower(content_type)<>'application/pdf' or byte_size<1 or byte_size>20971520 then
    raise exception 'Invalid attachment' using errcode='23514';
  end if;
  if not exists(select 1 from storage.objects where bucket_id='documents' and name=object_path) then
    raise exception 'Document not uploaded' using errcode='23503';
  end if;
  insert into public.attachments(organization_id,entity_type,entity_id,purpose,storage_path,original_name,mime_type,size_bytes,extraction,uploaded_by)
  values(org_id,'budget',target_budget_id,'manufacturer_quote',object_path,btrim(file_name),content_type,byte_size,extracted_data,auth.uid())
  returning * into created;
  return created;
end;
$$;

revoke all on function public.register_budget_attachment(uuid,uuid,text,text,text,bigint,jsonb) from public,anon;
grant execute on function public.register_budget_attachment(uuid,uuid,text,text,text,bigint,jsonb) to authenticated;

commit;
