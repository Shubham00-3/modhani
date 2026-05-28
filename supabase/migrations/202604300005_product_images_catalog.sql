-- Add product image support and seed the clear single-SKU images from the supplied Modhani product packs.

alter table public.products
  add column if not exists image_url text,
  add column if not exists image_path text;

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Product images are publicly readable" on storage.objects;
drop policy if exists "Authenticated users can upload product images" on storage.objects;
drop policy if exists "Authenticated users can update product images" on storage.objects;
drop policy if exists "Authenticated users can delete product images" on storage.objects;

create policy "Product images are publicly readable"
on storage.objects
for select
using (bucket_id = 'product-images');

create policy "Authenticated users can upload product images"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'product-images');

create policy "Authenticated users can update product images"
on storage.objects
for update
to authenticated
using (bucket_id = 'product-images')
with check (bucket_id = 'product-images');

create policy "Authenticated users can delete product images"
on storage.objects
for delete
to authenticated
using (bucket_id = 'product-images');

drop function if exists public.modhanios_upsert_product(uuid, text, text, text, text, numeric);
drop function if exists public.modhanios_upsert_product(uuid, text, text, text, text, numeric, text);

create or replace function public.modhanios_upsert_product(
  p_user_id uuid,
  p_id text,
  p_name text,
  p_unit_size text,
  p_category text,
  p_base_catalogue_price numeric,
  p_qb_item_name text default null,
  p_image_url text default null,
  p_image_path text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.modhanios_assert_manage_settings(p_user_id);

  if p_id is null or btrim(p_id) = '' then
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
    qb_item_name,
    qb_mapping_status,
    image_url,
    image_path
  )
  values (
    btrim(p_id),
    btrim(p_name),
    btrim(p_unit_size),
    nullif(btrim(coalesce(p_category, '')), ''),
    greatest(coalesce(p_base_catalogue_price, 0), 0),
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
    qb_item_name = excluded.qb_item_name,
    qb_mapping_status = excluded.qb_mapping_status,
    image_url = excluded.image_url,
    image_path = excluded.image_path;
end;
$$;

revoke all on function public.modhanios_upsert_product(uuid, text, text, text, text, numeric, text, text, text) from public;
grant execute on function public.modhanios_upsert_product(uuid, text, text, text, text, numeric, text, text, text) to authenticated;

with product_images (
  id,
  name,
  unit_size,
  category,
  base_catalogue_price,
  qb_item_name,
  image_url
) as (
  values
    ('product-1-2-ayran-475ml', '1.2% Ayran', '475 ml', 'Ayran', 0.00, '1.2% Ayran 475 ml', '/product-images/1-2-ayran-475ml.jpg'),
    ('product-18-sour-cream-5kg', '18% Sour Cream', '5 kg', 'Sour Cream', 0.00, '18% Sour Cream 5 kg', '/product-images/18-sour-cream-5kg.jpg'),
    ('product-2-mint-ayran-473ml', '2% Mint Ayran', '473 ml', 'Ayran', 0.00, '2% Mint Ayran 473 ml', '/product-images/2-mint-aryan-473ml.jpg'),
    ('product-2-plain-yogurt-probiotic-2kg', '2% Plain Yogurt Probiotic', '2 kg', 'Yogurt', 0.00, '2% Plain Yogurt Probiotic 2 kg', '/product-images/2-plain-yogurt-probiotic-2kg.jpg'),
    ('product-2-plain-yogurt-probiotic-750g', '2% Plain Yogurt Probiotic', '750 grams', 'Yogurt', 0.00, '2% Plain Yogurt Probiotic 750 grams', '/product-images/2-plain-yogurt-probiotic-750gms.jpg'),
    ('product-3-mango-lassi-1l', '3% Mango Lassi', '1 liters', 'Lassi', 0.00, '3% Mango Lassi 1 liters', '/product-images/3-mango-lassi-1l.jpg'),
    ('product-3-mango-lassi-350ml', '3% Mango Lassi', '350 ml', 'Lassi', 0.00, '3% Mango Lassi 350 ml', '/product-images/3-mango-lassi-350ml.jpg'),
    ('product-a2-milk-1-5l-2', 'A2 Milk 2%', '1.5 liters', 'Milk', 0.00, 'A2 Milk 2% 1.5 liters', '/product-images/a2-milk-1-5l-2.jpg'),
    ('product-a2-milk-1-5l-3-25', 'A2 Milk 3.25%', '1.5 liters', 'Milk', 0.00, 'A2 Milk 3.25% 1.5 liters', '/product-images/a2-milk-1-5l-3-25.jpg'),
    ('product-a2-milk-4l-2', 'A2 Milk 2%', '4 liters', 'Milk', 0.00, 'A2 Milk 2% 4 liters', '/product-images/a2-milk-4l-2.jpg'),
    ('product-a2-milk-4l-3-25', 'A2 Milk 3.25%', '4 liters', 'Milk', 0.00, 'A2 Milk 3.25% 4 liters', '/product-images/a2-milk-4l-3-25.jpg'),
    ('product-balkan-yogurt-10kg', 'Balkan Yogurt', '10 kg', 'Yogurt', 0.00, 'Balkan Yogurt 10 kg', '/product-images/balkan-yogurt-10kg.jpg'),
    ('product-balkan-yogurt-750g-6', 'Balkan Yogurt 6%', '750 grams', 'Yogurt', 0.00, 'Balkan Yogurt 6% 750 grams', '/product-images/balkan-yogurt-750g-6.jpg'),
    ('product-clarite-organic-yogurt-750g-2', 'Clarite Organic Yogurt 2%', '750 grams', 'Yogurt', 0.00, 'Clarite Organic Yogurt 2% 750 grams', '/product-images/clarite-organic-yogurt-750g-2.jpg'),
    ('product-clarite-organic-yogurt-750g-4', 'Clarite Organic Yogurt 4%', '750 grams', 'Yogurt', 0.00, 'Clarite Organic Yogurt 4% 750 grams', '/product-images/clarite-organic-yogurt-750g-4.jpg'),
    ('product-dahi-2-750g', 'Dahi 2%', '750 grams', 'Dahi', 0.00, 'Dahi 2% 750 grams', '/product-images/dahi-2-750g.jpg'),
    ('product-dahi-3-2-10kg', 'Dahi 3.2%', '10 kg', 'Dahi', 0.00, 'Dahi 3.2% 10 kg', '/product-images/dahi-3-2-10kg.jpg'),
    ('product-dahi-3-2-2kg', 'Dahi 3.2%', '2 kg', 'Dahi', 0.00, 'Dahi 3.2% 2 kg', '/product-images/dahi-3-2-2kg.jpg'),
    ('product-dahi-3-2-750g', 'Dahi 3.2%', '750 grams', 'Dahi', 0.00, 'Dahi 3.2% 750 grams', '/product-images/dahi-3-2-750g.jpg'),
    ('product-desi-ghee-1-6kg', 'Desi Ghee', '1.6 kg', 'Ghee', 0.00, 'Desi Ghee 1.6 kg', '/product-images/desi-ghee-1-6kg.jpg'),
    ('product-desi-ghee-10kg', 'Desi Ghee', '10 kg', 'Ghee', 0.00, 'Desi Ghee 10 kg', '/product-images/desi-ghee-10-kg.jpg'),
    ('product-desi-ghee-3kg', 'Desi Ghee', '3 kg', 'Ghee', 0.00, 'Desi Ghee 3 kg', '/product-images/desi-ghee-3-kg.jpg'),
    ('product-desi-ghee-400g', 'Desi Ghee', '400 grams', 'Ghee', 0.00, 'Desi Ghee 400 grams', '/product-images/desi-ghee-400gms.jpg'),
    ('product-desi-ghee-800g', 'Desi Ghee', '800 grams', 'Ghee', 0.00, 'Desi Ghee 800 grams', '/product-images/desi-ghee-800gms.jpg'),
    ('product-khoya-1kg', 'Khoya', '1 kg', 'Khoya', 0.00, 'Khoya 1 kg', '/product-images/khoya-1-kg.jpg'),
    ('product-makhani-1-2kg', 'Makhani', '1.2 kg', 'Makhani', 0.00, 'Makhani 1.2 kg', '/product-images/makhani-1-2-kg.jpg'),
    ('product-makhani-250g', 'Makhani', '250 grams', 'Makhani', 0.00, 'Makhani 250 grams', '/product-images/makhani-250gms.jpg'),
    ('product-makhani-500g', 'Makhani', '500 grams', 'Makhani', 0.00, 'Makhani 500 grams', '/product-images/makhani-500gms.jpg'),
    ('product-modhani-low-fat-dahi-2-2kg', 'Modhani Low Fat Dahi 2%', '2 kg', 'Dahi', 0.00, 'Modhani Low Fat Dahi 2% 2 kg', '/product-images/modhani-low-fat-dahi-2-2kgs.jpg'),
    ('product-modhani-low-fat-dahi-2-907g', 'Modhani Low Fat Dahi 2%', '907 grams', 'Dahi', 0.00, 'Modhani Low Fat Dahi 2% 907 grams', '/product-images/modhani-low-fat-dahi-2-907gms.jpg'),
    ('product-modhani-malai-paneer-1-6kg', 'Modhani Malai Paneer', '1.6 kg', 'Paneer', 0.00, 'Modhani Malai Paneer 1.6 kg', '/product-images/modhani-malai-paneer-1-6kgs.jpg'),
    ('product-modhani-malai-paneer-300g', 'Modhani Malai Paneer', '300 grams', 'Paneer', 0.00, 'Modhani Malai Paneer 300 grams', '/product-images/modhani-malai-paneer-300gms.jpg'),
    ('product-modhani-organic-paneer-300g', 'Modhani Organic Paneer', '300 grams', 'Paneer', 0.00, 'Modhani Organic Paneer 300 grams', '/product-images/modhani-organic-paneer-300gms.jpg'),
    ('product-modhani-paneer-1-6kg', 'Modhani Paneer', '1.6 kg', 'Paneer', 0.00, 'Modhani Paneer 1.6 kg', '/product-images/modhani-paneer-1-6kgs.jpg'),
    ('product-modhani-paneer-300g', 'Modhani Paneer', '300 grams', 'Paneer', 0.00, 'Modhani Paneer 300 grams', '/product-images/modhani-paneer-300gms.jpg'),
    ('product-modhani-whole-milk-dahi-4-2kg', 'Modhani Whole Milk Dahi 4%', '2 kg', 'Dahi', 0.00, 'Modhani Whole Milk Dahi 4% 2 kg', '/product-images/modhani-whole-milk-dahi-4-2kgs.jpg'),
    ('product-modhani-whole-milk-dahi-4-907g', 'Modhani Whole Milk Dahi 4%', '907 grams', 'Dahi', 0.00, 'Modhani Whole Milk Dahi 4% 907 grams', '/product-images/modhani-whole-milk-dahi-4-907gms.jpg'),
    ('product-pinni-1kg', 'Pinni', '1 kg', 'Sweets', 0.00, 'Pinni 1 kg', '/product-images/pinni-1kg.jpg'),
    ('product-pinni-500g', 'Pinni', '500 grams', 'Sweets', 0.00, 'Pinni 500 grams', '/product-images/pinni-500g.jpg'),
    ('product-pure-desi-ghee-1-6kg', 'Pure Desi Ghee', '1.6 kg', 'Ghee', 0.00, 'Pure Desi Ghee 1.6 kg', '/product-images/pure-desi-ghee-1-6kg.jpg'),
    ('product-pure-desi-ghee-10kg', 'Pure Desi Ghee', '10 kg', 'Ghee', 0.00, 'Pure Desi Ghee 10 kg', '/product-images/pure-desi-ghee-10kg.jpg'),
    ('product-pure-desi-ghee-3kg', 'Pure Desi Ghee', '3 kg', 'Ghee', 0.00, 'Pure Desi Ghee 3 kg', '/product-images/pure-desi-ghee-3kg.jpg'),
    ('product-pure-desi-ghee-800g', 'Pure Desi Ghee', '800 grams', 'Ghee', 0.00, 'Pure Desi Ghee 800 grams', '/product-images/pure-desi-ghee-800gms.jpg'),
    ('product-clarite-blueberry-fruit-jam-500g', 'Clarite Blueberry Fruit Jam', '500 grams', 'Jam', 0.00, 'Clarite Blueberry Fruit Jam 500 grams', '/product-images/clarite-blueberry-fruit-jam-500g.jpg'),
    ('product-clarite-clarified-butter-200g', 'Clarite Clarified Butter', '200 grams', 'Clarified Butter', 0.00, 'Clarite Clarified Butter 200 grams', '/product-images/clarite-clarified-butter-200g.jpg'),
    ('product-clarite-clarified-butter-400g', 'Clarite Clarified Butter', '400 grams', 'Clarified Butter', 0.00, 'Clarite Clarified Butter 400 grams', '/product-images/clarite-clarified-butter-400g.jpg'),
    ('product-clarite-honey-1kg', 'Clarite Honey', '1 kg', 'Honey', 0.00, 'Clarite Honey 1 kg', '/product-images/clarite-honey-1kg-1.jpg'),
    ('product-clarite-honey-500g', 'Clarite Honey', '500 grams', 'Honey', 0.00, 'Clarite Honey 500 grams', '/product-images/clarite-honey-500g.jpg'),
    ('product-clarite-mango-chilli-fruit-jam-500g', 'Clarite Mango Chilli Fruit Jam', '500 grams', 'Jam', 0.00, 'Clarite Mango Chilli Fruit Jam 500 grams', '/product-images/clarite-mango-chilli-fruit-jam-500g.jpg'),
    ('product-clarite-strawberry-fruit-jam-500g', 'Clarite Strawberry Fruit Jam', '500 grams', 'Jam', 0.00, 'Clarite Strawberry Fruit Jam 500 grams', '/product-images/clarite-strawberry-fruit-jam-500g.jpg')
)
insert into public.products (
  id,
  name,
  unit_size,
  category,
  base_catalogue_price,
  qb_item_name,
  qb_mapping_status,
  image_url,
  image_path
)
select
  id,
  name,
  unit_size,
  category,
  base_catalogue_price,
  qb_item_name,
  'ready',
  image_url,
  image_url
from product_images
on conflict (id) do update set
  name = excluded.name,
  unit_size = excluded.unit_size,
  category = excluded.category,
  base_catalogue_price = case
    when public.products.base_catalogue_price > 0 then public.products.base_catalogue_price
    else excluded.base_catalogue_price
  end,
  qb_item_name = coalesce(nullif(public.products.qb_item_name, ''), excluded.qb_item_name),
  qb_mapping_status = public.products.qb_mapping_status,
  image_url = excluded.image_url,
  image_path = excluded.image_path;
