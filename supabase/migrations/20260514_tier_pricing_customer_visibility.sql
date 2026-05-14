alter table public.clients
  add column if not exists price_tier integer;

update public.clients
set price_tier = 1
where price_tier is null;

alter table public.clients
  alter column price_tier set default 1,
  alter column price_tier set not null;

do $$
begin
  alter table public.clients
    add constraint clients_price_tier_range check (price_tier between 1 and 10);
exception
  when duplicate_object then null;
end
$$;

alter table public.products
  add column if not exists tier_prices jsonb;

create or replace function public.modhanios_product_tier_price(
  p_tier_prices jsonb,
  p_base_catalogue_price numeric,
  p_price_tier integer
)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_tier integer := greatest(1, least(10, coalesce(p_price_tier, 1)));
  v_text text;
  v_price numeric;
begin
  v_text := nullif(coalesce(p_tier_prices, '{}'::jsonb) ->> v_tier::text, '');

  if v_text is not null and v_text ~ '^[[:space:]]*[0-9]+(\.[0-9]+)?[[:space:]]*$' then
    v_price := v_text::numeric;
  else
    v_price := coalesce(p_base_catalogue_price, 0);
  end if;

  return round(greatest(coalesce(v_price, 0), 0), 2);
end;
$$;

create or replace function public.modhanios_build_tier_prices(
  p_base_catalogue_price numeric,
  p_tier_prices jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_tier integer;
begin
  for v_tier in 1..10 loop
    v_result := v_result || jsonb_build_object(
      v_tier::text,
      public.modhanios_product_tier_price(p_tier_prices, p_base_catalogue_price, v_tier)
    );
  end loop;

  return v_result;
end;
$$;

update public.products
set tier_prices = public.modhanios_build_tier_prices(base_catalogue_price, tier_prices)
where tier_prices is null
   or tier_prices = '{}'::jsonb
   or not tier_prices ? '1'
   or not tier_prices ? '10';

alter table public.products
  alter column tier_prices set default '{}'::jsonb,
  alter column tier_prices set not null;

update public.client_product_prices cpp
set price = public.modhanios_product_tier_price(p.tier_prices, p.base_catalogue_price, c.price_tier),
    updated_at = timezone('utc', now())
from public.products p,
     public.clients c
where cpp.product_id = p.id
  and cpp.client_id = c.id;

drop function if exists public.modhanios_upsert_product(uuid, text, text, text, text, numeric, text, text, text);
drop function if exists public.modhanios_upsert_product(uuid, text, text, text, text, numeric, jsonb, text, text, text);

create or replace function public.modhanios_upsert_product(
  p_user_id uuid,
  p_id text,
  p_name text,
  p_unit_size text,
  p_category text,
  p_base_catalogue_price numeric,
  p_tier_prices jsonb default '{}'::jsonb,
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
  v_tier_prices jsonb;
  v_base_price numeric;
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

  v_tier_prices := public.modhanios_build_tier_prices(p_base_catalogue_price, p_tier_prices);
  v_base_price := public.modhanios_product_tier_price(v_tier_prices, p_base_catalogue_price, 1);

  insert into public.products (
    id,
    name,
    unit_size,
    category,
    base_catalogue_price,
    tier_prices,
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
    v_tier_prices,
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
    tier_prices = excluded.tier_prices,
    qb_item_name = excluded.qb_item_name,
    qb_mapping_status = excluded.qb_mapping_status,
    image_url = excluded.image_url,
    image_path = excluded.image_path,
    updated_at = timezone('utc', now());

  update public.client_product_prices cpp
  set price = public.modhanios_product_tier_price(v_tier_prices, v_base_price, c.price_tier),
      updated_at = timezone('utc', now())
  from public.clients c
  where cpp.client_id = c.id
    and cpp.product_id = v_product_id;
end;
$$;

create or replace function public.modhanios_save_client_catalogue(
  p_user_id uuid,
  p_client_id text,
  p_price_tier integer,
  p_enabled_product_ids text[] default array[]::text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_client public.clients%rowtype;
  v_price_tier integer;
  v_enabled_product_ids text[] := coalesce(p_enabled_product_ids, array[]::text[]);
  v_invalid_product_ids text[];
  v_enabled_count integer := 0;
begin
  select * into v_profile from public.modhanios_assert_manage_settings(p_user_id);

  if p_price_tier is null or p_price_tier < 1 or p_price_tier > 10 then
    raise exception 'Select a pricing tier between 1 and 10.';
  end if;

  v_price_tier := p_price_tier;

  select * into v_client
  from public.clients
  where id = p_client_id;

  if not found then
    raise exception 'Client not found.';
  end if;

  select array_agg(enabled.product_id)
  into v_invalid_product_ids
  from unnest(v_enabled_product_ids) as enabled(product_id)
  left join public.products p on p.id = enabled.product_id
  where p.id is null;

  if coalesce(array_length(v_invalid_product_ids, 1), 0) > 0 then
    raise exception 'One selected product no longer exists.';
  end if;

  update public.clients
  set price_tier = v_price_tier,
      updated_at = timezone('utc', now())
  where id = p_client_id;

  update public.client_product_prices cpp
  set price = public.modhanios_product_tier_price(p.tier_prices, p.base_catalogue_price, v_price_tier),
      is_active = false,
      updated_at = timezone('utc', now())
  from public.products p
  where cpp.client_id = p_client_id
    and cpp.product_id = p.id;

  insert into public.client_product_prices (
    id,
    client_id,
    product_id,
    price,
    is_active
  )
  select
    concat('cp-', p_client_id, '-', p.id),
    p_client_id,
    p.id,
    public.modhanios_product_tier_price(p.tier_prices, p.base_catalogue_price, v_price_tier),
    true
  from public.products p
  where p.id in (
    select distinct enabled.product_id
    from unnest(v_enabled_product_ids) as enabled(product_id)
  )
  on conflict (client_id, product_id) do update set
    id = excluded.id,
    price = excluded.price,
    is_active = true,
    updated_at = timezone('utc', now());

  select count(*)
  into v_enabled_count
  from public.client_product_prices
  where client_id = p_client_id
    and is_active;

  perform public.modhanios_insert_audit(
    'client_catalogue_updated',
    null,
    p_client_id,
    p_user_id,
    v_profile.full_name,
    format('Updated pricing tier and product visibility for %s', v_client.name),
    format('Tier %s', coalesce(v_client.price_tier, 1)),
    format('Tier %s, %s products enabled', v_price_tier, v_enabled_count)
  );
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
      public.modhanios_product_tier_price(v_product.tier_prices, v_product.base_catalogue_price, 1),
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

revoke all on function public.modhanios_upsert_product(uuid, text, text, text, text, numeric, jsonb, text, text, text) from public;
revoke all on function public.modhanios_save_client_catalogue(uuid, text, integer, text[]) from public;
grant execute on function public.modhanios_upsert_product(uuid, text, text, text, text, numeric, jsonb, text, text, text) to authenticated;
grant execute on function public.modhanios_save_client_catalogue(uuid, text, integer, text[]) to authenticated;
grant execute on function public.modhanios_submit_customer_order(text, text, jsonb) to authenticated;
