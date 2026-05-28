-- Refresh product images from official Modhani product pages supplied on 2026-04-30.
-- These mappings prefer exact official product-page photos over earlier ZIP or fallback matches.

with official_image_updates (id, image_url) as (
  values
    ('product-dahi-2-750g', '/product-images/modhani-2-dahi-750g-official.jpg'),
    ('product-dahi-3-2-750g', '/product-images/modhani-3-2-dahi-750g-official.jpg'),
    ('product-dahi-3-2-10kg', '/product-images/modhani-3-2-dahi-10kg-official.jpg'),
    ('product-modhani-whole-milk-dahi-4-907g', '/product-images/modhani-4-whole-milk-dahi-907g-official.jpg'),
    ('product-modhani-whole-milk-dahi-4-2kg', '/product-images/modhani-4-whole-milk-dahi-2kg-official.jpg'),
    ('product-2-plain-yogurt-probiotic-750g', '/product-images/modhani-2-probiotic-yogurt-750g-official.jpg'),
    ('product-2-plain-yogurt-probiotic-2kg', '/product-images/modhani-2-probiotic-yogurt-2kg-official.jpg'),
    ('product-2-fbgy-blueberry-yogurt', '/product-images/modhani-2-blueberry-fbgy-170g-official.jpg'),
    ('product-2-fbgy-mango-yogurt', '/product-images/modhani-2-mango-fbgy-170g-official.jpg'),
    ('product-2-fbgy-strawberry-yogurt', '/product-images/modhani-2-strawberry-fbgy-170g-official.jpg'),
    ('product-2-fbgy-pineapple-yogurt', '/product-images/modhani-2-pineapple-fbgy-170g-official.jpg'),
    ('product-item-5122', '/product-images/modhani-5-5-balkan-yogurt-10kg.jpg'),
    ('product-item-5194', '/product-images/modhani-a2-milk-2-4l-official.jpg'),
    ('product-item-5192', '/product-images/modhani-a2-milk-3-25-4l-official.jpg')
)
update public.products p
set
  image_url = official_image_updates.image_url,
  image_path = official_image_updates.image_url
from official_image_updates
where p.id = official_image_updates.id;

-- CP-01 is a private-label 4% Dahi item, not the official Modhani 2% Dahi 750g page.
update public.products
set
  image_url = null,
  image_path = null
where id = 'product-item-cp-01'
  and image_url = '/product-images/modhani-2-dahi-750g-official.jpg';
