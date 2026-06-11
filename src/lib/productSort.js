// Numeric-aware comparison of product item numbers so 5110 sorts before 5112
// (not lexicographically), and 6000 before 5000 when reversed. Blank/missing
// item numbers always sort last, regardless of direction.
//
// Shared by the Inventory, Products, and Production pages so the "Sort by Item
// Number (A-Z / Z-A)" behaviour stays identical everywhere.
export function compareItemNumbers(a, b, dir = 'asc') {
  const aValue = a == null ? '' : String(a).trim();
  const bValue = b == null ? '' : String(b).trim();
  if (!aValue && !bValue) return 0;
  if (!aValue) return 1;
  if (!bValue) return -1;
  const result = aValue.localeCompare(bValue, undefined, { numeric: true, sensitivity: 'base' });
  return dir === 'desc' ? -result : result;
}
