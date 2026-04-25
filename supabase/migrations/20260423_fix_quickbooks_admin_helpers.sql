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
  perform public.modhanios_assert_manage_settings(p_user_id);

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
  perform public.modhanios_assert_manage_settings(p_user_id);

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
  perform public.modhanios_assert_manage_settings(p_user_id);

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

revoke all on function public.modhanios_upsert_client(uuid, text, text, integer, text, boolean, boolean, text, text, text) from public;
revoke all on function public.modhanios_upsert_location(uuid, text, text, text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.modhanios_upsert_product(uuid, text, text, text, text, numeric, text) from public;
grant execute on function public.modhanios_upsert_client(uuid, text, text, integer, text, boolean, boolean, text, text, text) to authenticated;
grant execute on function public.modhanios_upsert_location(uuid, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.modhanios_upsert_product(uuid, text, text, text, text, numeric, text) to authenticated;
