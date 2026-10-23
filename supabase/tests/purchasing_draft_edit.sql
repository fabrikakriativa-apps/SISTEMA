begin;

select set_config('request.jwt.claim.sub',(select user_id::text from public.memberships where active and role='admin' limit 1),true);
set local role authenticated;
do $test$
declare p public.purchases; lines jsonb; result uuid; 
begin
select * into p from public.purchases where organization_id in(select organization_id from public.memberships where user_id=auth.uid() and active) and status='draft' order by number limit 1;
if p.id is null then raise exception 'No draft fixture';end if;
select jsonb_agg(jsonb_build_object('id',id,'quantity',2,'unit_cost',12.34)) into lines from public.purchase_items where purchase_id=p.id;
result:=public.manage_purchasing(p.organization_id,p.id,'edit',jsonb_build_object('supplier_id',p.supplier_id,'formal_document',false,'lines',lines));
if (select total from public.purchases where id=p.id)<>jsonb_array_length(lines)*24.68 then raise exception 'Wrong total';end if;
if not (select workspace_managed from public.purchases where id=p.id) then raise exception 'Draft not adopted';end if;
if exists(select 1 from public.payables where purchase_id=p.id and status<>'cancelled') then raise exception 'Unexpected financial write';end if;
begin
perform public.manage_purchasing(p.organization_id,p.id,'edit',jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'quantity',1,'unit_cost',1))));
raise exception 'Accepted foreign line';
exception when raise_exception then if sqlerrm='Accepted foreign line' then raise;end if;end;
end $test$;
rollback;

