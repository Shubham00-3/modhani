alter table public.clients
  add column if not exists qb_customer_name text,
  add column if not exists qb_mapping_status text not null default 'ready';

alter table public.products
  add column if not exists qb_item_name text,
  add column if not exists qb_mapping_status text not null default 'ready';

alter table public.locations
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists province text,
  add column if not exists postal_code text,
  add column if not exists country text not null default 'Canada',
  add column if not exists qb_ship_to_name text,
  add column if not exists qb_mapping_status text not null default 'needs_address';

alter table public.quickbooks_settings
  add column if not exists connector_last_seen_at timestamptz,
  add column if not exists failed_sync_count integer not null default 0;

create table if not exists public.quickbooks_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders (id) on delete cascade,
  job_type text not null default 'invoice',
  status text not null default 'pending',
  request_xml text,
  response_xml text,
  qb_txn_id text,
  qb_invoice_number text,
  error_message text,
  attempts integer not null default 0,
  locked_by_ticket text,
  locked_at timestamptz,
  created_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint quickbooks_sync_jobs_status_check check (status in ('pending', 'syncing', 'pushed', 'failed')),
  constraint quickbooks_sync_jobs_job_type_check check (job_type in ('invoice'))
);

create unique index if not exists idx_qb_jobs_one_open_invoice_per_order
on public.quickbooks_sync_jobs (order_id, job_type)
where status in ('pending', 'syncing', 'failed');

create index if not exists idx_qb_jobs_status_created_at
on public.quickbooks_sync_jobs (status, created_at);

create table if not exists public.quickbooks_sync_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.quickbooks_sync_jobs (id) on delete cascade,
  status text not null,
  request_xml text,
  response_xml text,
  error_message text,
  created_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_quickbooks_sync_jobs_updated_at on public.quickbooks_sync_jobs;
create trigger set_quickbooks_sync_jobs_updated_at
before update on public.quickbooks_sync_jobs
for each row execute function public.set_updated_at();

alter table public.quickbooks_sync_jobs enable row level security;
alter table public.quickbooks_sync_attempts enable row level security;

drop policy if exists "quickbooks_sync_jobs_select_authenticated" on public.quickbooks_sync_jobs;
create policy "quickbooks_sync_jobs_select_authenticated" on public.quickbooks_sync_jobs
for select to authenticated using (true);

drop policy if exists "quickbooks_sync_attempts_select_authenticated" on public.quickbooks_sync_attempts;
create policy "quickbooks_sync_attempts_select_authenticated" on public.quickbooks_sync_attempts
for select to authenticated using (true);

create or replace function public.modhanios_require_qb_invoice_ready(p_order_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_client public.clients%rowtype;
  v_location public.locations%rowtype;
  v_missing_product text;
begin
  select * into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.invoice_number is null then
    raise exception 'Invoice must exist before queueing QuickBooks sync.';
  end if;

  if v_order.qb_sync_status = 'pushed' then
    raise exception 'Invoice is already pushed to QuickBooks.';
  end if;

  select * into v_client
  from public.clients
  where id = v_order.client_id;

  if not found or nullif(btrim(coalesce(v_client.qb_customer_name, v_client.name)), '') is null then
    raise exception 'Client is missing a QuickBooks customer name.';
  end if;

  select * into v_location
  from public.locations
  where id = v_order.location_id;

  if not found then
    raise exception 'Location not found.';
  end if;

  if nullif(btrim(coalesce(v_location.address_line1, '')), '') is null
    or nullif(btrim(coalesce(v_location.city, '')), '') is null
    or nullif(btrim(coalesce(v_location.province, '')), '') is null
    or nullif(btrim(coalesce(v_location.postal_code, '')), '') is null then
    raise exception 'Location needs full Ship-To address before QuickBooks sync.';
  end if;

  select public.products.name into v_missing_product
  from public.order_items
  join public.products on products.id = order_items.product_id
  where order_items.order_id = p_order_id
    and order_items.fulfilled_qty > 0
    and nullif(btrim(coalesce(public.products.qb_item_name, public.products.name)), '') is null
  limit 1;

  if v_missing_product is not null then
    raise exception 'Product % is missing a QuickBooks item name.', v_missing_product;
  end if;
end;
$$;

create or replace function public.modhanios_queue_qb_invoice(
  p_order_id text,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_order public.orders%rowtype;
  v_job_id uuid;
begin
  select * into v_profile
  from public.profiles
  where user_id = p_user_id;

  if not found then
    raise exception 'User profile not found.';
  end if;

  perform public.modhanios_require_qb_invoice_ready(p_order_id);

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  insert into public.quickbooks_sync_jobs (order_id, job_type, status, created_by)
  values (p_order_id, 'invoice', 'pending', p_user_id)
  on conflict (order_id, job_type) where status in ('pending', 'syncing', 'failed')
  do update set
    status = 'pending',
    error_message = null,
    locked_by_ticket = null,
    locked_at = null,
    updated_at = timezone('utc', now())
  returning id into v_job_id;

  update public.orders
  set qb_sync_status = 'pending'
  where id = p_order_id;

  perform public.modhanios_insert_audit(
    'qb_sync_queued',
    v_order.id,
    v_order.client_id,
    p_user_id,
    v_profile.full_name,
    format('Invoice %s queued for QuickBooks Desktop sync', v_order.invoice_number),
    coalesce(v_order.qb_sync_status, 'not queued'),
    'pending'
  );

  return v_job_id;
end;
$$;

drop function if exists public.modhanios_upsert_client(uuid, text, text, integer, text, boolean, boolean, text, text);
create or replace function public.modhanios_upsert_client(
  p_user_id uuid,
  p_id text,
  p_name text,
  p_location_count integer,
  p_delivery_method text,
  p_email_packing_slip boolean,
  p_email_invoice boolean,
  p_packing_slip_email text,
  p_invoice_email text,
  p_qb_customer_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.modhanios_can_manage_settings(p_user_id) then
    raise exception 'This user cannot manage settings.';
  end if;

  insert into public.clients (
    id,
    name,
    location_count,
    delivery_method,
    email_packing_slip,
    email_invoice,
    packing_slip_email,
    invoice_email,
    qb_customer_name,
    qb_mapping_status
  )
  values (
    p_id,
    btrim(p_name),
    greatest(coalesce(p_location_count, 0), 0),
    coalesce(nullif(btrim(p_delivery_method), ''), 'email'),
    coalesce(p_email_packing_slip, false),
    coalesce(p_email_invoice, false),
    nullif(btrim(coalesce(p_packing_slip_email, '')), ''),
    nullif(btrim(coalesce(p_invoice_email, '')), ''),
    nullif(btrim(coalesce(p_qb_customer_name, p_name)), ''),
    'ready'
  )
  on conflict (id) do update set
    name = excluded.name,
    location_count = excluded.location_count,
    delivery_method = excluded.delivery_method,
    email_packing_slip = excluded.email_packing_slip,
    email_invoice = excluded.email_invoice,
    packing_slip_email = excluded.packing_slip_email,
    invoice_email = excluded.invoice_email,
    qb_customer_name = excluded.qb_customer_name,
    qb_mapping_status = excluded.qb_mapping_status;
end;
$$;

drop function if exists public.modhanios_upsert_location(uuid, text, text, text, text, text);
create or replace function public.modhanios_upsert_location(
  p_user_id uuid,
  p_id text,
  p_client_id text,
  p_code text,
  p_city text,
  p_name text,
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_province text default null,
  p_postal_code text default null,
  p_country text default 'Canada',
  p_qb_ship_to_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.modhanios_can_manage_settings(p_user_id) then
    raise exception 'This user cannot manage settings.';
  end if;

  v_status := case
    when nullif(btrim(coalesce(p_address_line1, '')), '') is not null
      and nullif(btrim(coalesce(p_city, '')), '') is not null
      and nullif(btrim(coalesce(p_province, '')), '') is not null
      and nullif(btrim(coalesce(p_postal_code, '')), '') is not null
    then 'ready'
    else 'needs_address'
  end;

  insert into public.locations (
    id,
    client_id,
    code,
    city,
    name,
    address_line1,
    address_line2,
    province,
    postal_code,
    country,
    qb_ship_to_name,
    qb_mapping_status
  )
  values (
    p_id,
    p_client_id,
    nullif(btrim(coalesce(p_code, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    btrim(p_name),
    nullif(btrim(coalesce(p_address_line1, '')), ''),
    nullif(btrim(coalesce(p_address_line2, '')), ''),
    nullif(btrim(coalesce(p_province, '')), ''),
    nullif(btrim(coalesce(p_postal_code, '')), ''),
    coalesce(nullif(btrim(p_country), ''), 'Canada'),
    nullif(btrim(coalesce(p_qb_ship_to_name, p_name)), ''),
    v_status
  )
  on conflict (id) do update set
    client_id = excluded.client_id,
    code = excluded.code,
    city = excluded.city,
    name = excluded.name,
    address_line1 = excluded.address_line1,
    address_line2 = excluded.address_line2,
    province = excluded.province,
    postal_code = excluded.postal_code,
    country = excluded.country,
    qb_ship_to_name = excluded.qb_ship_to_name,
    qb_mapping_status = excluded.qb_mapping_status;
end;
$$;

drop function if exists public.modhanios_upsert_product(uuid, text, text, text, text, numeric);
create or replace function public.modhanios_upsert_product(
  p_user_id uuid,
  p_id text,
  p_name text,
  p_unit_size text,
  p_category text,
  p_base_catalogue_price numeric,
  p_qb_item_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.modhanios_can_manage_settings(p_user_id) then
    raise exception 'This user cannot manage settings.';
  end if;

  insert into public.products (
    id,
    name,
    unit_size,
    category,
    base_catalogue_price,
    qb_item_name,
    qb_mapping_status
  )
  values (
    p_id,
    btrim(p_name),
    btrim(p_unit_size),
    nullif(btrim(coalesce(p_category, '')), ''),
    greatest(coalesce(p_base_catalogue_price, 0), 0),
    nullif(btrim(coalesce(p_qb_item_name, concat_ws(' ', p_name, p_unit_size))), ''),
    'ready'
  )
  on conflict (id) do update set
    name = excluded.name,
    unit_size = excluded.unit_size,
    category = excluded.category,
    base_catalogue_price = excluded.base_catalogue_price,
    qb_item_name = excluded.qb_item_name,
    qb_mapping_status = excluded.qb_mapping_status;
end;
$$;

revoke all on function public.modhanios_queue_qb_invoice(text, uuid) from public;
revoke all on function public.modhanios_require_qb_invoice_ready(text) from public;
revoke all on function public.modhanios_upsert_client(uuid, text, text, integer, text, boolean, boolean, text, text, text) from public;
revoke all on function public.modhanios_upsert_location(uuid, text, text, text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.modhanios_upsert_product(uuid, text, text, text, text, numeric, text) from public;
grant execute on function public.modhanios_queue_qb_invoice(text, uuid) to authenticated;
grant execute on function public.modhanios_upsert_client(uuid, text, text, integer, text, boolean, boolean, text, text, text) to authenticated;
grant execute on function public.modhanios_upsert_location(uuid, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.modhanios_upsert_product(uuid, text, text, text, text, numeric, text) to authenticated;
