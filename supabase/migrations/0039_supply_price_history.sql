-- Keep a dedicated, readable cost history for catalog supplies. Budget item
-- cost lines remain snapshots and are never recalculated from this history.
grant select on public.supply_price_history to authenticated;

drop policy if exists "supply price history member read" on public.supply_price_history;
create policy "supply price history member read" on public.supply_price_history
for select to authenticated
using(private.has_org_role(organization_id,array['admin','comercial','compras','financeiro','operacao']::public.app_role[]));

create or replace function private.capture_supply_cost_history()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op='INSERT' then
    insert into public.supply_price_history(organization_id,supply_id,value,effective_at,source,created_by)
    values(new.organization_id,new.id,new.current_cost,current_date,'Custo informado no cadastro',auth.uid());
  elsif new.current_cost is distinct from old.current_cost then
    insert into public.supply_price_history(organization_id,supply_id,value,effective_at,source,created_by)
    values(new.organization_id,new.id,new.current_cost,current_date,'Custo atualizado no cadastro',auth.uid());
  end if;
  return new;
end;
$$;

revoke all on function private.capture_supply_cost_history() from public,anon,authenticated;

drop trigger if exists supplies_cost_history on public.supplies;
create trigger supplies_cost_history
after insert or update of current_cost on public.supplies
for each row execute function private.capture_supply_cost_history();

-- Existing catalog records receive a starting point, without inventing an
-- earlier effective date. Future changes are appended by the trigger above.
insert into public.supply_price_history(organization_id,supply_id,value,effective_at,source)
select s.organization_id,s.id,s.current_cost,current_date,'Custo vigente no início do histórico'
from public.supplies s
where not exists (
  select 1 from public.supply_price_history h where h.supply_id=s.id
);
