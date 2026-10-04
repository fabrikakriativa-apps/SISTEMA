begin;

-- Restore the structural catalog used by the budget item editor. These are
-- configuration records, not user-entered commercial data.
insert into public.item_families(organization_id,code,name,form_key)
select o.id,v.code,v.name,v.form_key
from public.organizations o
cross join (values
  ('curtain','Cortina','curtain'),
  ('blind','Persiana','blind'),
  ('confection','Confecção','confection'),
  ('upholstery_reform','Reforma de estofados','upholstery_reform'),
  ('wallpaper','Papel de parede','wallpaper')
) as v(code,name,form_key)
on conflict(organization_id,code) do update
set name=excluded.name,form_key=excluded.form_key,active=true;

create or replace function public.start_budget_revision(
  org_id uuid,
  target_budget_id uuid
)
returns public.budgets
language plpgsql
security definer
set search_path=''
as $$
declare
  target public.budgets;
  updated public.budgets;
begin
  if auth.uid() is null or not private.has_org_role(org_id,array['admin','comercial']::public.app_role[]) then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  select * into target
  from public.budgets
  where id=target_budget_id and organization_id=org_id
  for update;

  if target.id is null then
    raise exception 'Budget not found' using errcode='P0002';
  end if;
  if target.document_type <> 'budget' then
    raise exception 'Only budgets can be revised' using errcode='23514';
  end if;
  if target.status not in ('sent','rejected') then
    raise exception 'Only sent or rejected budgets can be revised' using errcode='23514';
  end if;

  -- Imported sent budgets may not yet have a version snapshot. Preserve the
  -- current document before opening the next editable revision.
  insert into public.budget_versions(organization_id,budget_id,revision,snapshot,created_by)
  values(
    org_id,
    target.id,
    target.current_revision,
    jsonb_build_object(
      'budget',to_jsonb(target),
      'items',coalesce((
        select jsonb_agg(to_jsonb(i) order by i.position)
        from public.budget_items i
        where i.budget_id=target.id and i.organization_id=org_id
      ),'[]'::jsonb),
      'item_payment_options',coalesce((
        select jsonb_agg(to_jsonb(o) order by o.budget_item_id,o.position)
        from public.budget_item_payment_options o
        where o.organization_id=org_id
          and o.budget_item_id in (
            select id from public.budget_items
            where budget_id=target.id and organization_id=org_id
          )
      ),'[]'::jsonb)
    ),
    auth.uid()
  )
  on conflict(budget_id,revision) do nothing;

  update public.budgets
  set status='draft',current_revision=current_revision+1,updated_at=now()
  where id=target.id and organization_id=org_id
  returning * into updated;

  insert into public.audit_log(
    organization_id,actor_id,entity_type,entity_id,action,before_data,after_data,reason
  ) values(
    org_id,auth.uid(),'budgets',target.id,'revision_started',to_jsonb(target),to_jsonb(updated),
    'Nova revisão criada para atualizar e reenviar o orçamento'
  );

  return updated;
end;
$$;

revoke all on function public.start_budget_revision(uuid,uuid) from public,anon;
grant execute on function public.start_budget_revision(uuid,uuid) to authenticated;

commit;
