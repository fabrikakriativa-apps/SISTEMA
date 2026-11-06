
create table public.finance_banks (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 name text not null check(length(btrim(name)) between 1 and 100),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(organization_id,id)
);
create unique index finance_banks_org_name on public.finance_banks(organization_id,lower(btrim(name)));
alter table public.finance_banks enable row level security;
revoke all on public.finance_banks from anon,authenticated;
grant select,insert,update on public.finance_banks to authenticated;
create policy finance_banks_read on public.finance_banks for select to authenticated using(private.has_org_role(organization_id,array['admin','financeiro']::public.app_role[]));
create policy finance_banks_insert on public.finance_banks for insert to authenticated with check(private.has_org_role(organization_id,array['admin','financeiro']::public.app_role[]));
create policy finance_banks_update on public.finance_banks for update to authenticated using(private.has_org_role(organization_id,array['admin','financeiro']::public.app_role[])) with check(private.has_org_role(organization_id,array['admin','financeiro']::public.app_role[]));

create table public.bank_cash_entries (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 bank_id uuid not null,
 receivable_id uuid references public.receivables(id),
 payable_id uuid references public.payables(id),
 amount numeric(14,2) not null check(amount>0),
 direction text not null check(direction in ('in','out')),
 movement_date date not null,
 created_at timestamptz not null default now(),
 actor_id uuid not null,
 reversed_at timestamptz,
 check((receivable_id is not null and payable_id is null and direction='in') or (payable_id is not null and receivable_id is null and direction='out')),
 foreign key(organization_id,bank_id) references public.finance_banks(organization_id,id)
);
create index bank_cash_entries_org_bank_date on public.bank_cash_entries(organization_id,bank_id,movement_date);
create index bank_cash_entries_receivable on public.bank_cash_entries(receivable_id) where receivable_id is not null;
create index bank_cash_entries_payable on public.bank_cash_entries(payable_id) where payable_id is not null;
alter table public.bank_cash_entries enable row level security;
revoke all on public.bank_cash_entries from anon,authenticated;
grant select on public.bank_cash_entries to authenticated;
create policy bank_cash_entries_read on public.bank_cash_entries for select to authenticated using(private.has_org_role(organization_id,array['admin','financeiro']::public.app_role[]));

-- Private trigger writes an immutable financial link; clients have no ledger write permission.
create function private.capture_bank_cash_entry() returns trigger language plpgsql security definer set search_path='' as $$
declare chosen uuid; day date;
begin
 if new.paid_amount=old.paid_amount then return new; end if;
 if new.paid_amount<old.paid_amount then
   if new.paid_amount=0 then
     update public.bank_cash_entries set reversed_at=now()
     where organization_id=new.organization_id and reversed_at is null and
       (case when tg_table_name='receivables' then receivable_id=new.id else payable_id=new.id end);
   end if;
   return new;
 end if;
 chosen:=nullif(current_setting('app.payment_bank_id',true),'')::uuid;
 if chosen is null then return new; end if; -- Legacy flows remain unchanged and unassigned.
 if auth.uid() is null or not private.has_org_role(new.organization_id,array['admin','financeiro']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 if not exists(select 1 from public.finance_banks where id=chosen and organization_id=new.organization_id and active) then raise exception 'Invalid bank' using errcode='23514'; end if;
 day:=nullif(current_setting('app.payment_bank_date',true),'')::date;
 if day is null then raise exception 'Payment date required' using errcode='23514'; end if;
 insert into public.bank_cash_entries(organization_id,bank_id,receivable_id,payable_id,amount,direction,movement_date,actor_id)
 values(new.organization_id,chosen,case when tg_table_name='receivables' then new.id end,case when tg_table_name='payables' then new.id end,round(new.paid_amount-old.paid_amount,2),case when tg_table_name='receivables' then 'in' else 'out' end,day,auth.uid());
 return new;
end; $$;
revoke all on function private.capture_bank_cash_entry() from public,anon,authenticated;
create trigger capture_receivable_bank after update of paid_amount on public.receivables for each row execute function private.capture_bank_cash_entry();
create trigger capture_payable_bank after update of paid_amount on public.payables for each row execute function private.capture_bank_cash_entry();

create function public.register_receivable_payment_with_bank(org_id uuid,target_receivable_id uuid,payment_scope text,payment_amount numeric,payment_date date,payment_bank_id uuid)
returns setof public.receivables language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','financeiro']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 if payment_bank_id is null or not exists(select 1 from public.finance_banks where id=payment_bank_id and organization_id=org_id and active) then raise exception 'Choose bank' using errcode='23514'; end if;
 perform set_config('app.payment_bank_id',payment_bank_id::text,true);
 perform set_config('app.payment_bank_date',payment_date::text,true);
 return query select * from public.register_receivable_payment(org_id,target_receivable_id,payment_scope,payment_amount,payment_date);
 perform set_config('app.payment_bank_id','',true);
 perform set_config('app.payment_bank_date','',true);
end; $$;
create function public.register_payable_payment_with_bank(org_id uuid,target_payable_id uuid,payment_scope text,payment_amount numeric,payment_date date,payment_bank_id uuid)
returns setof public.payables language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not private.has_org_role(org_id,array['admin','financeiro']::public.app_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
 if payment_bank_id is null or not exists(select 1 from public.finance_banks where id=payment_bank_id and organization_id=org_id and active) then raise exception 'Choose bank' using errcode='23514'; end if;
 perform set_config('app.payment_bank_id',payment_bank_id::text,true);
 perform set_config('app.payment_bank_date',payment_date::text,true);
 return query select * from public.register_payable_payment(org_id,target_payable_id,payment_scope,payment_amount,payment_date);
 perform set_config('app.payment_bank_id','',true);
 perform set_config('app.payment_bank_date','',true);
end; $$;
revoke all on function public.register_receivable_payment_with_bank(uuid,uuid,text,numeric,date,uuid),public.register_payable_payment_with_bank(uuid,uuid,text,numeric,date,uuid) from public,anon;
grant execute on function public.register_receivable_payment_with_bank(uuid,uuid,text,numeric,date,uuid),public.register_payable_payment_with_bank(uuid,uuid,text,numeric,date,uuid) to authenticated;
