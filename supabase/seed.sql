insert into public.organizations(name,slug) values('Fábrika Kriativa','fabrika-kriativa') on conflict(slug) do nothing;

-- Execute depois do primeiro login, substituindo o e-mail:
-- insert into public.memberships(organization_id,user_id,role)
-- select o.id,p.id,'admin' from public.organizations o join public.profiles p on p.email='seu-email@gmail.com'
-- where o.slug='fabrika-kriativa' on conflict do nothing;

insert into public.item_families(organization_id,code,name,form_key)
select o.id,v.code,v.name,v.form_key from public.organizations o cross join (values
 ('CORTINA','Cortina','curtain'),('PERSIANA','Persiana','blind'),('PAPEL_PAREDE','Papel de parede','wallpaper'),
 ('CABECEIRA','Cabeceira','headboard'),('CONFECCAO','Confecção','confection'),
 ('REFORMA_ESTOFADO','Reforma de estofados','upholstery'),('DIVERSOS','Diversos','custom')
) as v(code,name,form_key) where o.slug='fabrika-kriativa' on conflict(organization_id,code) do nothing;
