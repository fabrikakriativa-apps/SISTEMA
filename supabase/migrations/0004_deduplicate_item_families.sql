begin;

delete from public.item_families f
where f.code in ('curtain','blind')
  and exists(
    select 1 from public.item_families canonical
    where canonical.organization_id=f.organization_id
      and canonical.form_key=f.form_key
      and canonical.id<>f.id
  )
  and not exists(select 1 from public.budget_items i where i.family_id=f.id);

commit;
