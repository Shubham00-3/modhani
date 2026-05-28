-- Remove the earlier QuickBooks pilot product seed data so the catalogue only contains ZIP-derived products.

with removed_products (id) as (
  values
    ('qb-pilot-product-5154'),
    ('qb-pilot-product-5153'),
    ('qb-pilot-product-5183'),
    ('qb-pilot-product-5184'),
    ('qb-pilot-product-5117'),
    ('qb-pilot-product-5171'),
    ('qb-pilot-product-5175'),
    ('qb-pilot-product-5194')
)
delete from public.quickbooks_sync_jobs
where entity_type = 'product'
  and entity_id in (select id from removed_products);

with removed_products (id) as (
  values
    ('qb-pilot-product-5154'),
    ('qb-pilot-product-5153'),
    ('qb-pilot-product-5183'),
    ('qb-pilot-product-5184'),
    ('qb-pilot-product-5117'),
    ('qb-pilot-product-5171'),
    ('qb-pilot-product-5175'),
    ('qb-pilot-product-5194')
),
removed_orders as (
  select distinct order_id
  from public.order_items
  where product_id in (select id from removed_products)
)
delete from public.orders
where id in (select order_id from removed_orders);

with removed_products (id) as (
  values
    ('qb-pilot-product-5154'),
    ('qb-pilot-product-5153'),
    ('qb-pilot-product-5183'),
    ('qb-pilot-product-5184'),
    ('qb-pilot-product-5117'),
    ('qb-pilot-product-5171'),
    ('qb-pilot-product-5175'),
    ('qb-pilot-product-5194')
)
delete from public.client_product_prices
where product_id in (select id from removed_products);

with removed_products (id) as (
  values
    ('qb-pilot-product-5154'),
    ('qb-pilot-product-5153'),
    ('qb-pilot-product-5183'),
    ('qb-pilot-product-5184'),
    ('qb-pilot-product-5117'),
    ('qb-pilot-product-5171'),
    ('qb-pilot-product-5175'),
    ('qb-pilot-product-5194')
),
removed_batches as (
  select id
  from public.batches
  where product_id in (select id from removed_products)
)
delete from public.batch_assignments
where batch_id in (select id from removed_batches);

with removed_products (id) as (
  values
    ('qb-pilot-product-5154'),
    ('qb-pilot-product-5153'),
    ('qb-pilot-product-5183'),
    ('qb-pilot-product-5184'),
    ('qb-pilot-product-5117'),
    ('qb-pilot-product-5171'),
    ('qb-pilot-product-5175'),
    ('qb-pilot-product-5194')
)
delete from public.batches
where product_id in (select id from removed_products);

with removed_products (id) as (
  values
    ('qb-pilot-product-5154'),
    ('qb-pilot-product-5153'),
    ('qb-pilot-product-5183'),
    ('qb-pilot-product-5184'),
    ('qb-pilot-product-5117'),
    ('qb-pilot-product-5171'),
    ('qb-pilot-product-5175'),
    ('qb-pilot-product-5194')
)
delete from public.products
where id in (select id from removed_products);
