-- Earlier setup work created the same commercial family with uppercase codes.
-- Consolidate references without deleting historical records.
with mapped as (
  select legacy.id as legacy_id,canonical.id as canonical_id,
    case when lower(legacy.name)='cabeceira' then true else false end as is_headboard
  from public.item_families legacy
  join public.item_families canonical on canonical.organization_id=legacy.organization_id
  where canonical.code in ('curtain','blind','confection','upholstery_reform','wallpaper')
    and legacy.id<>canonical.id
    and (
      (canonical.code='curtain' and lower(legacy.name)='cortina') or
      (canonical.code='blind' and lower(legacy.name)='persiana') or
      (canonical.code='confection' and lower(legacy.name) in ('confecção','cabeceira')) or
      (canonical.code='upholstery_reform' and lower(legacy.name)='reforma de estofados') or
      (canonical.code='wallpaper' and lower(legacy.name)='papel de parede')
    )
)
update public.budget_items b
set family_id=m.canonical_id,
    configuration=case when m.is_headboard then jsonb_set(coalesce(b.configuration,'{}'::jsonb),'{confection_subitem}','"Cabeceira"'::jsonb,true) else b.configuration end
from mapped m
where b.family_id=m.legacy_id;

update public.item_families legacy
set active=false
where legacy.code not in ('curtain','blind','confection','upholstery_reform','wallpaper')
  and exists (
    select 1 from public.item_families canonical
    where canonical.organization_id=legacy.organization_id
      and canonical.code in ('curtain','blind','confection','upholstery_reform','wallpaper')
      and (
        (canonical.code='curtain' and lower(legacy.name)='cortina') or
        (canonical.code='blind' and lower(legacy.name)='persiana') or
        (canonical.code='confection' and lower(legacy.name) in ('confecção','cabeceira')) or
        (canonical.code='upholstery_reform' and lower(legacy.name)='reforma de estofados') or
        (canonical.code='wallpaper' and lower(legacy.name)='papel de parede')
      )
  );
