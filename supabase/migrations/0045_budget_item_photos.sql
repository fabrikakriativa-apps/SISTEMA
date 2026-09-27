begin;

create or replace function public.register_budget_item_photo(
  org_id uuid,
  target_budget_item_id uuid,
  object_path text,
  file_name text,
  content_type text,
  byte_size bigint
) returns public.attachments
language plpgsql security definer set search_path=''
as $$
declare created public.attachments;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.budget_items i join public.budgets b on b.id=i.budget_id and b.organization_id=i.organization_id
    where i.id=target_budget_item_id and i.organization_id=org_id and b.status='draft'
  ) then
    raise exception 'Draft budget item not found' using errcode='23503';
  end if;
  if object_path not like org_id::text||'/budget-items/'||target_budget_item_id::text||'/photos/%'
     or lower(content_type) not in ('image/jpeg','image/png','image/webp')
     or byte_size<1 or byte_size>10485760 then
    raise exception 'Invalid photo attachment' using errcode='23514';
  end if;
  if not exists(select 1 from storage.objects where bucket_id='documents' and name=object_path) then
    raise exception 'Photo not uploaded' using errcode='23503';
  end if;

  insert into public.attachments(organization_id,entity_type,entity_id,purpose,storage_path,original_name,mime_type,size_bytes,uploaded_by)
  values(org_id,'budget_item',target_budget_item_id,'item_reference_photo',object_path,btrim(file_name),content_type,byte_size,auth.uid())
  returning * into created;
  return created;
end;
$$;

revoke all on function public.register_budget_item_photo(uuid,uuid,text,text,text,bigint) from public,anon;
grant execute on function public.register_budget_item_photo(uuid,uuid,text,text,text,bigint) to authenticated;

commit;
