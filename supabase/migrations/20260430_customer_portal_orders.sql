-- Customer portal login, approval, company catalogue, and order submission.

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

create or replace function public.modhanios_assert_manage_settings(
  p_user_id uuid
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Authenticated user mismatch.';
  end if;

  select * into v_profile
  from public.profiles
  where user_id = p_user_id;

  if not found or not v_profile.manage_settings then
    raise exception 'This user cannot manage settings.';
  end if;

  return v_profile;
end;
$$;

drop policy if exists "customer_contacts_select_scoped" on public.customer_contacts;
create policy "customer_contacts_select_scoped" on public.customer_contacts
for select to authenticated
using (public.modhanios_customer_portal_is_staff() or user_id = auth.uid());

drop policy if exists "customer_contacts_insert_own" on public.customer_contacts;
create policy "customer_contacts_insert_own" on public.customer_contacts
for insert to authenticated
with check (user_id = auth.uid() and status = 'pending' and client_id is null);

drop policy if exists "customer_contacts_update_scoped" on public.customer_contacts;
drop policy if exists "customer_contacts_update_staff" on public.customer_contacts;
create policy "customer_contacts_update_staff" on public.customer_contacts
for update to authenticated
using (public.modhanios_customer_portal_is_staff())
with check (public.modhanios_customer_portal_is_staff());

drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_select_scoped" on public.profiles;
create policy "profiles_select_scoped" on public.profiles
for select to authenticated
using (public.modhanios_customer_portal_is_staff() or user_id = auth.uid());

drop policy if exists "clients_select_authenticated" on public.clients;
drop policy if exists "clients_all_staff" on public.clients;
create policy "clients_all_staff" on public.clients
for all to authenticated
using (public.modhanios_customer_portal_is_staff())
with check (public.modhanios_customer_portal_is_staff());

drop policy if exists "clients_select_staff_or_customer" on public.clients;
create policy "clients_select_staff_or_customer" on public.clients
for select to authenticated
using (public.modhanios_customer_portal_is_staff() or id = public.modhanios_active_customer_client_id());

drop policy if exists "locations_select_authenticated" on public.locations;
drop policy if exists "locations_all_staff" on public.locations;
create policy "locations_all_staff" on public.locations
for all to authenticated
using (public.modhanios_customer_portal_is_staff())
with check (public.modhanios_customer_portal_is_staff());

drop policy if exists "locations_select_staff_or_customer" on public.locations;
create policy "locations_select_staff_or_customer" on public.locations
for select to authenticated
using (public.modhanios_customer_portal_is_staff() or client_id = public.modhanios_active_customer_client_id());

drop policy if exists "products_select_authenticated" on public.products;
drop policy if exists "products_all_staff" on public.products;
create policy "products_all_staff" on public.products
for all to authenticated
using (public.modhanios_customer_portal_is_staff())
with check (public.modhanios_customer_portal_is_staff());

drop policy if exists "products_select_staff_or_customer_catalogue" on public.products;
create policy "products_select_staff_or_customer_catalogue" on public.products
for select to authenticated
using (
  public.modhanios_customer_portal_is_staff()
  or exists (
    select 1
    from public.client_product_prices cpp
    where cpp.product_id = products.id
      and cpp.client_id = public.modhanios_active_customer_client_id()
      and cpp.is_active
      and cpp.price > 0
  )
);

drop policy if exists "client_product_prices_select_authenticated" on public.client_product_prices;
drop policy if exists "client_product_prices_all_staff" on public.client_product_prices;
create policy "client_product_prices_all_staff" on public.client_product_prices
for all to authenticated
using (public.modhanios_customer_portal_is_staff())
with check (public.modhanios_customer_portal_is_staff());

drop policy if exists "client_product_prices_select_staff_or_customer_catalogue" on public.client_product_prices;
create policy "client_product_prices_select_staff_or_customer_catalogue" on public.client_product_prices
for select to authenticated
using (
  public.modhanios_customer_portal_is_staff()
  or (
    client_id = public.modhanios_active_customer_client_id()
    and is_active
    and price > 0
  )
);

drop policy if exists "orders_all_authenticated" on public.orders;
drop policy if exists "orders_select_authenticated" on public.orders;
drop policy if exists "orders_all_staff" on public.orders;
create policy "orders_all_staff" on public.orders
for all to authenticated
using (public.modhanios_customer_portal_is_staff())
with check (public.modhanios_customer_portal_is_staff());

drop policy if exists "orders_select_staff_or_customer_portal" on public.orders;
create policy "orders_select_staff_or_customer_portal" on public.orders
for select to authenticated
using (
  public.modhanios_customer_portal_is_staff()
  or (
    client_id = public.modhanios_active_customer_client_id()
    and source = 'portal'
  )
);

drop policy if exists "order_items_all_authenticated" on public.order_items;
drop policy if exists "order_items_select_authenticated" on public.order_items;
drop policy if exists "order_items_all_staff" on public.order_items;
create policy "order_items_all_staff" on public.order_items
for all to authenticated
using (public.modhanios_customer_portal_is_staff())
with check (public.modhanios_customer_portal_is_staff());

drop policy if exists "order_items_select_staff_or_customer_portal" on public.order_items;
create policy "order_items_select_staff_or_customer_portal" on public.order_items
for select to authenticated
using (
  public.modhanios_customer_portal_is_staff()
  or exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and orders.client_id = public.modhanios_active_customer_client_id()
      and orders.source = 'portal'
  )
);

drop policy if exists "batches_all_authenticated" on public.batches;
drop policy if exists "batches_select_authenticated" on public.batches;
drop policy if exists "batches_all_staff" on public.batches;
create policy "batches_all_staff" on public.batches
for all to authenticated
using (public.modhanios_customer_portal_is_staff())
with check (public.modhanios_customer_portal_is_staff());

drop policy if exists "batches_select_staff" on public.batches;
create policy "batches_select_staff" on public.batches
for select to authenticated
using (public.modhanios_customer_portal_is_staff());

drop policy if exists "batch_assignments_all_authenticated" on public.batch_assignments;
drop policy if exists "batch_assignments_select_authenticated" on public.batch_assignments;
drop policy if exists "batch_assignments_all_staff" on public.batch_assignments;
create policy "batch_assignments_all_staff" on public.batch_assignments
for all to authenticated
using (public.modhanios_customer_portal_is_staff())
with check (public.modhanios_customer_portal_is_staff());

drop policy if exists "batch_assignments_select_staff" on public.batch_assignments;
create policy "batch_assignments_select_staff" on public.batch_assignments
for select to authenticated
using (public.modhanios_customer_portal_is_staff());

drop policy if exists "audit_events_select_authenticated" on public.audit_events;
drop policy if exists "audit_events_insert_authenticated" on public.audit_events;
drop policy if exists "audit_events_select_staff" on public.audit_events;
drop policy if exists "audit_events_insert_staff" on public.audit_events;
create policy "audit_events_select_staff" on public.audit_events
for select to authenticated
using (public.modhanios_customer_portal_is_staff());

create policy "audit_events_insert_staff" on public.audit_events
for insert to authenticated
with check (public.modhanios_customer_portal_is_staff());

drop policy if exists "quickbooks_settings_select_authenticated" on public.quickbooks_settings;
drop policy if exists "quickbooks_settings_all_staff" on public.quickbooks_settings;
create policy "quickbooks_settings_all_staff" on public.quickbooks_settings
for all to authenticated
using (public.modhanios_customer_portal_is_staff())
with check (public.modhanios_customer_portal_is_staff());

drop policy if exists "quickbooks_sync_jobs_select_authenticated" on public.quickbooks_sync_jobs;
drop policy if exists "quickbooks_sync_jobs_select_staff" on public.quickbooks_sync_jobs;
create policy "quickbooks_sync_jobs_select_staff" on public.quickbooks_sync_jobs
for select to authenticated
using (public.modhanios_customer_portal_is_staff());

drop policy if exists "quickbooks_sync_attempts_select_authenticated" on public.quickbooks_sync_attempts;
drop policy if exists "quickbooks_sync_attempts_select_staff" on public.quickbooks_sync_attempts;
create policy "quickbooks_sync_attempts_select_staff" on public.quickbooks_sync_attempts
for select to authenticated
using (public.modhanios_customer_portal_is_staff());

drop function if exists public.modhanios_set_client_price(uuid, text, text, text, numeric);
create or replace function public.modhanios_set_client_price(
  p_user_id uuid,
  p_id text,
  p_client_id text,
  p_product_id text,
  p_price numeric,
  p_is_active boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.modhanios_assert_manage_settings(p_user_id);

  if p_is_active and (p_price is null or p_price <= 0) then
    raise exception 'Enabled portal products need a price greater than zero.';
  end if;

  insert into public.client_product_prices (
    id,
    client_id,
    product_id,
    price,
    is_active
  )
  values (
    p_id,
    p_client_id,
    p_product_id,
    greatest(coalesce(p_price, 0), 0),
    coalesce(p_is_active, false)
  )
  on conflict (client_id, product_id) do update set
    price = excluded.price,
    is_active = excluded.is_active;
end;
$$;

create or replace function public.modhanios_register_customer_profile(
  p_full_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_full_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select email into v_email
  from auth.users
  where id = auth.uid();

  v_full_name := nullif(btrim(coalesce(p_full_name, '')), '');

  if v_full_name is null then
    raise exception 'Full name is required.';
  end if;

  if exists (select 1 from public.profiles where user_id = auth.uid()) then
    raise exception 'Staff accounts cannot register as customer contacts.';
  end if;

  insert into public.customer_contacts (
    user_id,
    email,
    full_name,
    status
  )
  values (
    auth.uid(),
    v_email,
    v_full_name,
    'pending'
  )
  on conflict (user_id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    status = case
      when public.customer_contacts.status = 'disabled' then public.customer_contacts.status
      else public.customer_contacts.status
    end;
end;
$$;

create or replace function public.modhanios_update_customer_contact(
  p_user_id uuid,
  p_contact_user_id uuid,
  p_full_name text,
  p_client_id text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.modhanios_assert_manage_settings(p_user_id);

  if p_status not in ('pending', 'active', 'disabled') then
    raise exception 'Invalid customer contact status.';
  end if;

  if p_status = 'active' and p_client_id is null then
    raise exception 'Active customer contacts must be linked to a company.';
  end if;

  update public.customer_contacts
  set
    full_name = btrim(p_full_name),
    client_id = p_client_id,
    status = p_status
  where user_id = p_contact_user_id;

  if not found then
    raise exception 'Customer contact not found.';
  end if;
end;
$$;

create or replace function public.modhanios_submit_customer_order(
  p_client_id text,
  p_location_id text,
  p_items jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.customer_contacts%rowtype;
  v_location public.locations%rowtype;
  v_order_id text;
  v_order_number integer;
  v_created_at timestamptz := timezone('utc', now());
  v_item jsonb;
  v_product public.products%rowtype;
  v_pricing public.client_product_prices%rowtype;
  v_quantity numeric(12, 2);
  v_index integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select * into v_contact
  from public.customer_contacts
  where user_id = auth.uid()
    and status = 'active'
    and client_id = p_client_id;

  if not found then
    raise exception 'This customer account is not approved for that company.';
  end if;

  select * into v_location
  from public.locations
  where id = p_location_id
    and client_id = p_client_id;

  if not found then
    raise exception 'Select a valid company location.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one product is required.';
  end if;

  v_order_id := concat('portal-order-', extract(epoch from v_created_at)::bigint, '-', substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  select coalesce(max(order_number), 1000) + 1 into v_order_number from public.orders;

  insert into public.orders (
    id,
    order_number,
    client_id,
    location_id,
    source,
    status,
    created_at
  )
  values (
    v_order_id,
    v_order_number,
    p_client_id,
    p_location_id,
    'portal',
    'pending',
    v_created_at
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_index := v_index + 1;
    v_quantity := nullif(v_item->>'quantity', '')::numeric;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Product quantities must be greater than zero.';
    end if;

    select * into v_product
    from public.products
    where id = v_item->>'productId';

    if not found then
      raise exception 'One selected product no longer exists.';
    end if;

    select * into v_pricing
    from public.client_product_prices
    where client_id = p_client_id
      and product_id = v_product.id
      and is_active
      and price > 0;

    if not found then
      raise exception 'One selected product is not enabled for this company.';
    end if;

    insert into public.order_items (
      id,
      order_id,
      product_id,
      quantity,
      fulfilled_qty,
      base_price,
      client_price
    )
    values (
      concat(v_order_id, '-item-', v_index),
      v_order_id,
      v_product.id,
      v_quantity,
      0,
      v_product.base_catalogue_price,
      v_pricing.price
    );
  end loop;

  insert into public.audit_events (
    id,
    timestamp,
    action,
    order_id,
    client_id,
    user_id,
    user_name,
    details,
    previous_value,
    new_value
  )
  values (
    concat('audit-', replace(gen_random_uuid()::text, '-', '')),
    v_created_at,
    'order_received',
    v_order_id,
    p_client_id,
    null,
    v_contact.full_name,
    format('Portal order created by %s for %s', v_contact.full_name, v_location.name),
    null,
    format('Order #%s', v_order_number)
  );

  return v_order_id;
end;
$$;

revoke all on function public.modhanios_customer_portal_is_staff() from public;
revoke all on function public.modhanios_active_customer_client_id() from public;
revoke all on function public.modhanios_set_client_price(uuid, text, text, text, numeric, boolean) from public;
revoke all on function public.modhanios_register_customer_profile(text) from public;
revoke all on function public.modhanios_update_customer_contact(uuid, uuid, text, text, text) from public;
revoke all on function public.modhanios_submit_customer_order(text, text, jsonb) from public;

grant execute on function public.modhanios_customer_portal_is_staff() to authenticated;
grant execute on function public.modhanios_active_customer_client_id() to authenticated;
grant execute on function public.modhanios_set_client_price(uuid, text, text, text, numeric, boolean) to authenticated;
grant execute on function public.modhanios_register_customer_profile(text) to authenticated;
grant execute on function public.modhanios_update_customer_contact(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.modhanios_submit_customer_order(text, text, jsonb) to authenticated;
