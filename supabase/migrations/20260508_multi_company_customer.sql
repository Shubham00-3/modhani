-- Multi-company, multi-location customer assignments.
-- Replaces the single customer_contacts.client_id with M:N junction tables.

-- ============================================================================
-- 1. Junction tables
-- ============================================================================

create table if not exists public.customer_client_assignments (
  customer_user_id uuid not null references public.customer_contacts (user_id) on delete cascade,
  client_id text not null references public.clients (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (customer_user_id, client_id)
);

create table if not exists public.customer_location_assignments (
  customer_user_id uuid not null references public.customer_contacts (user_id) on delete cascade,
  location_id text not null references public.locations (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (customer_user_id, location_id)
);

-- ============================================================================
-- 2. Migrate existing data from customer_contacts.client_id
-- ============================================================================

insert into public.customer_client_assignments (customer_user_id, client_id)
select user_id, client_id
from public.customer_contacts
where client_id is not null
on conflict do nothing;

-- Auto-assign all locations belonging to the linked client.
insert into public.customer_location_assignments (customer_user_id, location_id)
select cc.user_id, l.id
from public.customer_contacts cc
join public.locations l on l.client_id = cc.client_id
where cc.client_id is not null
on conflict do nothing;

-- ============================================================================
-- 3. RLS on new tables
-- ============================================================================

alter table public.customer_client_assignments enable row level security;
alter table public.customer_location_assignments enable row level security;

-- Staff can do everything on client assignments.
drop policy if exists "cca_all_staff" on public.customer_client_assignments;
create policy "cca_all_staff" on public.customer_client_assignments
  for all to authenticated
  using (public.modhanios_customer_portal_is_staff())
  with check (public.modhanios_customer_portal_is_staff());

-- Customers can read their own client assignments.
drop policy if exists "cca_select_own" on public.customer_client_assignments;
create policy "cca_select_own" on public.customer_client_assignments
  for select to authenticated
  using (customer_user_id = auth.uid());

-- Staff can do everything on location assignments.
drop policy if exists "cla_all_staff" on public.customer_location_assignments;
create policy "cla_all_staff" on public.customer_location_assignments
  for all to authenticated
  using (public.modhanios_customer_portal_is_staff())
  with check (public.modhanios_customer_portal_is_staff());

-- Customers can read their own location assignments.
drop policy if exists "cla_select_own" on public.customer_location_assignments;
create policy "cla_select_own" on public.customer_location_assignments
  for select to authenticated
  using (customer_user_id = auth.uid());

-- ============================================================================
-- 4. New set-returning helper: all client_ids for the authenticated customer
-- ============================================================================

create or replace function public.modhanios_customer_client_ids()
returns setof text
language sql
security definer
set search_path = public
stable
as $$
  select cca.client_id
  from public.customer_client_assignments cca
  join public.customer_contacts cc on cc.user_id = cca.customer_user_id
  where cca.customer_user_id = auth.uid()
    and cc.status = 'active';
$$;

-- Keep the old single-client function working (returns first assigned client).
create or replace function public.modhanios_active_customer_client_id()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select cca.client_id
  from public.customer_client_assignments cca
  join public.customer_contacts cc on cc.user_id = cca.customer_user_id
  where cca.customer_user_id = auth.uid()
    and cc.status = 'active'
  limit 1;
$$;

-- ============================================================================
-- 5. Update RLS policies to support multi-company
-- ============================================================================

-- Clients: customer can see all their assigned clients.
drop policy if exists "clients_select_staff_or_customer" on public.clients;
create policy "clients_select_staff_or_customer" on public.clients
  for select to authenticated
  using (
    public.modhanios_customer_portal_is_staff()
    or id in (select public.modhanios_customer_client_ids())
  );

-- Locations: customer can see locations they are assigned to.
drop policy if exists "locations_select_staff_or_customer" on public.locations;
create policy "locations_select_staff_or_customer" on public.locations
  for select to authenticated
  using (
    public.modhanios_customer_portal_is_staff()
    or id in (
      select location_id
      from public.customer_location_assignments
      where customer_user_id = auth.uid()
    )
  );

-- Products: customer can see products priced for any of their assigned clients.
drop policy if exists "products_select_staff_or_customer_catalogue" on public.products;
create policy "products_select_staff_or_customer_catalogue" on public.products
  for select to authenticated
  using (
    public.modhanios_customer_portal_is_staff()
    or exists (
      select 1
      from public.client_product_prices cpp
      where cpp.product_id = products.id
        and cpp.client_id in (select public.modhanios_customer_client_ids())
        and cpp.is_active
        and cpp.price > 0
    )
  );

-- Client product prices: customer sees prices for their assigned clients.
drop policy if exists "client_product_prices_select_staff_or_customer_catalogue" on public.client_product_prices;
create policy "client_product_prices_select_staff_or_customer_catalogue" on public.client_product_prices
  for select to authenticated
  using (
    public.modhanios_customer_portal_is_staff()
    or (
      client_id in (select public.modhanios_customer_client_ids())
      and is_active
      and price > 0
    )
  );

-- Orders: customer sees portal orders for any of their assigned clients.
drop policy if exists "orders_select_staff_or_customer_portal" on public.orders;
create policy "orders_select_staff_or_customer_portal" on public.orders
  for select to authenticated
  using (
    public.modhanios_customer_portal_is_staff()
    or (
      client_id in (select public.modhanios_customer_client_ids())
      and source = 'portal'
    )
  );

-- Order items: customer sees items for their portal orders.
drop policy if exists "order_items_select_staff_or_customer_portal" on public.order_items;
create policy "order_items_select_staff_or_customer_portal" on public.order_items
  for select to authenticated
  using (
    public.modhanios_customer_portal_is_staff()
    or exists (
      select 1
      from public.orders
      where orders.id = order_items.order_id
        and orders.client_id in (select public.modhanios_customer_client_ids())
        and orders.source = 'portal'
    )
  );

-- ============================================================================
-- 6. Update order submission to validate via junction tables
-- ============================================================================

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

  -- Verify customer is active.
  select * into v_contact
  from public.customer_contacts
  where user_id = auth.uid()
    and status = 'active';

  if not found then
    raise exception 'This customer account is not active.';
  end if;

  -- Verify customer is assigned to this client via junction table.
  if not exists (
    select 1
    from public.customer_client_assignments
    where customer_user_id = auth.uid()
      and client_id = p_client_id
  ) then
    raise exception 'This customer account is not approved for that company.';
  end if;

  -- Verify customer is assigned to this location via junction table.
  if not exists (
    select 1
    from public.customer_location_assignments
    where customer_user_id = auth.uid()
      and location_id = p_location_id
  ) then
    raise exception 'This customer account is not assigned to that location.';
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

-- ============================================================================
-- 7. Update customer contact management (remove client_id from active check)
-- ============================================================================

create or replace function public.modhanios_update_customer_contact(
  p_user_id uuid,
  p_contact_user_id uuid,
  p_full_name text,
  p_client_id text,   -- kept for backward compat but ignored for status check
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

  -- Active status no longer requires client_id — it depends on junction assignments.

  update public.customer_contacts
  set
    full_name = btrim(p_full_name),
    client_id = p_client_id,   -- keep in sync for backward compat
    status = p_status
  where user_id = p_contact_user_id;

  if not found then
    raise exception 'Customer contact not found.';
  end if;
end;
$$;

-- ============================================================================
-- 8. Grants
-- ============================================================================

revoke all on function public.modhanios_customer_client_ids() from public;
grant execute on function public.modhanios_customer_client_ids() to authenticated;

-- Re-grant the updated functions.
grant execute on function public.modhanios_submit_customer_order(text, text, jsonb) to authenticated;
grant execute on function public.modhanios_update_customer_contact(uuid, uuid, text, text, text) to authenticated;
