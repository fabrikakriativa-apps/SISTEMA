alter table public.purchases
  add constraint purchases_status_valid
  check (status in ('draft','awaiting_delivery','delayed','completed','cancelled','returned'))
  not valid;

alter table public.purchases validate constraint purchases_status_valid;

alter table public.purchase_items
  add constraint purchase_items_status_valid
  check (status in ('ordered','received','cancelled','returned'))
  not valid;

alter table public.purchase_items validate constraint purchase_items_status_valid;

alter table public.calendar_events
  add constraint calendar_events_sync_status_valid
  check (sync_status in ('pending','synced','error'))
  not valid;

alter table public.calendar_events validate constraint calendar_events_sync_status_valid;

create index if not exists purchases_org_due_active_idx
  on public.purchases (organization_id, supplier_due_date)
  where status in ('awaiting_delivery','delayed') and supplier_due_date is not null;

create index if not exists receivables_org_due_open_idx
  on public.receivables (organization_id, due_date)
  where status in ('open','partial','overdue') and due_date is not null;

create index if not exists payables_org_due_open_idx
  on public.payables (organization_id, due_date)
  where status in ('open','partial','overdue') and due_date is not null;

create index if not exists calendar_events_org_sync_pending_idx
  on public.calendar_events (organization_id, sync_status)
  where sync_status in ('pending','error');
