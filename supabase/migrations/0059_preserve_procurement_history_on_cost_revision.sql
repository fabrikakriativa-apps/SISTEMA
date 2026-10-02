-- A cancelled order keeps its procurement history. When its originating budget
-- is revised, the old cost lines can be replaced without deleting that history.
alter table public.procurement_needs
  drop constraint if exists procurement_needs_source_cost_line_id_fkey;

alter table public.procurement_needs
  add constraint procurement_needs_source_cost_line_id_fkey
  foreign key (source_cost_line_id)
  references public.item_cost_lines(id)
  on delete set null;
