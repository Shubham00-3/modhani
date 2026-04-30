-- Fill exact product image matches found in the supplied ZIP archives.
-- These products existed in the catalogue but had no image_url/image_path.

with image_updates (id, image_url) as (
  values
    ('product-item-5121', '/product-images/balkan-yogurt-10kg.jpg'),
    ('product-item-5122', '/product-images/modhani-5-5-balkan-yogurt-10kg.jpg'),
    ('product-item-5170', '/product-images/clarite-clarified-butter-200g.jpg'),
    ('product-item-5175', '/product-images/18-sour-cream-5kg.jpg'),
    ('product-item-5177', '/product-images/18-sour-cream-5kg.jpg'),
    ('product-item-5178', '/product-images/clarite-blueberry-fruit-jam-500g.jpg'),
    ('product-item-5179', '/product-images/clarite-strawberry-fruit-jam-500g.jpg'),
    ('product-item-5180', '/product-images/clarite-mango-chilli-fruit-jam-500g.jpg'),
    ('product-item-5185', '/product-images/modhani-paneer-300gms.jpg'),
    ('product-item-5186', '/product-images/modhani-malai-paneer-300gms.jpg'),
    ('product-item-5187', '/product-images/modhani-malai-paneer-1-6kgs.jpg'),
    ('product-item-5192', '/product-images/a2-milk-4l-3-25.jpg'),
    ('product-item-5193', '/product-images/a2-milk-1-5l-3-25.jpg'),
    ('product-item-5194', '/product-images/a2-milk-4l-2.jpg'),
    ('product-item-5195', '/product-images/a2-milk-1-5l-2.jpg'),
    ('product-item-cp-01', '/product-images/modhani-2-dahi-750g-official.jpg')
)
update public.products p
set
  image_url = image_updates.image_url,
  image_path = image_updates.image_url
from image_updates
where p.id = image_updates.id;
