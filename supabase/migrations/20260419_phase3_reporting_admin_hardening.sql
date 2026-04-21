create index if not exists idx_orders_reporting_filters
on public.orders (client_id, location_id, status, created_at desc);

create index if not exists idx_order_items_order_product
on public.order_items (order_id, product_id);

create index if not exists idx_batches_reporting_lookup
on public.batches (product_id, production_date, batch_number);

create index if not exists idx_audit_events_reporting_lookup
on public.audit_events (order_id, client_id, user_id, timestamp desc);

create or replace view public.report_order_lines as
select
  o.id as order_id,
  o.order_number,
  o.client_id,
  c.name as client_name,
  o.location_id,
  l.name as location_name,
  oi.id as order_item_id,
  oi.product_id,
  p.name as product_name,
  p.unit_size,
  concat(p.name, ' ', p.unit_size) as product_display_name,
  p.category,
  o.source,
  o.status,
  o.created_at,
  o.fulfilled_at,
  o.invoiced_at,
  o.shipped_at,
  o.invoice_number,
  o.qb_invoice_number,
  o.packing_slip_number,
  coalesce(batch_rollup.batch_numbers, '') as batch_numbers,
  oi.quantity as ordered_qty,
  oi.fulfilled_qty,
  greatest(oi.quantity - oi.fulfilled_qty, 0) as outstanding_qty,
  oi.base_price,
  oi.client_price,
  oi.override_price,
  coalesce(oi.override_price, oi.client_price, oi.base_price) as effective_price,
  (oi.override_price is not null) as has_price_override,
  (oi.fulfilled_qty * coalesce(oi.override_price, oi.client_price, oi.base_price)) as fulfilled_value,
  (oi.quantity * coalesce(oi.override_price, oi.client_price, oi.base_price)) as ordered_value
from public.orders o
join public.clients c
  on c.id = o.client_id
join public.locations l
  on l.id = o.location_id
join public.order_items oi
  on oi.order_id = o.id
join public.products p
  on p.id = oi.product_id
left join lateral (
  select string_agg(distinct b.batch_number, ', ' order by b.batch_number) as batch_numbers
  from public.batch_assignments ba
  join public.batches b
    on b.id = ba.batch_id
  where ba.order_item_id = oi.id
) batch_rollup
  on true;

grant select on public.report_order_lines to authenticated;

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
  select * into v_profile
  from public.profiles
  where user_id = p_user_id;

  if not found or not v_profile.manage_settings then
    raise exception 'This user cannot manage settings.';
  end if;

  return v_profile;
end;
$$;

create or replace function public.modhanios_upsert_product(
  p_user_id uuid,
  p_id text,
  p_name text,
  p_unit_size text,
  p_category text,
  p_base_catalogue_price numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_existing public.products%rowtype;
begin
  select * into v_profile from public.modhanios_assert_manage_settings(p_user_id);

  if p_id is null or btrim(p_id) = '' then
    raise exception 'Product id is required.';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'Product name is required.';
  end if;

  if p_unit_size is null or btrim(p_unit_size) = '' then
    raise exception 'Unit size is required.';
  end if;

  if p_base_catalogue_price is null or p_base_catalogue_price < 0 then
    raise exception 'Base catalogue price must be zero or greater.';
  end if;

  select * into v_existing
  from public.products
  where id = p_id;

  insert into public.products (
    id,
    name,
    unit_size,
    category,
    base_catalogue_price
  )
  values (
    p_id,
    btrim(p_name),
    btrim(p_unit_size),
    nullif(btrim(coalesce(p_category, '')), ''),
    p_base_catalogue_price
  )
  on conflict (id) do update
  set
    name = excluded.name,
    unit_size = excluded.unit_size,
    category = excluded.category,
    base_catalogue_price = excluded.base_catalogue_price;

  perform public.modhanios_insert_audit(
    'product_saved',
    null,
    null,
    p_user_id,
    v_profile.full_name,
    case
      when v_existing.id is not null then format('Updated product %s %s', btrim(p_name), btrim(p_unit_size))
      else format('Added product %s %s', btrim(p_name), btrim(p_unit_size))
    end,
    case when v_existing.id is not null then format('$%s', to_char(v_existing.base_catalogue_price, 'FM999999990.00')) else null end,
    format('$%s', to_char(p_base_catalogue_price, 'FM999999990.00'))
  );
end;
$$;

create or replace function public.modhanios_upsert_client(
  p_user_id uuid,
  p_id text,
  p_name text,
  p_location_count integer,
  p_delivery_method text,
  p_email_packing_slip boolean,
  p_email_invoice boolean,
  p_packing_slip_email text,
  p_invoice_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_existing public.clients%rowtype;
begin
  select * into v_profile from public.modhanios_assert_manage_settings(p_user_id);

  if p_id is null or btrim(p_id) = '' then
    raise exception 'Client id is required.';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'Client name is required.';
  end if;

  if p_location_count is null or p_location_count < 0 then
    raise exception 'Location count must be zero or greater.';
  end if;

  if p_delivery_method not in ('email', 'edi', 'both') then
    raise exception 'Delivery method must be email, edi, or both.';
  end if;

  select * into v_existing
  from public.clients
  where id = p_id;

  insert into public.clients (
    id,
    name,
    location_count,
    email_packing_slip,
    email_invoice,
    delivery_method,
    packing_slip_email,
    invoice_email
  )
  values (
    p_id,
    btrim(p_name),
    p_location_count,
    coalesce(p_email_packing_slip, false),
    coalesce(p_email_invoice, false),
    p_delivery_method,
    nullif(btrim(coalesce(p_packing_slip_email, '')), ''),
    nullif(btrim(coalesce(p_invoice_email, '')), '')
  )
  on conflict (id) do update
  set
    name = excluded.name,
    location_count = excluded.location_count,
    email_packing_slip = excluded.email_packing_slip,
    email_invoice = excluded.email_invoice,
    delivery_method = excluded.delivery_method,
    packing_slip_email = excluded.packing_slip_email,
    invoice_email = excluded.invoice_email;

  perform public.modhanios_insert_audit(
    'client_saved',
    null,
    p_id,
    p_user_id,
    v_profile.full_name,
    case
      when v_existing.id is not null then format('Updated client %s', btrim(p_name))
      else format('Added client %s', btrim(p_name))
    end,
    v_existing.delivery_method,
    p_delivery_method
  );
end;
$$;

create or replace function public.modhanios_upsert_location(
  p_user_id uuid,
  p_id text,
  p_client_id text,
  p_code text,
  p_city text,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_existing public.locations%rowtype;
begin
  select * into v_profile from public.modhanios_assert_manage_settings(p_user_id);

  if p_id is null or btrim(p_id) = '' then
    raise exception 'Location id is required.';
  end if;

  if p_client_id is null or btrim(p_client_id) = '' then
    raise exception 'Client is required.';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'Location name is required.';
  end if;

  if not exists (
    select 1
    from public.clients
    where id = p_client_id
  ) then
    raise exception 'Selected client does not exist.';
  end if;

  select * into v_existing
  from public.locations
  where id = p_id;

  insert into public.locations (
    id,
    client_id,
    code,
    city,
    name
  )
  values (
    p_id,
    p_client_id,
    nullif(btrim(coalesce(p_code, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    btrim(p_name)
  )
  on conflict (id) do update
  set
    client_id = excluded.client_id,
    code = excluded.code,
    city = excluded.city,
    name = excluded.name;

  update public.clients
  set location_count = (
    select count(*)
    from public.locations
    where client_id = p_client_id
  )
  where id = p_client_id;

  if v_existing.client_id is not null and v_existing.client_id <> p_client_id then
    update public.clients
    set location_count = (
      select count(*)
      from public.locations
      where client_id = v_existing.client_id
    )
    where id = v_existing.client_id;
  end if;

  perform public.modhanios_insert_audit(
    'location_saved',
    null,
    p_client_id,
    p_user_id,
    v_profile.full_name,
    case
      when v_existing.id is not null then format('Updated location %s', btrim(p_name))
      else format('Added location %s', btrim(p_name))
    end,
    v_existing.name,
    btrim(p_name)
  );
end;
$$;

create or replace function public.modhanios_set_client_price(
  p_user_id uuid,
  p_id text,
  p_client_id text,
  p_product_id text,
  p_price numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_existing public.client_product_prices%rowtype;
  v_product public.products%rowtype;
begin
  select * into v_profile from public.modhanios_assert_manage_settings(p_user_id);

  if p_id is null or btrim(p_id) = '' then
    raise exception 'Pricing id is required.';
  end if;

  if p_price is null or p_price < 0 then
    raise exception 'Negotiated price must be zero or greater.';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id;

  if not found then
    raise exception 'Product not found.';
  end if;

  if not exists (
    select 1
    from public.clients
    where id = p_client_id
  ) then
    raise exception 'Client not found.';
  end if;

  select * into v_existing
  from public.client_product_prices
  where client_id = p_client_id
    and product_id = p_product_id;

  insert into public.client_product_prices (
    id,
    client_id,
    product_id,
    price
  )
  values (
    p_id,
    p_client_id,
    p_product_id,
    p_price
  )
  on conflict (client_id, product_id) do update
  set
    id = excluded.id,
    price = excluded.price;

  perform public.modhanios_insert_audit(
    'client_pricing_updated',
    null,
    p_client_id,
    p_user_id,
    v_profile.full_name,
    format('Updated negotiated price for %s %s', v_product.name, v_product.unit_size),
    case when v_existing.id is not null then format('$%s', to_char(v_existing.price, 'FM999999990.00')) else null end,
    format('$%s', to_char(p_price, 'FM999999990.00'))
  );
end;
$$;

create or replace function public.modhanios_update_staff_permissions(
  p_user_id uuid,
  p_target_user_id uuid,
  p_fulfil_orders boolean,
  p_override_prices boolean,
  p_manage_settings boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_remaining_admins integer;
begin
  select * into v_profile from public.modhanios_assert_manage_settings(p_user_id);

  select * into v_target
  from public.profiles
  where user_id = p_target_user_id
  for update;

  if not found then
    raise exception 'Target user not found.';
  end if;

  select count(*)
  into v_remaining_admins
  from public.profiles
  where manage_settings = true
    and user_id <> p_target_user_id;

  if v_target.manage_settings and not p_manage_settings and v_remaining_admins = 0 then
    raise exception 'At least one settings admin must remain.';
  end if;

  update public.profiles
  set
    fulfil_orders = p_fulfil_orders,
    override_prices = p_override_prices,
    manage_settings = p_manage_settings
  where user_id = p_target_user_id;

  perform public.modhanios_insert_audit(
    'user_permissions_updated',
    null,
    null,
    p_user_id,
    v_profile.full_name,
    format('Updated permissions for %s', v_target.full_name),
    format('F:%s O:%s M:%s', v_target.fulfil_orders, v_target.override_prices, v_target.manage_settings),
    format('F:%s O:%s M:%s', p_fulfil_orders, p_override_prices, p_manage_settings)
  );
end;
$$;

create or replace function public.modhanios_update_quickbooks_settings(
  p_user_id uuid,
  p_company_name text,
  p_connector_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_existing public.quickbooks_settings%rowtype;
begin
  select * into v_profile from public.modhanios_assert_manage_settings(p_user_id);

  if p_company_name is null or btrim(p_company_name) = '' then
    raise exception 'Company name is required.';
  end if;

  if p_connector_name is null or btrim(p_connector_name) = '' then
    raise exception 'Connector name is required.';
  end if;

  select * into v_existing
  from public.quickbooks_settings
  where id = 'singleton';

  update public.quickbooks_settings
  set
    company_name = btrim(p_company_name),
    connector_name = btrim(p_connector_name)
  where id = 'singleton';

  perform public.modhanios_insert_audit(
    'quickbooks_settings_updated',
    null,
    null,
    p_user_id,
    v_profile.full_name,
    'Updated QuickBooks connection settings',
    concat(coalesce(v_existing.company_name, '-'), ' / ', coalesce(v_existing.connector_name, '-')),
    concat(btrim(p_company_name), ' / ', btrim(p_connector_name))
  );
end;
$$;

drop policy if exists "profiles_update_authenticated" on public.profiles;
drop policy if exists "clients_all_authenticated" on public.clients;
drop policy if exists "locations_all_authenticated" on public.locations;
drop policy if exists "products_all_authenticated" on public.products;
drop policy if exists "client_product_prices_all_authenticated" on public.client_product_prices;
drop policy if exists "quickbooks_settings_all_authenticated" on public.quickbooks_settings;

drop policy if exists "clients_select_authenticated" on public.clients;
create policy "clients_select_authenticated" on public.clients
for select to authenticated using (true);

drop policy if exists "locations_select_authenticated" on public.locations;
create policy "locations_select_authenticated" on public.locations
for select to authenticated using (true);

drop policy if exists "products_select_authenticated" on public.products;
create policy "products_select_authenticated" on public.products
for select to authenticated using (true);

drop policy if exists "client_product_prices_select_authenticated" on public.client_product_prices;
create policy "client_product_prices_select_authenticated" on public.client_product_prices
for select to authenticated using (true);

drop policy if exists "quickbooks_settings_select_authenticated" on public.quickbooks_settings;
create policy "quickbooks_settings_select_authenticated" on public.quickbooks_settings
for select to authenticated using (true);

revoke all on function public.modhanios_assert_manage_settings(uuid) from public;
revoke all on function public.modhanios_upsert_product(uuid, text, text, text, text, numeric) from public;
revoke all on function public.modhanios_upsert_client(uuid, text, text, integer, text, boolean, boolean, text, text) from public;
revoke all on function public.modhanios_upsert_location(uuid, text, text, text, text, text) from public;
revoke all on function public.modhanios_set_client_price(uuid, text, text, text, numeric) from public;
revoke all on function public.modhanios_update_staff_permissions(uuid, uuid, boolean, boolean, boolean) from public;
revoke all on function public.modhanios_update_quickbooks_settings(uuid, text, text) from public;

grant execute on function public.modhanios_upsert_product(uuid, text, text, text, text, numeric) to authenticated;
grant execute on function public.modhanios_upsert_client(uuid, text, text, integer, text, boolean, boolean, text, text) to authenticated;
grant execute on function public.modhanios_upsert_location(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.modhanios_set_client_price(uuid, text, text, text, numeric) to authenticated;
grant execute on function public.modhanios_update_staff_permissions(uuid, uuid, boolean, boolean, boolean) to authenticated;
grant execute on function public.modhanios_update_quickbooks_settings(uuid, text, text) to authenticated;
