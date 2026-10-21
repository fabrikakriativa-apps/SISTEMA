alter function public.list_sales_assignees(uuid) set schema private;
create function public.list_sales_assignees(org_id uuid) returns table(user_id uuid,full_name text) language sql security invoker set search_path='' as $$ select * from private.list_sales_assignees(org_id); $$;
revoke all on function public.list_sales_assignees(uuid) from public,anon;
grant execute on function public.list_sales_assignees(uuid) to authenticated;

