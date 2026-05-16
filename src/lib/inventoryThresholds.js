// Centralized inventory thresholds used across the dashboard, overview,
// inventory page, and notification builder. Keep this as the single source of
// truth so the "Running low at X" label always matches when a notification
// actually fires.
export const LOW_STOCK_THRESHOLD = 20;

export function getStockStatus(totalRemaining) {
  if (totalRemaining <= 0) return 'out';
  if (totalRemaining <= LOW_STOCK_THRESHOLD) return 'low';
  return 'in';
}
