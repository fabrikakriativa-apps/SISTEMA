-- New independent type; shares the basic supplier-cost form used by curtain/blind.
insert into public.item_families(organization_id,code,name,form_key)
select organization_id,'decoration','Decoração','decoration'
from public.item_families where code='curtain' and active
on conflict(organization_id,code) do nothing;
