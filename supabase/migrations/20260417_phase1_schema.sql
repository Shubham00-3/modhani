create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text unique not null,
  full_name text not null,
  initials text not null,
  role text not null,
  fulfil_orders boolean not null default false,
  override_prices boolean not null default false,
  manage_settings boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.clients (
  id text primary key,
  name text not null,
  location_count integer not null default 0,
  email_packing_slip boolean not null default false,
  email_invoice boolean not null default false,
  delivery_method text not null default 'email',
  packing_slip_email text,
  invoice_email text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.locations (
  id text primary key,
  client_id text not null references public.clients (id) on delete cascade,
  code text,
  city text,
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.products (
  id text primary key,
  name text not null,
  unit_size text not null,
  category text,
  base_catalogue_price numeric(12, 2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.client_product_prices (
  id text primary key,
  client_id text not null references public.clients (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade,
  price numeric(12, 2) not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (client_id, product_id)
);

create table if not exists public.batches (
  id text primary key,
  batch_number text not null unique,
  product_id text not null references public.products (id) on delete cascade,
  production_date date not null,
  qty_produced numeric(12, 2) not null,
  qty_remaining numeric(12, 2) not null,
  status text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.orders (
  id text primary key,
  order_number integer not null unique,
  client_id text not null references public.clients (id) on delete restrict,
  location_id text not null references public.locations (id) on delete restrict,
  source text not null,
  status text not null,
  locked_by uuid references public.profiles (user_id) on delete set null,
  locked_at timestamptz,
  invoice_number text,
  invoice_total numeric(12, 2),
  qb_invoice_number text,
  qb_sync_status text,
  packing_slip_number text,
  created_at timestamptz not null,
  fulfilled_at timestamptz,
  invoiced_at timestamptz,
  qb_synced_at timestamptz,
  shipped_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  packing_slip_sent_at timestamptz,
  invoice_email_sent_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.order_items (
  id text primary key,
  order_id text not null references public.orders (id) on delete cascade,
  product_id text not null references public.products (id) on delete restrict,
  quantity numeric(12, 2) not null,
  fulfilled_qty numeric(12, 2) not null default 0,
  base_price numeric(12, 2) not null,
  client_price numeric(12, 2) not null,
  override_price numeric(12, 2),
  override_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.batch_assignments (
  id text primary key,
  order_item_id text not null references public.order_items (id) on delete cascade,
  batch_id text not null references public.batches (id) on delete restrict,
  qty numeric(12, 2) not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_events (
  id text primary key,
  timestamp timestamptz not null,
  action text not null,
  order_id text references public.orders (id) on delete set null,
  client_id text references public.clients (id) on delete set null,
  user_id uuid references public.profiles (user_id) on delete set null,
  user_name text not null,
  details text not null,
  previous_value text,
  new_value text
);

create table if not exists public.quickbooks_settings (
  id text primary key default 'singleton',
  connected boolean not null default false,
  company_name text not null,
  connector_name text not null,
  status text not null,
  last_sync_at timestamptz,
  next_invoice_sequence integer not null default 1,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_locations_client_id on public.locations (client_id);
create index if not exists idx_batches_product_id on public.batches (product_id);
create index if not exists idx_batches_production_date on public.batches (production_date);
create index if not exists idx_orders_client_id on public.orders (client_id);
create index if not exists idx_orders_location_id on public.orders (location_id);
create index if not exists idx_orders_status on public.orders (status);
create index if not exists idx_orders_created_at on public.orders (created_at desc);
create index if not exists idx_order_items_order_id on public.order_items (order_id);
create index if not exists idx_order_items_product_id on public.order_items (product_id);
create index if not exists idx_batch_assignments_order_item_id on public.batch_assignments (order_item_id);
create index if not exists idx_batch_assignments_batch_id on public.batch_assignments (batch_id);
create index if not exists idx_audit_events_order_id on public.audit_events (order_id);
create index if not exists idx_audit_events_client_id on public.audit_events (client_id);
create index if not exists idx_audit_events_user_id on public.audit_events (user_id);
create index if not exists idx_audit_events_timestamp on public.audit_events (timestamp desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_clients_updated_at on public.clients;
create trigger set_clients_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

drop trigger if exists set_locations_updated_at on public.locations;
create trigger set_locations_updated_at
before update on public.locations
for each row execute function public.set_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists set_client_product_prices_updated_at on public.client_product_prices;
create trigger set_client_product_prices_updated_at
before update on public.client_product_prices
for each row execute function public.set_updated_at();

drop trigger if exists set_batches_updated_at on public.batches;
create trigger set_batches_updated_at
before update on public.batches
for each row execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists set_order_items_updated_at on public.order_items;
create trigger set_order_items_updated_at
before update on public.order_items
for each row execute function public.set_updated_at();

drop trigger if exists set_quickbooks_settings_updated_at on public.quickbooks_settings;
create trigger set_quickbooks_settings_updated_at
before update on public.quickbooks_settings
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.locations enable row level security;
alter table public.products enable row level security;
alter table public.client_product_prices enable row level security;
alter table public.batches enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.batch_assignments enable row level security;
alter table public.audit_events enable row level security;
alter table public.quickbooks_settings enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles
for select to authenticated using (true);

drop policy if exists "profiles_update_authenticated" on public.profiles;
create policy "profiles_update_authenticated" on public.profiles
for update to authenticated using (true) with check (true);

drop policy if exists "clients_all_authenticated" on public.clients;
create policy "clients_all_authenticated" on public.clients
for all to authenticated using (true) with check (true);

drop policy if exists "locations_all_authenticated" on public.locations;
create policy "locations_all_authenticated" on public.locations
for all to authenticated using (true) with check (true);

drop policy if exists "products_all_authenticated" on public.products;
create policy "products_all_authenticated" on public.products
for all to authenticated using (true) with check (true);

drop policy if exists "client_product_prices_all_authenticated" on public.client_product_prices;
create policy "client_product_prices_all_authenticated" on public.client_product_prices
for all to authenticated using (true) with check (true);

drop policy if exists "batches_all_authenticated" on public.batches;
create policy "batches_all_authenticated" on public.batches
for all to authenticated using (true) with check (true);

drop policy if exists "orders_all_authenticated" on public.orders;
create policy "orders_all_authenticated" on public.orders
for all to authenticated using (true) with check (true);

drop policy if exists "order_items_all_authenticated" on public.order_items;
create policy "order_items_all_authenticated" on public.order_items
for all to authenticated using (true) with check (true);

drop policy if exists "batch_assignments_all_authenticated" on public.batch_assignments;
create policy "batch_assignments_all_authenticated" on public.batch_assignments
for all to authenticated using (true) with check (true);

drop policy if exists "audit_events_select_authenticated" on public.audit_events;
create policy "audit_events_select_authenticated" on public.audit_events
for select to authenticated using (true);

drop policy if exists "audit_events_insert_authenticated" on public.audit_events;
create policy "audit_events_insert_authenticated" on public.audit_events
for insert to authenticated with check (true);

drop policy if exists "quickbooks_settings_all_authenticated" on public.quickbooks_settings;
create policy "quickbooks_settings_all_authenticated" on public.quickbooks_settings
for all to authenticated using (true) with check (true);
