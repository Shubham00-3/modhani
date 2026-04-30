-- Product item code and price import from Item List.xlsm
-- Generated from Sheet1 on 2026-04-30.
-- Sellable product rows imported: 92
-- qb_item_name stores the QuickBooks item number/code from the Item column.

alter table public.products
  add column if not exists qb_item_name text,
  add column if not exists qb_mapping_status text not null default 'ready',
  add column if not exists image_url text,
  add column if not exists image_path text;

with item_catalogue (
  id, name, unit_size, category, base_catalogue_price, qb_item_name, image_url
) as (
  values
    ('product-item-5175', '18% Sour Cream', '425 grams', 'Sour Cream', 23.40, '5175', null),
    ('product-item-5186', 'Apna - Malai Paneer', '300 grams', 'Paneer', 90.00, '5186', null),
    ('product-item-6109', 'Walker Dairy, 3.8% Pasteurized Milk', '4 liters', 'Milk', 32.00, '6109', null),
    ('product-item-4101', 'Gulab Jamum', '8 kg', 'Sweets', 65.00, '4101', null),
    ('product-modhani-low-fat-dahi-2-907g', 'Low Fat Dahi', '907 grams', 'Dahi', 13.80, '4998', '/product-images/modhani-low-fat-dahi-2-907gms.jpg'),
    ('product-modhani-whole-milk-dahi-4-907g', 'Whole Milk Dahi', '907 grams', 'Dahi', 13.80, '4999', '/product-images/modhani-whole-milk-dahi-4-907gms.jpg'),
    ('product-item-5000', 'Unsalted Butter', '25 kg', 'Butter', 300.00, '5000', null),
    ('product-modhani-low-fat-dahi-2-2kg', 'Low Fat Dahi', '2 kg', 'Dahi', 24.00, '5001', '/product-images/modhani-low-fat-dahi-2-2kgs.jpg'),
    ('product-modhani-whole-milk-dahi-4-2kg', 'Whole Milk Dahi', '2 kg', 'Dahi', 24.00, '5002', '/product-images/modhani-whole-milk-dahi-4-2kgs.jpg'),
    ('product-item-5003', '2% Dahi', '10 kg', 'Dahi', 23.00, '5003', null),
    ('product-item-5004', '2% Halal Yogurt', '750 grams', 'Yogurt', 11.70, '5004', null),
    ('product-item-5005', '3.2% Halal Yogurt', '750 grams', 'Yogurt', 11.70, '5005', null),
    ('product-2-plain-yogurt-probiotic-750g', '2% Probiotic Yogurt', '750 grams', 'Yogurt', 11.70, '5101', '/product-images/2-plain-yogurt-probiotic-750gms.jpg'),
    ('product-2-plain-yogurt-probiotic-2kg', '2% Probiotic Yogurt', '2 kg', 'Yogurt', 24.00, '5102', '/product-images/2-plain-yogurt-probiotic-2kg.jpg'),
    ('product-dahi-2-750g', '2% Dahi', '750 grams', 'Dahi', 11.70, '5111', '/product-images/dahi-2-750g.jpg'),
    ('product-dahi-3-2-750g', '3.2% Dahi', '750 grams', 'Dahi', 11.70, '5116', '/product-images/dahi-3-2-750g.jpg'),
    ('product-dahi-3-2-2kg', '3.2% Dahi', '2 kg', 'Dahi', 24.00, '5117', '/product-images/dahi-3-2-2kg.jpg'),
    ('product-dahi-3-2-10kg', '3.2% Dahi', '10 kg', 'Dahi', 26.00, '5118', '/product-images/dahi-3-2-10kg.jpg'),
    ('product-balkan-yogurt-10kg', '6% Balkan Yogurt (New)', '10 kg', 'Yogurt', 30.00, '5120', '/product-images/balkan-yogurt-10kg.jpg'),
    ('product-item-5121', '5.9% Balkan Yogurt', '10 kg', 'Yogurt', 30.00, '5121', null),
    ('product-item-5122', '5.5% Balkan Yogurt', 'each', 'Yogurt', 28.00, '5122', null),
    ('product-balkan-yogurt-750g-6', '6% Balkan Yogurt', '750 grams', 'Yogurt', 14.40, '5123', '/product-images/balkan-yogurt-750g-6.jpg'),
    ('product-item-5125', '4% Dahi', '10 kg', 'Dahi', 23.00, '5125', null),
    ('product-khoya-1kg', 'Khoya', '1 kg', 'Khoya', 128.00, '5126', '/product-images/khoya-1-kg.jpg'),
    ('product-2-fbgy-mango-yogurt', '2% Mango Greek Yogurt with Turmeric', '170 grams', 'Yogurt', 32.40, '5135', '/product-images/2-fbgy-mango-yogurt.jpg'),
    ('product-2-fbgy-pineapple-yogurt', '2% Pineapple Greek Yogurt With Turmeric', '170 grams', 'Yogurt', 32.40, '5136', '/product-images/2-fbgy-pineapple-yogurt.jpg'),
    ('product-2-fbgy-blueberry-yogurt', '2% Blueberry Greek Yogurt With Turmeric', '170 grams', 'Yogurt', 32.40, '5137', '/product-images/2-fbgy-blueberry-yogurt.jpg'),
    ('product-2-fbgy-strawberry-yogurt', '2% Strawberry Greek Yogurt with Turmeric', '170 grams', 'Yogurt', 32.40, '5138', '/product-images/2-fbgy-strawberry-yogurt.jpg'),
    ('product-item-5139', '2% Raspberry Greek Yogurt with Turmeric', '170 grams', 'Yogurt', 32.40, '5139', null),
    ('product-item-5140', '2% RedCherry Greek Yogurt with Turmeric', '170 grams', 'Yogurt', 32.40, '5140', null),
    ('product-item-5145', '2% Vanilla Yogurt', '500 grams', 'Yogurt', 2.10, '5145', null),
    ('product-item-5146', '2% Mango Yogurt', '500 grams', 'Yogurt', 2.10, '5146', null),
    ('product-item-5147', '2% Coffee Yogurt', '500 grams', 'Yogurt', 2.10, '5147', null),
    ('product-1-2-ayran-475ml', '1.2% Ayran', '475 ml', 'Lassi', 33.60, '5151', '/product-images/1-2-ayran-475ml.jpg'),
    ('product-2-mint-ayran-473ml', '2% Mint Lassi/Ayran', '473 ml', 'Lassi', 33.60, '5152', '/product-images/2-mint-aryan-473ml.jpg'),
    ('product-3-mango-lassi-350ml', '3% Mango Lassi', '350 ml', 'Lassi', 36.00, '5153', '/product-images/3-mango-lassi-350ml.jpg'),
    ('product-3-mango-lassi-1l', '3% Mango Lassi', '1 liters', 'Lassi', 54.00, '5154', '/product-images/3-mango-lassi-1l.jpg'),
    ('product-pure-desi-ghee-800g', 'Pure Desi Ghee/ Clarified Butter', '800 grams', 'Ghee', 180.00, '5164', '/product-images/pure-desi-ghee-800gms.jpg'),
    ('product-pure-desi-ghee-1-6kg', 'Pure Desi Ghee/ Clarified Butter', '1.6 kg', 'Ghee', 138.00, '5165', '/product-images/pure-desi-ghee-1-6kg.jpg'),
    ('product-pure-desi-ghee-10kg', 'Pure Desi Ghee/ Clarified Butter', '10 kg', 'Ghee', 175.00, '5166', '/product-images/pure-desi-ghee-10kg.jpg'),
    ('product-pure-desi-ghee-3kg', 'Pure Desi Ghee/ Clarified Butter', '3 kg', 'Ghee', 54.00, '5167', '/product-images/pure-desi-ghee-3kg.jpg'),
    ('product-desi-ghee-10kg', 'Premium Desi Ghee/ Clarified Butter', '10 kg', 'Ghee', 195.00, '5169', '/product-images/desi-ghee-10-kg.jpg'),
    ('product-item-5170', 'Premium Desi Ghee/ Clarified Butter', '200 grams', 'Ghee', 84.00, '5170', null),
    ('product-desi-ghee-400g', 'Premium Desi Ghee/ Clarified Butter', '400 grams', 'Ghee', 180.00, '5171', '/product-images/desi-ghee-400gms.jpg'),
    ('product-desi-ghee-800g', 'Premium Desi Ghee/ Clarified Butter', '800 grams', 'Ghee', 255.00, '5172', '/product-images/desi-ghee-800gms.jpg'),
    ('product-desi-ghee-1-6kg', 'Premium Desi Ghee/ Clarified Butter', '1.6 kg', 'Ghee', 192.00, '5173', '/product-images/desi-ghee-1-6kg.jpg'),
    ('product-desi-ghee-3kg', 'Premium Desi Ghee/ Clarified Butter', '3 kg', 'Ghee', 62.00, '5174', '/product-images/desi-ghee-3-kg.jpg'),
    ('product-18-sour-cream-5kg', '18% Sour Cream', '5 kg', 'Sour Cream', 26.00, '5176', '/product-images/18-sour-cream-5kg.jpg'),
    ('product-item-5177', '18% Sour Cream', '10 kg', 'Sour Cream', 48.00, '5177', null),
    ('product-item-5178', 'Blueberry Fruit Jam', '250 grams', 'Jam', 4.00, '5178', null),
    ('product-item-5179', 'Strawberry Fruit Jam', '250 grams', 'Jam', 4.00, '5179', null),
    ('product-item-5180', 'Mango Chilli Fruit Jam', '250 grams', 'Jam', 4.00, '5180', null),
    ('product-modhani-paneer-300g', 'Paneer', '300 grams', 'Paneer', 120.00, '5181', '/product-images/modhani-paneer-300gms.jpg'),
    ('product-modhani-paneer-1-6kg', 'Paneer', '1.6 kg', 'Paneer', 144.00, '5182', '/product-images/modhani-paneer-1-6kgs.jpg'),
    ('product-modhani-malai-paneer-300g', 'Malai Paneer', '300 grams', 'Paneer', 120.00, '5183', '/product-images/modhani-malai-paneer-300gms.jpg'),
    ('product-modhani-malai-paneer-1-6kg', 'Malai Paneer', '1.6 kg', 'Paneer', 108.00, '5184', '/product-images/modhani-malai-paneer-1-6kgs.jpg'),
    ('product-item-5185', 'Mehar Paneer', '300 grams', 'Paneer', 97.50, '5185', null),
    ('product-item-5187', 'Apna - Malai Paneer', '1.6 kg', 'Paneer', 98.00, '5187', null),
    ('product-makhani-500g', 'Makhani/Whipped Butter', '500 grams', 'Butter', 76.00, '5189', '/product-images/makhani-500gms.jpg'),
    ('product-makhani-250g', 'Makhani/Whipped Butter', '250 grams', 'Butter', 47.50, '5190', '/product-images/makhani-250gms.jpg'),
    ('product-makhani-1-2kg', 'Makhani/Whipped Butter', '1.2 kg', 'Butter', 84.00, '5191', '/product-images/makhani-1-2-kg.jpg'),
    ('product-item-5192', 'Modhani, 3.25% Pasteurized Milk', '4 liters', 'Milk', 30.00, '5192', null),
    ('product-item-5193', 'Modhani, 3.25% Pasteurized Milk', '1.5 liters', 'Milk', 36.00, '5193', null),
    ('product-item-5194', 'Modhani, 2% Pasteurized Milk', '4 liters', 'Milk', 28.60, '5194', null),
    ('product-item-5195', 'Modhani, 2% Pasteurized Milk', '1.5 liters', 'Milk', 34.20, '5195', null),
    ('product-item-5200', 'Milk Cake', 'each', 'Milk', 6.50, '5200', null),
    ('product-item-5201', 'Kalakand', 'each', 'Sweets', 6.50, '5201', null),
    ('product-item-5202', 'Khoya Burfi', 'each', 'Khoya', 6.50, '5202', null),
    ('product-item-5203', 'Besan Burfi', 'each', 'Sweets', 5.50, '5203', null),
    ('product-item-5204', 'Motichor Laddu', 'each', 'Sweets', 5.50, '5204', null),
    ('product-item-5205', 'Gulab Jamun in Pail', 'pail', 'Jam', 65.00, '5205', null),
    ('product-item-5207', 'Besan Laddo', 'each', 'Sweets', 6.00, '5207', null),
    ('product-item-5208', 'Besan Laddo', 'each', 'Sweets', 5.50, '5208', null),
    ('product-item-5209', 'Kaju Katli', '350 grams', 'Sweets', 5.25, '5209', null),
    ('product-item-5210', 'Mix Mithai', '350 grams', 'Sweets', 6.25, '5210', null),
    ('product-item-5211', 'Chum Chum', '350 grams', 'Sweets', 5.50, '5211', null),
    ('product-item-5212', 'Yellow Jalebi', '350 grams', 'Sweets', 4.50, '5212', null),
    ('product-item-5300', 'Mild Sav', '300 grams', 'Sweets', 78.00, '5300', null),
    ('product-item-5301', 'Spicy Sav', '300 grams', 'Sweets', 78.00, '5301', null),
    ('product-clarite-organic-yogurt-750g-2', 'Clarite (Product of Modhani) Organic Yogurt-Low Fat 2%', '750 grams', 'Yogurt', 15.00, '6101', '/product-images/clarite-organic-yogurt-750g-2.jpg'),
    ('product-clarite-organic-yogurt-750g-4', 'Clarite (Product of Modhani) Organic Yogurt-Whole Milk 4%', '750 grams', 'Yogurt', 15.00, '6102', '/product-images/clarite-organic-yogurt-750g-4.jpg'),
    ('product-modhani-organic-paneer-300g', 'Modhani Organic Paneer', '300 grams', 'Paneer', 150.00, '6103', '/product-images/modhani-organic-paneer-300gms.jpg'),
    ('product-clarite-clarified-butter-200g', 'Clarite Ghee', '200 grams', 'Ghee', 78.00, '6104', '/product-images/clarite-clarified-butter-200g.jpg'),
    ('product-clarite-clarified-butter-400g', 'Clarite Ghee', '400 grams', 'Ghee', 132.00, '6105', '/product-images/clarite-clarified-butter-400g.jpg'),
    ('product-clarite-mango-chilli-fruit-jam-500g', 'Clarite Mango Jam', '500 grams', 'Jam', 60.00, '6106', '/product-images/clarite-mango-chilli-fruit-jam-500g.jpg'),
    ('product-clarite-blueberry-fruit-jam-500g', 'Clarite Blueberry Jam', '500 grams', 'Jam', 60.00, '6107', '/product-images/clarite-blueberry-fruit-jam-500g.jpg'),
    ('product-clarite-strawberry-fruit-jam-500g', 'Clarite Strawberry Jam', '500 grams', 'Jam', 60.00, '6108', '/product-images/clarite-strawberry-fruit-jam-500g.jpg'),
    ('product-item-cp-01', '4% Dahi', '750 grams', 'Dahi', 10.50, 'CP-01', null),
    ('product-item-cp-02', '1% Oat Yogurt', '200 grams', 'Yogurt', 16.80, 'CP-02', null),
    ('product-item-cp-03', '1% Purple Rice Yogurt', '200 grams', 'Yogurt', 16.80, 'CP-03', null),
    ('product-item-cp-04', '1% White Peach Yogurt', '200 grams', 'Yogurt', 16.80, 'CP-04', null),
    ('product-item-cp-05', 'Jasmine Yogurt', '2 liters', 'Yogurt', 14.70, 'CP-05', null)
)
insert into public.products (
  id, name, unit_size, category, base_catalogue_price, qb_item_name, qb_mapping_status, image_url, image_path
)
select
  id, name, unit_size, category, base_catalogue_price, qb_item_name, 'ready', image_url, image_url
from item_catalogue
on conflict (id) do update set
  name = excluded.name,
  unit_size = excluded.unit_size,
  category = excluded.category,
  base_catalogue_price = excluded.base_catalogue_price,
  qb_item_name = excluded.qb_item_name,
  qb_mapping_status = 'ready',
  image_url = coalesce(excluded.image_url, public.products.image_url),
  image_path = coalesce(excluded.image_path, public.products.image_path);

-- Keep existing client-specific prices aligned only where they were still zero/demo values.
update public.client_product_prices cpp
set price = p.base_catalogue_price
from public.products p
where cpp.product_id = p.id
  and coalesce(cpp.price, 0) = 0;
