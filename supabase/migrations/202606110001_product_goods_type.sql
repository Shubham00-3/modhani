-- Goods-type classification for catalogue products.
--
-- Each product is labelled as a finished good, an unfinished (work in progress)
-- good, a raw material, or a packaging material so the Inventory list can be
-- filtered by bucket. Existing products default to 'finished'. This is a simple
-- per-product label and is independent of the future raw-material/packaging
-- materials ledger described in docs/inventory-locations-materials-roadmap.md.

alter table public.products
  add column if not exists goods_type text not null default 'finished';

alter table public.products
  drop constraint if exists products_goods_type_check;

alter table public.products
  add constraint products_goods_type_check
  check (goods_type in ('finished', 'unfinished', 'raw', 'packaging'));

-- ---------------------------------------------------------------------------
-- Replace modhanios_upsert_product with the p_goods_type parameter.
-- (Re-create of the function from 202606060001 with goods_type added.)
-- ---------------------------------------------------------------------------
drop function if exists public.modhanios_upsert_product(uuid, text, text, text, text, numeric, text, text, text, numeric, integer, integer, text, text, text, text, boolean);

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
  p_image_path text default null,
  p_hst_applicable boolean default false,
  p_goods_type text default 'finished'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id text := btrim(coalesce(p_id, ''));
  v_base_price numeric := round(greatest(coalesce(p_base_catalogue_price, 0), 0), 2);
  v_goods_type text := lower(nullif(btrim(coalesce(p_goods_type, '')), ''));
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

  if v_goods_type is null then
    v_goods_type := 'finished';
  end if;

  if v_goods_type not in ('finished', 'unfinished', 'raw', 'packaging') then
    raise exception 'Invalid goods type: %', p_goods_type;
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
    image_path,
    hst_applicable,
    goods_type
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
    nullif(btrim(coalesce(p_image_path, '')), ''),
    coalesce(p_hst_applicable, false),
    v_goods_type
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
    hst_applicable = excluded.hst_applicable,
    goods_type = excluded.goods_type,
    updated_at = timezone('utc', now());
end;
$$;

revoke all on function public.modhanios_upsert_product(uuid, text, text, text, text, numeric, text, text, text, numeric, integer, integer, text, text, text, text, boolean, text) from public;
grant execute on function public.modhanios_upsert_product(uuid, text, text, text, text, numeric, text, text, text, numeric, integer, integer, text, text, text, text, boolean, text) to authenticated;
