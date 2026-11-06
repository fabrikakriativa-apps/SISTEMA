alter table public.supplies add column search_text text generated always as (
 regexp_replace(normalize(lower(coalesce(code,'')||' '||coalesce(name,'')||' '||coalesce(category,'')),NFD),U&'[\0300-\036f]','','g')
) stored;