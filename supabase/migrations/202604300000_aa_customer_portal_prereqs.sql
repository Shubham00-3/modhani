-- Prerequisites for the 20260430 customer portal migrations.
-- The original same-day files are ordered alphabetically by the CLI; this
-- keeps the required column/table/functions available before they are used.

alter table public.client_product_prices
  add column if not exists is_active boolean not null default false;

create table if not exists public.customer_contacts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text unique not null,
  full_name text not null,
  client_id text references public.clients (id) on delete set null,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customer_contacts_status_check check (status in ('pending', 'active', 'disabled'))
);

alter table public.customer_contacts
  alter column client_id drop not null,
  alter column status set default 'pending';

alter table public.customer_contacts
  drop constraint if exists customer_contacts_status_check;

alter table public.customer_contacts
  add constraint customer_contacts_status_check
  check (status in ('pending', 'active', 'disabled'));

drop trigger if exists set_customer_contacts_updated_at on public.customer_contacts;
create trigger set_customer_contacts_updated_at
before update on public.customer_contacts
for each row execute function public.set_updated_at();

alter table public.customer_contacts enable row level security;

create or replace function public.modhanios_customer_portal_is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
  );
$$;

create or replace function public.modhanios_active_customer_client_id()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select client_id
  from public.customer_contacts
  where user_id = auth.uid()
    and status = 'active'
    and client_id is not null
  limit 1;
$$;
