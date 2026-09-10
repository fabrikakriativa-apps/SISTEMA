-- The commercial catalog starts deliberately small. Details belong in the
-- item description until a real recurring need justifies a specific field.
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

-- Preserve any historic standalone Cabeceira by moving it under Confecção.
update public.budget_items b
set family_id=confection.id,
    configuration=jsonb_set(coalesce(b.configuration,'{}'::jsonb),'{confection_subitem}','"Cabeceira"'::jsonb,true)
from public.item_families previous
join public.item_families confection
  on confection.organization_id=previous.organization_id and confection.code='confection'
where b.family_id=previous.id
  and (previous.code='headboard' or lower(previous.name)='cabeceira');

-- Old standalone families remain in historical records but are not available
-- for new items. Cabeceira is now a subitem of Confecção.
update public.item_families
set active=false
where (code in ('headboard','misc','diverse') or lower(name) in ('cabeceira','diversos'))
  and code not in ('confection');
