-- Run inside BEGIN/ROLLBACK with the reviewed change; never keep fixtures.
select set_config('request.jwt.claim.sub','85bf0952-2dc8-4948-873a-97ffa45c159b',true);
do $$
declare org uuid; oi public.order_items; sid uuid; line_id uuid; aid uuid; need public.procurement_needs; denied boolean:=false; stage public.order_status;
begin
 select id into org from public.organizations where name='Fábrika Kriativa';
 select i.* into oi from public.order_items i join public.orders o on o.id=i.order_id where i.organization_id=org and o.status not in ('completed','cancelled') and i.status not in ('completed','cancelled') limit 1;
 assert oi.id is not null,'Active fixture item required';
 select status into stage from public.orders where id=oi.order_id;
 insert into public.supplies(organization_id,code,name,purchase_unit,usage_unit,current_cost) values(org,'TEST-'||gen_random_uuid(),'Temporary test material','m','m',10) returning id into sid;
 insert into public.item_cost_lines(organization_id,budget_item_id,kind,supply_id,description,quantity,unit,unit_cost) values(org,oi.budget_item_id,'supply',sid,'Temporary material',2,'m',10) returning id into line_id;
 perform private.seed_order_procurement_needs(org,oi.order_id);
 perform private.seed_order_procurement_needs(org,oi.order_id);
 assert (select count(*) from public.procurement_needs where order_item_id=oi.id and source_cost_line_id=line_id and kind='supply' and status='awaiting_purchase')=1,'Exactly one supply requirement';
 assert not exists(select 1 from public.procurement_needs where order_item_id=oi.id and kind='whole_item' and status in ('awaiting_finance','awaiting_purchase')),'No automatic whole-item requirements';
 select * into need from public.save_procurement_need(org,null,oi.id,null,'Manual material',3,'un',5,current_date,false);
 assert need.kind='supply','Manual material classification';
 perform public.save_procurement_need(org,need.id,oi.id,null,'Manual material',3,'un',5,current_date,true);
 assert (select status from public.procurement_needs where id=need.id)='cancelled','Manual removal';
 assert (select status from public.orders where id=oi.order_id)=stage,'Manual order status preserved';
 insert into public.attachments(organization_id,entity_type,entity_id,purpose,storage_path,original_name,mime_type,size_bytes,uploaded_by) values(org,'budget_item',oi.budget_item_id,'item_reference_photo','test/no-object','test.png','image/png',1,auth.uid()) returning id into aid;
 perform public.remove_document_attachment(org,aid);
 assert (select deleted_at is not null from public.attachments where id=aid),'Attachment removed';
 perform public.remove_document_attachment(org,aid);
 assert (select count(*) from public.audit_log where entity_type='attachments' and entity_id=aid and action='removed')=1,'Removal is idempotent';
 begin perform public.remove_document_attachment(gen_random_uuid(),aid); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Cross-organization removal rejected';
 assert not has_function_privilege('anon','public.remove_document_attachment(uuid,uuid)','execute'),'Anonymous execution revoked';
 assert has_function_privilege('authenticated','public.remove_document_attachment(uuid,uuid)','execute'),'Authenticated execution granted';
 perform set_config('request.jwt.claim.sub','',true); denied:=false;
 begin perform public.remove_document_attachment(org,aid); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Unauthenticated removal rejected';
end $$;
select 'shopping and attachment assertions passed' as result;
