ALTER TABLE public.supplies ALTER COLUMN search_text SET EXPRESSION AS (
 regexp_replace(normalize(lower(
  coalesce(code,'')||' '||coalesce(name,'')||' '||coalesce(category,'')||' '||
  coalesce(brand,'')||' '||coalesce(reference,'')||' '||coalesce(purchase_unit,'')||' '||coalesce(usage_unit,'')||' '||coalesce(notes,'')||' '||
  coalesce(current_cost::text,'')||' '||replace(coalesce(current_cost::text,''),'.',',')||' R$ '||
  case when active then 'ativo' else 'inativo' end||' '||
  coalesce(jsonb_path_query_array(import_details,'$.*')::text,'')
 ),NFD),U&'[\0300-\036f]','','g')
);
ANALYZE public.supplies;
