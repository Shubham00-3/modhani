-- Invert the tier system.
--
-- BEFORE: products carry a fixed 10-slot tierPrices array; clients carry a
-- numeric price_tier (1-10) that picks one slot.
-- AFTER:  staff create named "tiers" (max 15) and add products with custom
-- prices to each. A client is assigned at most one tier; only that tier's
-- products are visible to the client's customers, priced from the tier.
--
-- Strategy: keep public.client_product_prices as the per-(client, product)
-- truth that drives customer visibility, staff order pricing, and the
-- customer portal — assigning/editing a tier rewrites those rows.
-- Per the product owner's directive, drop the legacy columns + helpers
-- in this migration (clean break).

----------------------------------------------------------------------
-- 1. tiers + tier_products tables
----------------------------------------------------------------------

create table if not exists public.tiers (
  id text primary key,
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists tiers_name_unique_ci
  on public.tiers (lower(name));

create table if not exists public.tier_products (
  id text primary key,
  tier_id text not null references public.tiers (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade,
  price numeric(12, 2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tier_id, product_id)
);

drop trigger if exists set_tiers_updated_at on public.tiers;
create trigger set_tiers_updated_at
before update on public.tiers
for each row execute function public.set_updated_at();

drop trigger if exists set_tier_products_updated_at on public.tier_products;
create trigger set_tier_products_updated_at
before update on public.tier_products
for each row execute function public.set_updated_at();

alter table public.tiers enable row level security;
alter table public.tier_products enable row level security;

drop policy if exists "tiers_all_authenticated" on public.tiers;
create policy "tiers_all_authenticated" on public.tiers
for all to authenticated using (true) with check (true);

drop policy if exists "tier_products_all_authenticated" on public.tier_products;
create policy "tier_products_all_authenticated" on public.tier_products
for all to authenticated using (true) with check (true);

----------------------------------------------------------------------
-- 2. clients.tier_id (replaces legacy clients.price_tier)
----------------------------------------------------------------------

alter table public.clients
  add column if not exists tier_id text references public.tiers (id) on delete set null;

----------------------------------------------------------------------
-- 3. RPCs for the new tier model
----------------------------------------------------------------------

-- Replaces public.client_product_prices rows for one client with the
-- products listed on the given tier (or clears them when v_tier_id is null).
create or replace function public.modhanios_apply_tier_to_client(
  p_client_id text,
  p_tier_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.client_product_prices
  where client_id = p_client_id;

  if p_tier_id is null then
    return;
  end if;

  insert into public.client_product_prices (
    id, client_id, product_id, price, is_active
  )
  select
    concat('cp-', p_client_id, '-', tp.product_id),
    p_client_id,
    tp.product_id,
    tp.price,
    true
  from public.tier_products tp
  where tp.tier_id = p_tier_id;
end;
$$;

create or replace function public.modhanios_upsert_tier(
  p_user_id uuid,
  p_id text,
  p_name text,
  p_products jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_tier_id text := btrim(coalesce(p_id, ''));
  v_name text := btrim(coalesce(p_name, ''));
  v_existing public.tiers%rowtype;
  v_is_new boolean;
  v_active_tier_count integer;
  v_member record;
begin
  select * into v_profile from public.modhanios_assert_manage_settings(p_user_id);

  if v_tier_id = '' then
    raise exception 'Tier id is required.';
  end if;

  if v_name = '' then
    raise exception 'Tier name is required.';
  end if;

  if p_products is null or jsonb_typeof(p_products) <> 'array' then
    raise exception 'Tier products must be a JSON array.';
  end if;

  -- Enforce 15-tier cap on inserts.
  select * into v_existing from public.tiers where id = v_tier_id;
  v_is_new := not found;

  if v_is_new then
    select count(*) into v_active_tier_count from public.tiers;
    if v_active_tier_count >= 15 then
      raise exception 'Maximum of 15 tiers reached. Delete an existing tier first.';
    end if;
  end if;

  -- Reject duplicate names (case-insensitive).
  if exists (
    select 1 from public.tiers
    where lower(name) = lower(v_name)
      and id <> v_tier_id
  ) then
    raise exception 'A tier with that name already exists.';
  end if;

  insert into public.tiers (id, name)
  values (v_tier_id, v_name)
  on conflict (id) do update set
    name = excluded.name,
    updated_at = timezone('utc', now());

  -- Replace the tier's product list.
  delete from public.tier_products where tier_id = v_tier_id;

  insert into public.tier_products (id, tier_id, product_id, price)
  select
    concat('tp-', v_tier_id, '-', entry->>'productId'),
    v_tier_id,
    entry->>'productId',
    greatest(coalesce((entry->>'price')::numeric, 0), 0)
  from jsonb_array_elements(p_products) as entry
  where coalesce(btrim(entry->>'productId'), '') <> '';

  -- Re-apply to every client currently on this tier so prices/visibility match.
  for v_member in
    select id from public.clients where tier_id = v_tier_id
  loop
    perform public.modhanios_apply_tier_to_client(v_member.id, v_tier_id);
  end loop;

  perform public.modhanios_insert_audit(
    case when v_is_new then 'tier_created' else 'tier_updated' end,
    null,
    null,
    p_user_id,
    v_profile.full_name,
    format(
      '%s tier "%s" with %s product(s)',
      case when v_is_new then 'Created' else 'Updated' end,
      v_name,
      jsonb_array_length(p_products)
    ),
    case when v_is_new then null else coalesce(v_existing.name, v_name) end,
    v_name
  );
end;
$$;

create or replace function public.modhanios_delete_tier(
  p_user_id uuid,
  p_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_tier public.tiers%rowtype;
  v_member_id text;
begin
  select * into v_profile from public.modhanios_assert_manage_settings(p_user_id);

  select * into v_tier from public.tiers where id = p_id;
  if not found then
    raise exception 'Tier not found.';
  end if;

  -- Clear pricing for every client on this tier before nulling tier_id.
  for v_member_id in
    select id from public.clients where tier_id = p_id
  loop
    perform public.modhanios_apply_tier_to_client(v_member_id, null);
  end loop;

  update public.clients set tier_id = null where tier_id = p_id;
  delete from public.tier_products where tier_id = p_id;
  delete from public.tiers where id = p_id;

  perform public.modhanios_insert_audit(
    'tier_deleted',
    null,
    null,
    p_user_id,
    v_profile.full_name,
    format('Deleted tier "%s"', v_tier.name),
    v_tier.name,
    null
  );
end;
$$;

create or replace function public.modhanios_set_tier_client_membership(
  p_user_id uuid,
  p_tier_id text,
  p_client_ids text[] default array[]::text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_tier public.tiers%rowtype;
  v_member_ids text[] := coalesce(p_client_ids, array[]::text[]);
  v_invalid_ids text[];
  v_removed_id text;
  v_added_id text;
begin
  select * into v_profile from public.modhanios_assert_manage_settings(p_user_id);

  select * into v_tier from public.tiers where id = p_tier_id;
  if not found then
    raise exception 'Tier not found.';
  end if;

  -- Validate that every supplied client id exists.
  select array_agg(supplied.client_id)
  into v_invalid_ids
  from unnest(v_member_ids) as supplied(client_id)
  left join public.clients c on c.id = supplied.client_id
  where c.id is null;

  if coalesce(array_length(v_invalid_ids, 1), 0) > 0 then
    raise exception 'One selected client no longer exists.';
  end if;

  -- Clients that were on this tier but are no longer in the new membership:
  -- clear their tier and their pricing rows.
  for v_removed_id in
    select id
    from public.clients
    where tier_id = p_tier_id
      and (v_member_ids is null or not (id = any(v_member_ids)))
  loop
    perform public.modhanios_apply_tier_to_client(v_removed_id, null);
    update public.clients set tier_id = null where id = v_removed_id;
  end loop;

  -- Clients in the new membership: switch them onto this tier and refresh
  -- their pricing rows (also handles "moved from another tier").
  foreach v_added_id in array v_member_ids loop
    update public.clients set tier_id = p_tier_id where id = v_added_id;
    perform public.modhanios_apply_tier_to_client(v_added_id, p_tier_id);
  end loop;

  perform public.modhanios_insert_audit(
    'tier_membership_updated',
    null,
    null,
    p_user_id,
    v_profile.full_name,
    format(
      'Set %s client(s) on tier "%s"',
      coalesce(array_length(v_member_ids, 1), 0),
      v_tier.name
    ),
    null,
    null
  );
end;
$$;

revoke all on function public.modhanios_apply_tier_to_client(text, text) from public;
revoke all on function public.modhanios_upsert_tier(uuid, text, text, jsonb) from public;
revoke all on function public.modhanios_delete_tier(uuid, text) from public;
revoke all on function public.modhanios_set_tier_client_membership(uuid, text, text[]) from public;

grant execute on function public.modhanios_upsert_tier(uuid, text, text, jsonb) to authenticated;
grant execute on function public.modhanios_delete_tier(uuid, text) to authenticated;
grant execute on function public.modhanios_set_tier_client_membership(uuid, text, text[]) to authenticated;

----------------------------------------------------------------------
-- 4. Replace modhanios_upsert_product (drop the p_tier_prices param)
----------------------------------------------------------------------

drop function if exists public.modhanios_upsert_product(uuid, text, text, text, text, numeric, jsonb, text, text, text, numeric, integer, integer, text, text, text, text);

create or replace function public.modhanios_upsert_product(
  p_user_id uuid,
  p_id text,
  p_name text,
  p_unit_size text,
  p_category text,
  p_base_catalogue_price numeric,
  p_item_number text default null,
  p_upc text default null,
  p_packaging_details text default null,
  p_units_per_case numeric default null,
  p_shelf_life_days integer default null,
  p_lead_time_days integer default null,
  p_order_unit_label text default null,
  p_qb_item_name text default null,
  p_image_url text default null,
  p_image_path text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id text := btrim(coalesce(p_id, ''));
  v_base_price numeric := round(greatest(coalesce(p_base_catalogue_price, 0), 0), 2);
begin
  perform public.modhanios_assert_manage_settings(p_user_id);

  if v_product_id = '' then
    raise exception 'Product id is required.';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'Product name is required.';
  end if;

  if p_unit_size is null or btrim(p_unit_size) = '' then
    raise exception 'Unit size is required.';
  end if;

  insert into public.products (
    id,
    name,
    unit_size,
    category,
    base_catalogue_price,
    item_number,
    upc,
    packaging_details,
    units_per_case,
    shelf_life_days,
    lead_time_days,
    order_unit_label,
    qb_item_name,
    qb_mapping_status,
    image_url,
    image_path
  )
  values (
    v_product_id,
    btrim(p_name),
    btrim(p_unit_size),
    nullif(btrim(coalesce(p_category, '')), ''),
    v_base_price,
    nullif(btrim(coalesce(p_item_number, '')), ''),
    nullif(btrim(coalesce(p_upc, '')), ''),
    nullif(btrim(coalesce(p_packaging_details, '')), ''),
    case when p_units_per_case is null then null else greatest(p_units_per_case, 0) end,
    case when p_shelf_life_days is null then null else greatest(p_shelf_life_days, 0) end,
    case when p_lead_time_days is null then null else greatest(p_lead_time_days, 0) end,
    nullif(btrim(coalesce(p_order_unit_label, '')), ''),
    nullif(btrim(coalesce(p_qb_item_name, concat_ws(' ', p_name, p_unit_size))), ''),
    'ready',
    nullif(btrim(coalesce(p_image_url, '')), ''),
    nullif(btrim(coalesce(p_image_path, '')), '')
  )
  on conflict (id) do update set
    name = excluded.name,
    unit_size = excluded.unit_size,
    category = excluded.category,
    base_catalogue_price = excluded.base_catalogue_price,
    item_number = excluded.item_number,
    upc = excluded.upc,
    packaging_details = excluded.packaging_details,
    units_per_case = excluded.units_per_case,
    shelf_life_days = excluded.shelf_life_days,
    lead_time_days = excluded.lead_time_days,
    order_unit_label = excluded.order_unit_label,
    qb_item_name = excluded.qb_item_name,
    qb_mapping_status = excluded.qb_mapping_status,
    image_url = excluded.image_url,
    image_path = excluded.image_path,
    updated_at = timezone('utc', now());

  -- Product changes no longer cascade to client prices — prices come from
  -- tier_products now. A product rename keeps the tier-set price as-is.
end;
$$;

revoke all on function public.modhanios_upsert_product(uuid, text, text, text, text, numeric, text, text, text, numeric, integer, integer, text, text, text, text) from public;
grant execute on function public.modhanios_upsert_product(uuid, text, text, text, text, numeric, text, text, text, numeric, integer, integer, text, text, text, text) to authenticated;

----------------------------------------------------------------------
-- 5. Replace modhanios_submit_customer_order — stop reading tier_prices
----------------------------------------------------------------------

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
    and status = 'active';

  if not found then
    raise exception 'This customer account is not active.';
  end if;

  if not exists (
    select 1
    from public.customer_client_assignments
    where customer_user_id = auth.uid()
      and client_id = p_client_id
  ) then
    raise exception 'This customer account is not approved for that company.';
  end if;

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
      and price > 0
    limit 1;

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
      coalesce(v_product.base_catalogue_price, v_pricing.price),
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

grant execute on function public.modhanios_submit_customer_order(text, text, jsonb) to authenticated;

----------------------------------------------------------------------
-- 6. Drop the legacy fixed-tier system
----------------------------------------------------------------------

drop function if exists public.modhanios_save_client_catalogue(uuid, text, integer, text[]);
drop function if exists public.modhanios_build_tier_prices(numeric, jsonb);
drop function if exists public.modhanios_product_tier_price(jsonb, numeric, integer);

alter table public.clients drop constraint if exists clients_price_tier_range;
alter table public.clients drop column if exists price_tier;
alter table public.products drop column if exists tier_prices;
