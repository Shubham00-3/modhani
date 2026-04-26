-- Controlled QuickBooks Desktop pilot data from the client sample exports.
-- This is intentionally small and repeatable; it is not a bulk import.

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

with pilot_clients (
  id,
  name,
  qb_customer_name,
  location_name,
  location_code,
  city,
  address_line1,
  province,
  postal_code,
  country,
  qb_ship_to_name
) as (
  values
    ('qb-pilot-client-a1-kennedy', 'A1 Cash & Carry - Kennedy Road', 'A1 Cash & Carry-Kennedy Road', 'Kennedy Road', 'KENNEDY', 'Mississauga', '6400 Kennedy Road', 'ON', 'L5T 2Z5', 'Canada', 'A1 Cash & Carry'),
    ('qb-pilot-client-a1-torbram', 'A1 Cash & Carry - Torbram', 'A1 Cash & Carry Torbram', 'Torbram', 'TORBRAM', 'Mississauga', '7300 Torbram Rd Unit #2', 'ON', 'L4T 3X2', 'Canada', 'A1 Cash & Carry Torbram'),
    ('qb-pilot-client-chalo-airport', 'Chalo FreshCo - Airport Road', 'Chalo Freshco #3816 Airport Rd-Brampton', 'Store #3816 Airport Road', '3816', 'Brampton', '10970 Airport Rd', 'ON', 'L6R 0E1', 'Canada', 'Chalo Freshco #3816'),
    ('qb-pilot-client-chalo-cottrell', 'Chalo FreshCo - Cottrelle Blvd', 'Chalo FreshCo #3837 Cottrell Blvd', 'Store #3837 Cottrelle Blvd', '3837', 'Brampton', '3998 Cottrelle Blvd', 'ON', 'L6P 2R1', 'Canada', 'Chalo FreshCo3837'),
    ('qb-pilot-client-freshco-dixie', 'FreshCo - Dixie Road', 'Freshco #3859-3100 Dixie rd-Mississauga', 'Store #3859 Dixie Road', '3859', 'Mississauga', '3100 Dixie Rd', 'ON', 'L4Y 2A6', 'Canada', 'Freshco#3859'),
    ('qb-pilot-client-fortinos-mountainash', 'Fortinos - Mountainash', 'Fortinos #0039 (Mountainash, Brampton)', 'Mountainash Brampton', '0039', 'Brampton', '55 Mountainash Rd', 'ON', 'L6R 1W4', 'Canada', 'Fort Brampton Mountainash'),
    ('qb-pilot-client-loblaws-ramans', 'Loblaws - Raman''s No Frills', 'Loblaws Inc(Raman''s NF)', 'Raman''s NF Brampton', 'RAMANS', 'Brampton', '9920 Airport Rd', 'ON', 'L6S 0C5', 'Canada', 'Raman''s NF Brampton'),
    ('qb-pilot-client-loblaws-wholesale', 'Loblaws - Wholesale Club Brampton', 'Loblaws Inc(Wholesale Club)-WC', 'Wholesale Club Brampton', 'WC-BRAMPTON', 'Brampton', '85 Steeles Ave W', 'ON', 'L6Y 0K3', 'Canada', 'WC Brampton')
)
insert into public.clients (
  id,
  name,
  location_count,
  email_packing_slip,
  email_invoice,
  delivery_method,
  qb_customer_name,
  qb_mapping_status
)
select
  id,
  name,
  1,
  false,
  false,
  'email',
  qb_customer_name,
  'ready'
from pilot_clients
on conflict (id) do update set
  name = excluded.name,
  location_count = excluded.location_count,
  qb_customer_name = excluded.qb_customer_name,
  qb_mapping_status = excluded.qb_mapping_status;

with pilot_clients (
  client_id,
  name,
  code,
  city,
  address_line1,
  province,
  postal_code,
  country,
  qb_ship_to_name
) as (
  values
    ('qb-pilot-client-a1-kennedy', 'Kennedy Road', 'KENNEDY', 'Mississauga', '6400 Kennedy Road', 'ON', 'L5T 2Z5', 'Canada', 'A1 Cash & Carry'),
    ('qb-pilot-client-a1-torbram', 'Torbram', 'TORBRAM', 'Mississauga', '7300 Torbram Rd Unit #2', 'ON', 'L4T 3X2', 'Canada', 'A1 Cash & Carry Torbram'),
    ('qb-pilot-client-chalo-airport', 'Store #3816 Airport Road', '3816', 'Brampton', '10970 Airport Rd', 'ON', 'L6R 0E1', 'Canada', 'Chalo Freshco #3816'),
    ('qb-pilot-client-chalo-cottrell', 'Store #3837 Cottrelle Blvd', '3837', 'Brampton', '3998 Cottrelle Blvd', 'ON', 'L6P 2R1', 'Canada', 'Chalo FreshCo3837'),
    ('qb-pilot-client-freshco-dixie', 'Store #3859 Dixie Road', '3859', 'Mississauga', '3100 Dixie Rd', 'ON', 'L4Y 2A6', 'Canada', 'Freshco#3859'),
    ('qb-pilot-client-fortinos-mountainash', 'Mountainash Brampton', '0039', 'Brampton', '55 Mountainash Rd', 'ON', 'L6R 1W4', 'Canada', 'Fort Brampton Mountainash'),
    ('qb-pilot-client-loblaws-ramans', 'Raman''s NF Brampton', 'RAMANS', 'Brampton', '9920 Airport Rd', 'ON', 'L6S 0C5', 'Canada', 'Raman''s NF Brampton'),
    ('qb-pilot-client-loblaws-wholesale', 'Wholesale Club Brampton', 'WC-BRAMPTON', 'Brampton', '85 Steeles Ave W', 'ON', 'L6Y 0K3', 'Canada', 'WC Brampton')
)
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
select
  concat(client_id, '-location'),
  client_id,
  code,
  city,
  name,
  address_line1,
  null,
  province,
  postal_code,
  country,
  qb_ship_to_name,
  'ready'
from pilot_clients
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

with pilot_products (
  id,
  name,
  unit_size,
  category,
  base_catalogue_price,
  qb_item_name
) as (
  values
    ('qb-pilot-product-5154', '3% Mango Lassi', '1 liters', 'Lassi', 54.00, '5154'),
    ('qb-pilot-product-5153', '3% Mango Lassi', '350 ml', 'Lassi', 36.00, '5153'),
    ('qb-pilot-product-5183', 'Malai Paneer', '300 grams', 'Paneer', 120.00, '5183'),
    ('qb-pilot-product-5184', 'Malai Paneer', '1.6 kg', 'Paneer', 108.00, '5184'),
    ('qb-pilot-product-5117', '3.2% Dahi', '2 kg', 'Dahi', 24.00, '5117'),
    ('qb-pilot-product-5171', 'Premium Desi Ghee', '400 grams', 'Ghee', 180.00, '5171'),
    ('qb-pilot-product-5175', '18% Sour Cream', '425 grams', 'Sour Cream', 23.40, '5175'),
    ('qb-pilot-product-5194', 'Modhani 2% Pasteurized Milk', '4 liters', 'Milk', 28.60, '5194')
)
insert into public.products (
  id,
  name,
  unit_size,
  category,
  base_catalogue_price,
  qb_item_name,
  qb_mapping_status
)
select
  id,
  name,
  unit_size,
  category,
  base_catalogue_price,
  qb_item_name,
  'ready'
from pilot_products
on conflict (id) do update set
  name = excluded.name,
  unit_size = excluded.unit_size,
  category = excluded.category,
  base_catalogue_price = excluded.base_catalogue_price,
  qb_item_name = excluded.qb_item_name,
  qb_mapping_status = excluded.qb_mapping_status;

with pilot_products (id, batch_number, qty_produced, qty_remaining) as (
  values
    ('qb-pilot-product-5154', 'QB-PILOT-5154-01', 600, 600),
    ('qb-pilot-product-5153', 'QB-PILOT-5153-01', 600, 600),
    ('qb-pilot-product-5183', 'QB-PILOT-5183-01', 500, 500),
    ('qb-pilot-product-5184', 'QB-PILOT-5184-01', 400, 400),
    ('qb-pilot-product-5117', 'QB-PILOT-5117-01', 500, 500),
    ('qb-pilot-product-5171', 'QB-PILOT-5171-01', 300, 300),
    ('qb-pilot-product-5175', 'QB-PILOT-5175-01', 300, 300),
    ('qb-pilot-product-5194', 'QB-PILOT-5194-01', 500, 500)
)
insert into public.batches (
  id,
  batch_number,
  product_id,
  production_date,
  qty_produced,
  qty_remaining,
  status
)
select
  concat('batch-', lower(batch_number)),
  batch_number,
  id,
  date '2026-04-26',
  qty_produced,
  qty_remaining,
  'active'
from pilot_products
on conflict (id) do update set
  batch_number = excluded.batch_number,
  product_id = excluded.product_id,
  production_date = excluded.production_date,
  qty_produced = excluded.qty_produced,
  qty_remaining = excluded.qty_remaining,
  status = excluded.status;

with pilot_clients (id) as (
  values
    ('qb-pilot-client-a1-kennedy'),
    ('qb-pilot-client-a1-torbram'),
    ('qb-pilot-client-chalo-airport'),
    ('qb-pilot-client-chalo-cottrell'),
    ('qb-pilot-client-freshco-dixie'),
    ('qb-pilot-client-fortinos-mountainash'),
    ('qb-pilot-client-loblaws-ramans'),
    ('qb-pilot-client-loblaws-wholesale')
),
pilot_products (id, price) as (
  values
    ('qb-pilot-product-5154', 54.00),
    ('qb-pilot-product-5153', 36.00),
    ('qb-pilot-product-5183', 120.00),
    ('qb-pilot-product-5184', 108.00),
    ('qb-pilot-product-5117', 24.00),
    ('qb-pilot-product-5171', 180.00),
    ('qb-pilot-product-5175', 23.40),
    ('qb-pilot-product-5194', 28.60)
)
insert into public.client_product_prices (
  id,
  client_id,
  product_id,
  price
)
select
  concat('qb-pilot-price-', pilot_clients.id, '-', pilot_products.id),
  pilot_clients.id,
  pilot_products.id,
  pilot_products.price
from pilot_clients
cross join pilot_products
on conflict (client_id, product_id) do update set
  price = excluded.price;
