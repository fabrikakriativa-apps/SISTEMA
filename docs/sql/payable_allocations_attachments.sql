-- CLI unavailable in this workspace. Reviewed additive production migration.
create table public.payable_allocations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 group_id uuid not null, order_id uuid not null references public.orders(id),
 budget_item_id uuid references public.budget_items(id), amount numeric(14,2) not null check(amount>0),
 unique(organization_id,group_id,order_id)
);
create index payable_allocations_order_idx on public.payable_allocations(order_id);
create index payable_allocations_item_idx on public.payable_allocations(budget_item_id);
alter table public.payable_allocations enable row level security;
revoke all on public.payable_allocations from anon,authenticated;
grant select on public.payable_allocations to authenticated;
create policy financial_allocation_read on public.payable_allocations for select to authenticated
 using(private.has_org_role(organization_id,array['admin','financeiro','compras']::public.app_role[]));

-- Deferred check permits atomic replacement of unpaid installments, but prevents
-- older clients or single-installment deletion from leaving a stale allocation.
create function private.check_payable_allocation_total() returns trigger language plpgsql security definer set search_path='' as $$
declare org uuid; grp uuid; allocated numeric; billed numeric;
begin
 org:=coalesce(new.organization_id,old.organization_id); grp:=coalesce(new.group_id,old.group_id);
 select sum(amount) into allocated from public.payable_allocations where organization_id=org and group_id=grp;
 if allocated is not null then
   select coalesce(sum(amount),0) into billed from public.payables where organization_id=org and group_id=grp;
   if allocated<>billed then raise exception 'O rateio deve somar o total da conta. Edite a conta e o rateio juntos.' using errcode='23514'; end if;
 end if;
 return null;
end; $$;
revoke all on function private.check_payable_allocation_total() from public,anon,authenticated;
create constraint trigger payable_allocation_total after insert or update or delete on public.payable_allocations deferrable initially deferred for each row execute function private.check_payable_allocation_total();
create constraint trigger payable_group_allocation_total after insert or update or delete on public.payables deferrable initially deferred for each row execute function private.check_payable_allocation_total();

create function public.save_allocated_payable_group(org_id uuid,target_group_id uuid,payable_description text,payable_supplier_id uuid,payable_method text,installments_json jsonb,allocations_json jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare grp uuid:=target_group_id; line jsonb; total numeric; allocated numeric; previous jsonb;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','financeiro']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 if jsonb_typeof(allocations_json) is distinct from 'array' or jsonb_array_length(allocations_json)>60 then raise exception 'Invalid allocations' using errcode='23514'; end if;
 select sum((x->>'amount')::numeric) into total from jsonb_array_elements(installments_json) x;
 select coalesce(sum((x->>'amount')::numeric),0) into allocated from jsonb_array_elements(allocations_json) x;
 if jsonb_array_length(allocations_json)>0 and allocated is distinct from total then raise exception 'O rateio deve somar o valor total.' using errcode='23514'; end if;
 -- Lock referenced orders in stable order, also serializing with cancellation.
 perform 1 from public.orders o where o.organization_id=org_id and o.id in(select (x->>'order_id')::uuid from jsonb_array_elements(allocations_json) x) order by o.id for update;
 for line in select value from jsonb_array_elements(allocations_json) loop
   if (line->>'amount')::numeric is null or (line->>'amount')::numeric<=0 or round((line->>'amount')::numeric,2)<>(line->>'amount')::numeric then raise exception 'Invalid allocation amount' using errcode='23514'; end if;
   if not exists(select 1 from public.orders where id=(line->>'order_id')::uuid and organization_id=org_id and status<>'cancelled') then raise exception 'Invalid order' using errcode='23514'; end if;
   if nullif(line->>'budget_item_id','') is not null and not exists(select 1 from public.order_items where organization_id=org_id and order_id=(line->>'order_id')::uuid and budget_item_id=(line->>'budget_item_id')::uuid and status<>'cancelled') then raise exception 'Invalid order item' using errcode='23514'; end if;
 end loop;
 if grp is null then
   select p.group_id into grp from public.create_manual_payable_group_with_link(org_id,payable_description,payable_supplier_id,null,null,payable_method,installments_json) p limit 1;
 else
   select jsonb_agg(to_jsonb(a)) into previous from public.payable_allocations a where organization_id=org_id and group_id=grp;
   perform public.update_manual_payable_group(org_id,grp,payable_description,payable_supplier_id,null,null,payable_method,installments_json);
 end if;
 delete from public.payable_allocations where organization_id=org_id and group_id=grp;
 insert into public.payable_allocations(organization_id,group_id,order_id,budget_item_id,amount)
 select org_id,grp,(x->>'order_id')::uuid,nullif(x->>'budget_item_id','')::uuid,(x->>'amount')::numeric from jsonb_array_elements(allocations_json) x;
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data)
 values(org_id,auth.uid(),'payables',grp,'allocation_saved',previous,allocations_json);
 return grp;
end; $$;
revoke all on function public.save_allocated_payable_group(uuid,uuid,text,uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.save_allocated_payable_group(uuid,uuid,text,uuid,text,jsonb,jsonb) to authenticated;

-- Never silently cancel a shared supplier bill when cancelling one customer order.
create function private.protect_allocated_order() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='cancelled' and old.status<>'cancelled' and exists(select 1 from public.payable_allocations a join public.payables p on p.organization_id=a.organization_id and p.group_id=a.group_id where a.organization_id=new.organization_id and a.order_id=new.id and p.status<>'cancelled') then
 raise exception 'Remova ou ajuste o rateio das contas a pagar antes de cancelar este pedido.' using errcode='23514'; end if;
 return new;
end; $$;
revoke all on function private.protect_allocated_order() from public,anon,authenticated;
create trigger protect_allocated_order before update of status on public.orders for each row execute function private.protect_allocated_order();

create table public.payable_files (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 group_id uuid not null, storage_path text not null unique, original_name text not null,
 mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
 size_bytes bigint not null check(size_bytes between 1 and 20971520), uploaded_by uuid not null,
 created_at timestamptz not null default now()
);
create index payable_files_group_idx on public.payable_files(organization_id,group_id);
alter table public.payable_files enable row level security;
revoke all on public.payable_files from anon,authenticated;
grant select on public.payable_files to authenticated;
create policy financial_file_read on public.payable_files for select to authenticated using(private.has_org_role(organization_id,array['admin','financeiro']::public.app_role[]));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('payable-documents','payable-documents',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp']);
create policy financial_file_upload on storage.objects for insert to authenticated with check(
 bucket_id='payable-documents' and exists(select 1 from public.payables p where p.organization_id::text=(storage.foldername(name))[1] and p.group_id::text=(storage.foldername(name))[2] and private.has_org_role(p.organization_id,array['admin','financeiro']::public.app_role[])));
create policy financial_file_download on storage.objects for select to authenticated using(
 bucket_id='payable-documents' and exists(select 1 from public.payables p where p.organization_id::text=(storage.foldername(name))[1] and p.group_id::text=(storage.foldername(name))[2] and private.has_org_role(p.organization_id,array['admin','financeiro']::public.app_role[])));
create policy financial_file_cleanup on storage.objects for delete to authenticated using(
 bucket_id='payable-documents' and owner_id=(select auth.uid())::text and not exists(select 1 from public.payable_files f where f.storage_path=name));
create function public.register_payable_file(org_id uuid,target_group_id uuid,file_path text,file_name text,file_mime text,file_size bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare created_id uuid;
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','financeiro']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 perform 1 from public.payables where organization_id=org_id and group_id=target_group_id for update;
 if not found or file_path not like org_id::text||'/'||target_group_id::text||'/%' or length(btrim(file_name)) not between 1 and 255 then raise exception 'Invalid file' using errcode='23514'; end if;
 if not exists(select 1 from storage.objects where bucket_id='payable-documents' and name=file_path and owner_id=auth.uid()::text and (metadata->>'size')::bigint=file_size and metadata->>'mimetype'=file_mime) then raise exception 'Upload not found' using errcode='23514'; end if;
 insert into public.payable_files(organization_id,group_id,storage_path,original_name,mime_type,size_bytes,uploaded_by) values(org_id,target_group_id,file_path,file_name,file_mime,file_size,auth.uid()) returning id into created_id;
 insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,after_data) values(org_id,auth.uid(),'payables',target_group_id,'file_attached',jsonb_build_object('file_id',created_id,'name',file_name));
 return created_id;
end; $$;
revoke all on function public.register_payable_file(uuid,uuid,text,text,text,bigint) from public,anon;
grant execute on function public.register_payable_file(uuid,uuid,text,text,text,bigint) to authenticated;

create function private.protect_payable_files() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.payable_files f where f.organization_id=old.organization_id and f.group_id=old.group_id) and not exists(select 1 from public.payables p where p.organization_id=old.organization_id and p.group_id=old.group_id) then
 raise exception 'Esta conta possui anexos. Preserve ao menos uma parcela para manter o histórico.' using errcode='23514'; end if;
 return null;
end; $$;
revoke all on function private.protect_payable_files() from public,anon,authenticated;
create constraint trigger protect_payable_files after delete on public.payables deferrable initially deferred for each row execute function private.protect_payable_files();

