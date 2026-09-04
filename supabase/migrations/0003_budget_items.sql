begin;

insert into public.item_families(organization_id,code,name,form_key)
select o.id,v.code,v.name,v.form_key
from public.organizations o
cross join (values
  ('curtain','Cortina','curtain'),
  ('blind','Persiana','blind')
) as v(code,name,form_key)
on conflict(organization_id,code) do nothing;

create index if not exists budget_items_budget_position_idx
  on public.budget_items(budget_id,position);

grant select on public.item_families,public.budget_items to authenticated;
grant insert(organization_id,budget_id,family_id,position,presentation,group_name,environment,description,internal_notes,quantity,configuration,cost_total,margin_percent,sale_total,affects_total)
  on public.budget_items to authenticated;
grant update(family_id,position,presentation,group_name,environment,description,internal_notes,quantity,configuration,cost_total,margin_percent,sale_total,affects_total)
  on public.budget_items to authenticated;
grant delete on public.budget_items to authenticated;

create policy "item family member read" on public.item_families for select to authenticated
using((select private.has_org_role(organization_id,array['admin','comercial','compras','financeiro','operacao']::public.app_role[])));

create policy "budget item member read" on public.budget_items for select to authenticated
using((select private.has_org_role(organization_id,array['admin','comercial','compras','financeiro','operacao']::public.app_role[])));

create policy "budget item commercial insert" on public.budget_items for insert to authenticated
with check(
  (select private.has_org_role(organization_id,array['admin','comercial']::public.app_role[]))
  and exists(select 1 from public.budgets b where b.id=budget_id and b.organization_id=organization_id and b.status='draft')
);

create policy "budget item commercial update" on public.budget_items for update to authenticated
using((select private.has_org_role(organization_id,array['admin','comercial']::public.app_role[])))
with check(
  (select private.has_org_role(organization_id,array['admin','comercial']::public.app_role[]))
  and exists(select 1 from public.budgets b where b.id=budget_id and b.organization_id=organization_id and b.status='draft')
);

create policy "budget item commercial delete" on public.budget_items for delete to authenticated
using(
  (select private.has_org_role(organization_id,array['admin','comercial']::public.app_role[]))
  and exists(select 1 from public.budgets b where b.id=budget_id and b.organization_id=organization_id and b.status='draft')
);

create function private.guard_budget_item() returns trigger language plpgsql set search_path='' as $$
declare b public.budgets;
begin
  if tg_op='UPDATE' then
    if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id or new.budget_id is distinct from old.budget_id then
      raise exception 'Item identity, organization and budget cannot change' using errcode='23514';
    end if;
    new.created_at:=old.created_at;
  else
    new.created_at:=now();
  end if;
  select * into b from public.budgets where id=new.budget_id;
  if b.id is null or b.organization_id<>new.organization_id or b.status<>'draft' then
    raise exception 'Items can only be changed in an organization draft' using errcode='23514';
  end if;
  if new.family_id is not null and not exists(select 1 from public.item_families f where f.id=new.family_id and f.organization_id=new.organization_id and f.active) then
    raise exception 'Invalid item family' using errcode='23514';
  end if;
  new.position:=greatest(1,new.position);
  new.quantity:=greatest(0.001,new.quantity);
  new.cost_total:=greatest(0,new.cost_total);
  new.sale_total:=greatest(0,new.sale_total);
  new.updated_at:=now();
  return new;
end $$;
revoke all on function private.guard_budget_item() from public,anon,authenticated;

create function private.recalculate_budget_from_items() returns trigger language plpgsql security definer set search_path='' as $$
declare target_budget uuid; target_org uuid;
begin
  target_budget:=coalesce(new.budget_id,old.budget_id);
  target_org:=coalesce(new.organization_id,old.organization_id);
  update public.budgets b set
    subtotal=coalesce((select round(sum(i.sale_total),2) from public.budget_items i where i.budget_id=target_budget and i.affects_total),0),
    total=greatest(0,coalesce((select round(sum(i.sale_total),2) from public.budget_items i where i.budget_id=target_budget and i.affects_total),0)-b.discount),
    updated_at=now()
  where b.id=target_budget and b.organization_id=target_org;
  return null;
end $$;
revoke all on function private.recalculate_budget_from_items() from public,anon,authenticated;

create trigger budget_items_guard before insert or update on public.budget_items
for each row execute function private.guard_budget_item();
create trigger budget_items_recalculate after insert or update or delete on public.budget_items
for each row execute function private.recalculate_budget_from_items();

commit;
