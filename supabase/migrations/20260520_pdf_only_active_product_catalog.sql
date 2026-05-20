alter table public.products
  add column if not exists is_catalog_active boolean not null default true;

with allowed_products (id) as (
  values
    ('product-2-plain-yogurt-probiotic-750g'),
    ('product-2-plain-yogurt-probiotic-2kg'),
    ('product-dahi-2-750g'),
    ('product-dahi-3-2-750g'),
    ('product-dahi-3-2-2kg'),
    ('product-dahi-3-2-10kg'),
    ('product-modhani-low-fat-dahi-2-907g'),
    ('product-modhani-whole-milk-dahi-4-907g'),
    ('product-modhani-low-fat-dahi-2-2kg'),
    ('product-modhani-whole-milk-dahi-4-2kg'),
    ('product-item-5122'),
    ('product-balkan-yogurt-750g-6'),
    ('product-2-fbgy-mango-yogurt'),
    ('product-2-fbgy-pineapple-yogurt'),
    ('product-2-fbgy-blueberry-yogurt'),
    ('product-2-fbgy-strawberry-yogurt'),
    ('product-item-5139'),
    ('product-item-5140'),
    ('product-1-2-ayran-475ml'),
    ('product-2-mint-ayran-473ml'),
    ('product-3-mango-lassi-350ml'),
    ('product-3-mango-lassi-1l'),
    ('product-desi-ghee-400g'),
    ('product-desi-ghee-800g'),
    ('product-desi-ghee-1-6kg'),
    ('product-desi-ghee-3kg'),
    ('product-desi-ghee-10kg'),
    ('product-pure-desi-ghee-800g'),
    ('product-pure-desi-ghee-1-6kg'),
    ('product-pure-desi-ghee-3kg'),
    ('product-pure-desi-ghee-10kg'),
    ('product-item-5175'),
    ('product-18-sour-cream-5kg'),
    ('product-item-5177'),
    ('product-modhani-paneer-300g'),
    ('product-modhani-paneer-1-6kg'),
    ('product-modhani-malai-paneer-300g'),
    ('product-modhani-malai-paneer-1-6kg'),
    ('product-modhani-organic-paneer-300g'),
    ('product-makhani-250g'),
    ('product-makhani-500g'),
    ('product-makhani-1-2kg'),
    ('product-khoya-1kg'),
    ('product-item-5192'),
    ('product-item-5193'),
    ('product-item-5194'),
    ('product-item-5195'),
    ('product-item-5004'),
    ('product-item-5005'),
    ('product-labneh-20-mf-500g'),
    ('product-labneh-20-mf-1kg')
)
update public.products p
set
  is_catalog_active = (p.id in (select id from allowed_products)),
  updated_at = timezone('utc', now());

update public.client_product_prices cpp
set
  is_active = false,
  updated_at = timezone('utc', now())
where exists (
  select 1
  from public.products p
  where p.id = cpp.product_id
    and p.is_catalog_active = false
);
