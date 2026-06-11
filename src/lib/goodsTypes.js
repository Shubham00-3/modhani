// Goods-type classification for catalogue products.
//
// Lets staff label each product as a finished good, an unfinished (work in
// progress) good, a raw material, or a packaging material, and filter the
// Inventory list by that bucket. Stored on `products.goods_type`; defaults to
// 'finished' for every existing product. Shared by the Inventory filter and the
// Product editor so labels and the canonical value set stay in one place.
export const GOODS_TYPES = [
  { value: 'finished', label: 'Finished goods' },
  { value: 'unfinished', label: 'Unfinished goods' },
  { value: 'raw', label: 'Raw materials' },
  { value: 'packaging', label: 'Packaging material' },
];

export const DEFAULT_GOODS_TYPE = 'finished';

const GOODS_TYPE_LABELS = Object.fromEntries(GOODS_TYPES.map((type) => [type.value, type.label]));

// Normalize any stored/blank value to a known goods-type key (falls back to the
// default), so legacy rows without the column still classify cleanly.
export function normalizeGoodsType(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return GOODS_TYPE_LABELS[key] ? key : DEFAULT_GOODS_TYPE;
}

export function getGoodsTypeLabel(value) {
  return GOODS_TYPE_LABELS[normalizeGoodsType(value)];
}
