create function public.reorder_budget_items(org_id uuid,target_budget_id uuid,item_ids uuid[],expected_item_ids uuid[]) returns void
language plpgsql security invoker set search_path='' as $$
declare document_status public.budget_status; current_ids uuid[];
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501';end if;
 select status into document_status from public.budgets where id=target_budget_id and organization_id=org_id for update;
 if document_status is null or document_status<>'draft' then raise exception 'Somente itens de rascunhos podem ser reordenados' using errcode='23514';end if;
 select array_agg(id order by position,id) into current_ids from public.budget_items where budget_id=target_budget_id and organization_id=org_id;
 if item_ids is null or cardinality(item_ids) not between 1 and 1000 or cardinality(item_ids)<>coalesce(cardinality(current_ids),0) or (select count(distinct id) from unnest(item_ids) id)<>cardinality(item_ids) or exists(select 1 from unnest(item_ids) id where id is null or not(id=any(current_ids))) then raise exception 'A lista de itens mudou. Atualize o orçamento antes de ordenar.' using errcode='23514';end if;
 if current_ids=item_ids then return;end if;
 if current_ids is distinct from expected_item_ids then raise exception 'A ordem foi alterada em outra sessão. Atualize o orçamento.' using errcode='40001';end if;
 update public.budget_items i set position=ordered.position::integer from unnest(item_ids) with ordinality ordered(id,position) where i.id=ordered.id and i.organization_id=org_id and i.budget_id=target_budget_id and i.position is distinct from ordered.position::integer;
end $$;
revoke all on function public.reorder_budget_items(uuid,uuid,uuid[],uuid[]) from public,anon;
grant execute on function public.reorder_budget_items(uuid,uuid,uuid[],uuid[]) to authenticated;

