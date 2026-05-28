-- Extend the master catalogue with the fields supplied in the Modhani product PDF.
-- Note: the PDF contains duplicate item number 5004, so item_number is metadata
-- rather than a unique key.

alter table public.products
  add column if not exists item_number text,
  add column if not exists upc text,
  add column if not exists packaging_details text,
  add column if not exists units_per_case numeric(12, 2),
  add column if not exists shelf_life_days integer,
  add column if not exists lead_time_days integer,
  add column if not exists order_unit_label text;

drop function if exists public.modhanios_upsert_product(uuid, text, text, text, text, numeric, jsonb, text, text, text);
drop function if exists public.modhanios_upsert_product(uuid, text, text, text, text, numeric, jsonb, text, text, text, numeric, integer, integer, text, text, text, text);

create or replace function public.modhanios_upsert_product(
  p_user_id uuid,
  p_id text,
  p_name text,
  p_unit_size text,
  p_category text,
  p_base_catalogue_price numeric,
  p_tier_prices jsonb default '{}'::jsonb,
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
    v_tier_prices,
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
    tier_prices = excluded.tier_prices,
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

  update public.client_product_prices cpp
  set price = public.modhanios_product_tier_price(v_tier_prices, v_base_price, c.price_tier),
      updated_at = timezone('utc', now())
  from public.clients c
  where cpp.client_id = c.id
    and cpp.product_id = v_product_id;
end;
$$;

revoke all on function public.modhanios_upsert_product(uuid, text, text, text, text, numeric, jsonb, text, text, text, numeric, integer, integer, text, text, text, text) from public;
grant execute on function public.modhanios_upsert_product(uuid, text, text, text, text, numeric, jsonb, text, text, text, numeric, integer, integer, text, text, text, text) to authenticated;

with pdf_products (
  id,
  name,
  unit_size,
  category,
  item_number,
  upc,
  packaging_details,
  units_per_case,
  shelf_life_days,
  lead_time_days,
  cost_per_case,
  order_unit_label
) as (
  values
    ('product-2-plain-yogurt-probiotic-750g', '2% Plain Yogurt (Probiotic)', '750g Cup', 'Probiotic Yogurt', '5101', '628451926610', '750g Cup', 6, 35, 2, 11.70, 'Case of 6'),
    ('product-2-plain-yogurt-probiotic-2kg', '2% Plain Yogurt (Probiotic)', '2Kg', 'Probiotic Yogurt', '5102', '628451926726', '2Kg', 4, 35, 2, 24.00, 'Case of 4'),
    ('product-dahi-2-750g', '2% Dahi', '750g Cup', 'Dahi', '5111', '628451926641', '750g Cup', 6, 35, 2, 11.70, 'Case of 6'),
    ('product-dahi-3-2-750g', '3.2% Dahi', '750g Cup', 'Dahi', '5116', '628451926634', '750g Cup', 6, 35, 2, 11.70, 'Case of 6'),
    ('product-dahi-3-2-2kg', '3.2% Dahi', '2 Kg', 'Dahi', '5117', '628451926658', '2 Kg', 4, 35, 2, 24.00, 'Case of 4'),
    ('product-dahi-3-2-10kg', '3.2% Dahi', '10Kg', 'Dahi', '5118', '628451926733', '10Kg', 1, 35, 2, 26.00, 'Case of 1'),
    ('product-modhani-low-fat-dahi-2-907g', 'Low Fat Dahi (2%)', '907g', 'Dahi', '5003', '628451926580', '907g', 6, 45, 2, 13.80, 'Case of 6'),
    ('product-modhani-whole-milk-dahi-4-907g', 'Whole Milk Dahi (4%)', '907g', 'Dahi', '5004', '628451926597', '907g', 6, 45, 2, 13.80, 'Case of 6'),
    ('product-modhani-low-fat-dahi-2-2kg', 'Low Fat Dahi (2%)', '2Kg', 'Dahi', '5001', '628451926504', '2Kg', 4, 45, 2, 24.00, 'Case of 4'),
    ('product-modhani-whole-milk-dahi-4-2kg', 'Whole Milk Dahi (4%)', '2Kg', 'Dahi', '5002', '628451926689', '2Kg', 4, 45, 2, 24.00, 'Case of 4'),
    ('product-item-5122', '5.9% Balkan Yogurt', '10Kg', 'Balkan Yogurt', '5122', '628451926757', '10Kg', 1, 35, 2, 30.00, 'Case of 1'),
    ('product-balkan-yogurt-750g-6', '6% Balkan Yogurt', '750g Cup', 'Balkan Yogurt', '5123', '628451926887', '750g Cup', 6, 35, 2, 14.40, 'Case of 6'),
    ('product-2-fbgy-mango-yogurt', '2% Mango Yogurt with Turmeric and Fruits', '170g Single Serving Cup', 'Fruit Yogurt', '5135', '628451926269', '170g Single Serving Cup', 24, 35, 2, 32.40, 'Case of 24'),
    ('product-2-fbgy-pineapple-yogurt', '2% Pineapple Yogurt with Turmeric and Fruits', '170g Single Serving Cup', 'Fruit Yogurt', '5136', '628451926283', '170g Single Serving Cup', 24, 35, 2, 32.40, 'Case of 24'),
    ('product-2-fbgy-blueberry-yogurt', '2% Blueberry Yogurt with Turmeric and Fruits', '170g Single Serving Cup', 'Fruit Yogurt', '5137', '628451926238', '170g Single Serving Cup', 24, 35, 2, 32.40, 'Case of 24'),
    ('product-2-fbgy-strawberry-yogurt', '2% Strawberry Yogurt with Turmeric and Fruits', '170g Single Serving Cup', 'Fruit Yogurt', '5138', '628451926221', '170g Single Serving Cup', 24, 35, 2, 32.40, 'Case of 24'),
    ('product-item-5139', '2% Raspberry Yogurt with Turmeric and Fruits', '170g Single Serving Cup', 'Fruit Yogurt', '5139', '628451926214', '170g Single Serving Cup', 24, 35, 2, 32.40, 'Case of 24'),
    ('product-item-5140', '2% Redcherry Yogurt with Turmeric and Fruits', '170g Single Serving Cup', 'Fruit Yogurt', '5140', '628451926245', '170g Single Serving Cup', 24, 35, 2, 32.40, 'Case of 24'),
    ('product-1-2-ayran-475ml', '1.2% Ayran', '475 ml', 'Lassi', '5151', '628451926818', '475 ml', 24, 45, 2, 33.60, 'Case of 24'),
    ('product-2-mint-ayran-473ml', '2% Mint Lassi/Ayran', '473ml', 'Lassi', '5152', '628451926832', '473ml', 24, 45, 2, 33.60, 'Case of 24'),
    ('product-3-mango-lassi-350ml', '3% Mango Lassi', '350ml', 'Lassi', '5153', '628451926368', '350ml', 24, 45, 2, 36.00, 'Case of 24'),
    ('product-3-mango-lassi-1l', '3% Mango Lassi', '1L', 'Lassi', '5154', '628451926375', '1L', 12, 45, 2, 54.00, 'Case of 12'),
    ('product-desi-ghee-400g', 'Ghee/Clarified Butter (Grass Fed New Zealand Butter)', '400 gm', 'Ghee/Clarified Butter', '5171', '628451926856', '400 gm', 20, 365, 2, 180.00, 'Case of 20'),
    ('product-desi-ghee-800g', 'Ghee/Clarified Butter (Grass Fed New Zealand Butter)', '800gm', 'Ghee/Clarified Butter', '5172', '628451926863', '800gm', 15, 365, 2, 255.00, 'Case of 15'),
    ('product-desi-ghee-1-6kg', 'Ghee/Clarified Butter (Grass Fed New Zealand Butter)', '1.6 Kg', 'Ghee/Clarified Butter', '5173', '628451926870', '1.6 Kg', 6, 365, 2, 192.00, 'Case of 6'),
    ('product-desi-ghee-3kg', 'Ghee/Clarified Butter (Grass Fed New Zealand Butter)', '3.0 Kg', 'Ghee/Clarified Butter', '5174', '628451926894', '3.0 Kg', 1, 365, 2, 62.00, 'Case of 1'),
    ('product-desi-ghee-10kg', 'Ghee/Clarified Butter (Grass Fed New Zealand Butter)', '10Kg', 'Ghee/Clarified Butter', '5169', '628451926900', '10Kg', 1, 365, 2, 195.00, 'Case of 1'),
    ('product-pure-desi-ghee-800g', 'Pure Desi Ghee/Clarified Butter', '800gm', 'Pure Desi Ghee/Clarified Butter', '5164', '628451926290', '800gm', 15, 365, 2, 232.50, 'Case of 15'),
    ('product-pure-desi-ghee-1-6kg', 'Pure Desi Ghee/Clarified Butter', '1.6Kg', 'Pure Desi Ghee/Clarified Butter', '5165', '628451926306', '1.6Kg', 6, 365, 2, 168.00, 'Case of 6'),
    ('product-pure-desi-ghee-3kg', 'Pure Desi Ghee/Clarified Butter', '3.0 Kg', 'Pure Desi Ghee/Clarified Butter', '5167', '628451926989', '3.0 Kg', 1, 365, 2, 54.00, 'Case of 1'),
    ('product-pure-desi-ghee-10kg', 'Pure Desi Ghee/Clarified Butter', '10.0 Kg', 'Pure Desi Ghee/Clarified Butter', '5166', '628451926979', '10.0 Kg', 1, 365, 2, 175.00, 'Case of 1'),
    ('product-item-5175', '18% Sour Cream', '425g', 'Sour Cream', '5175', '628451926450', '425g', 9, 35, 2, 27.00, 'Case of 9'),
    ('product-18-sour-cream-5kg', '18% Sour Cream', '5 Kg', 'Sour Cream', '5176', '628451926467', '5 Kg', 1, 35, 2, 26.00, 'Case of 1'),
    ('product-item-5177', '18% Sour Cream', '10Kg', 'Sour Cream', '5177', '628451926474', '10Kg', 1, 35, 2, 48.00, 'Case of 1'),
    ('product-modhani-paneer-300g', 'Paneer', '300gm', 'Paneer', '5181', '628451926955', '300gm', 30, 45, 2, 120.00, 'Box of 30'),
    ('product-modhani-paneer-1-6kg', 'Paneer', '1.6Kg', 'Paneer', '5182', '628451926962', '1.6Kg', 8, 45, 2, 144.00, 'Box of 8'),
    ('product-modhani-malai-paneer-300g', 'Malai Paneer', '300gm', 'Paneer', '5183', '628451926023', '300gm', 30, 45, 2, 120.00, 'Box of 30'),
    ('product-modhani-malai-paneer-1-6kg', 'Malai Paneer', '1.6Kg', 'Paneer', '5184', '628451926016', '1.6Kg', 6, 45, 2, 108.00, 'Box of 6'),
    ('product-modhani-organic-paneer-300g', 'Organic Paneer', '300gm', 'Paneer', '6103', '628451926030', '300gm', 30, 45, 2, 150.00, 'Box of 30'),
    ('product-makhani-250g', 'Makhani/Whipped Butter', '250gm', 'Makhani', '5190', '628451926412', '250gm', 9, 45, 2, 47.50, 'Tray of 9'),
    ('product-makhani-500g', 'Makhani/Whipped Butter', '500gm', 'Makhani', '5189', '628451926436', '500gm', 8, 45, 2, 76.00, 'Tray of 8'),
    ('product-makhani-1-2kg', 'Makhani/Whipped Butter', '1.2 Kg', 'Makhani', '5191', '628451926429', '1.2 Kg', 4, 45, 2, 84.00, 'Tray of 4'),
    ('product-khoya-1kg', 'Khoya', '1 Kg', 'Khoya', '5126', '628451926702', '1 Kg', 8, 120, 2, 128.00, 'Tray of 8'),
    ('product-item-5192', 'Modhani 3.25% Pasteurized Milk', '4 Lit', 'Milk', '5192', '628451926061', '4 Lit', 4, 18, 2, 30.00, 'Crate of 4'),
    ('product-item-5193', 'Modhani 3.25% Pasteurized Milk', '1.5 Lit', 'Milk', '5193', '628451926078', '1.5 Lit', 9, 18, 2, 36.00, 'Crate of 9'),
    ('product-item-5194', 'Modhani 2% Pasteurized Milk', '4 Lit', 'Milk', '5194', '628451926085', '4 Lit', 4, 18, 2, 28.60, 'Crate of 4'),
    ('product-item-5195', 'Modhani 2% Pasteurized Milk', '1.5 Lit', 'Milk', '5195', '628451926092', '1.5 Lit', 9, 18, 2, 34.20, 'Crate of 9'),
    ('product-item-5004', '2% Halal Yogurt', '750 gm', 'Halal Yogurt', '5004', '628451926054', '750 gm', 6, 45, 2, 11.70, 'Case of 6'),
    ('product-item-5005', '3.2% Halal Yogurt', '750 gm', 'Halal Yogurt', '5005', '628451926047', '750 gm', 6, 45, 2, 11.70, 'Case of 6'),
    ('product-labneh-20-mf-500g', 'Labneh 20% MF', '500g', 'Labneh', null, null, '500g', null, null, null, 0.00, ''),
    ('product-labneh-20-mf-1kg', 'Labneh 20% MF', '1 Kg', 'Labneh', null, null, '1 Kg', null, null, null, 0.00, '')
)
insert into public.products (
  id,
  name,
  unit_size,
  category,
  base_catalogue_price,
  tier_prices,
  item_number,
  upc,
  packaging_details,
  units_per_case,
  shelf_life_days,
  lead_time_days,
  order_unit_label,
  qb_item_name,
  qb_mapping_status
)
select
  id,
  name,
  unit_size,
  category,
  cost_per_case,
  public.modhanios_build_tier_prices(cost_per_case, '{}'::jsonb),
  item_number,
  upc,
  packaging_details,
  units_per_case,
  shelf_life_days,
  lead_time_days,
  nullif(order_unit_label, ''),
  concat_ws(' ', name, unit_size),
  'ready'
from pdf_products
on conflict (id) do update set
  name = excluded.name,
  unit_size = excluded.unit_size,
  category = excluded.category,
  base_catalogue_price = excluded.base_catalogue_price,
  tier_prices = excluded.tier_prices,
  item_number = excluded.item_number,
  upc = excluded.upc,
  packaging_details = excluded.packaging_details,
  units_per_case = excluded.units_per_case,
  shelf_life_days = excluded.shelf_life_days,
  lead_time_days = excluded.lead_time_days,
  order_unit_label = excluded.order_unit_label,
  qb_item_name = excluded.qb_item_name,
  qb_mapping_status = excluded.qb_mapping_status,
  updated_at = timezone('utc', now());

update public.client_product_prices cpp
set price = public.modhanios_product_tier_price(p.tier_prices, p.base_catalogue_price, c.price_tier),
    updated_at = timezone('utc', now())
from public.products p,
     public.clients c
where cpp.product_id = p.id
  and cpp.client_id = c.id;
