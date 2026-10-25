-- Isolated transaction: PostgreSQL must commit a new enum value before use.
alter type public.budget_status add value if not exists 'no_response';
