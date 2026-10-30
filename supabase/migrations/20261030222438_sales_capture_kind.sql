-- Additive attribution only. Existing campaigns/origins and CRM stages stay intact.
alter table public.sales_opportunities add column capture_kind text not null default 'unknown'
 constraint sales_opportunities_capture_kind_check check (capture_kind in ('unknown','organic','paid'));
comment on column public.sales_opportunities.capture_kind is 'Explicit acquisition attribution; legacy records remain unknown. Independent of channel, profile, commercial stage and customer lifecycle.';
grant select(capture_kind),insert(capture_kind),update(capture_kind) on public.sales_opportunities to authenticated;

