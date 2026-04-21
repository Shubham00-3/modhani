import {
  getClientName,
  getLocationName,
  getOrderOutstandingQty,
  getProduct,
  getProductDisplayName,
} from '../data/phaseOneData';

const LOW_STOCK_THRESHOLD = 150;
const CRITICAL_STOCK_THRESHOLD = 50;
const LATE_PENDING_HOURS = 24;
const LATE_NEXT_STEP_HOURS = 12;
const RECENT_ORDER_WINDOW_HOURS = 24;

function toMillis(value) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatUnits(value) {
  return `${Number(value ?? 0).toLocaleString()} units`;
}

function hoursBetween(now, source) {
  const sourceMillis = toMillis(source);
  if (!sourceMillis) return 0;
  return Math.max((now - sourceMillis) / (1000 * 60 * 60), 0);
}

function getNotificationTimestamp(...candidates) {
  return candidates.find(Boolean) ?? new Date().toISOString();
}

export function formatRelativeTime(dateString) {
  const timestamp = toMillis(dateString);
  if (!timestamp) return '-';

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(Math.floor(diffMs / (1000 * 60)), 0);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} min${diffMinutes === 1 ? '' : 's'} ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks} wk${diffWeeks === 1 ? '' : 's'} ago`;

  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateString));
}

function buildLowStockNotifications({ batches, products }) {
  return batches
    .filter((batch) => batch.status === 'active' && Number(batch.qtyRemaining) > 0 && Number(batch.qtyRemaining) <= LOW_STOCK_THRESHOLD)
    .map((batch) => {
      const product = getProduct(products, batch.productId);
      const severity = Number(batch.qtyRemaining) <= CRITICAL_STOCK_THRESHOLD ? 'critical' : 'warning';
      const timestamp = getNotificationTimestamp(batch.updatedAt, batch.productionDate);

      return {
        key: `low-stock:${batch.id}:${severity}:${timestamp}`,
        type: 'low-stock',
        severity,
        title: `${getProductDisplayName(product)} ${severity === 'critical' ? 'critically low' : 'running low'} — ${formatUnits(batch.qtyRemaining)} remaining`,
        description: `Batch ${batch.batchNumber} is still active and needs replenishment planning.`,
        relatedLabel: batch.batchNumber,
        timestamp,
      };
    });
}

function buildLateOrderNotifications({ orders, clients, locations, now }) {
  return orders.flatMap((order) => {
    const clientName = getClientName(clients, order.clientId);
    const locationName = getLocationName(locations, order.locationId);
    const locationLabel = `${clientName} ${locationName}`.trim();
    const outstandingQty = getOrderOutstandingQty(order);

    if ((order.status === 'pending' || order.status === 'partial') && outstandingQty > 0) {
      const ageHours = hoursBetween(now, order.createdAt);
      if (ageHours >= LATE_PENDING_HOURS) {
        return [{
          key: `late-order:${order.id}:${order.status}:${order.createdAt}`,
          type: 'late-order',
          severity: ageHours >= 48 ? 'critical' : 'warning',
          title: `${formatUnits(outstandingQty)} outstanding — ${locationLabel}`,
          description: `Order #${order.orderNumber} is still ${order.status} after ${Math.floor(ageHours)} hours.`,
          relatedLabel: `Order #${order.orderNumber}`,
          timestamp: order.createdAt,
        }];
      }
    }

    if (order.status === 'fulfilled' && !order.invoiceNumber) {
      const timestamp = order.fulfilledAt ?? order.createdAt;
      const ageHours = hoursBetween(now, timestamp);
      if (ageHours >= LATE_NEXT_STEP_HOURS) {
        return [{
          key: `invoice-pending:${order.id}:${timestamp}`,
          type: 'late-order',
          severity: ageHours >= 24 ? 'critical' : 'warning',
          title: `Invoice pending — ${locationLabel}`,
          description: `Order #${order.orderNumber} was fulfilled ${Math.floor(ageHours)} hours ago and still needs invoicing.`,
          relatedLabel: `Order #${order.orderNumber}`,
          timestamp,
        }];
      }
    }

    if (order.status === 'invoiced' && !order.shippedAt) {
      const timestamp = order.invoicedAt ?? order.createdAt;
      const ageHours = hoursBetween(now, timestamp);
      if (ageHours >= LATE_NEXT_STEP_HOURS) {
        return [{
          key: `shipment-pending:${order.id}:${timestamp}`,
          type: 'late-order',
          severity: ageHours >= 24 ? 'critical' : 'warning',
          title: `Shipment pending — ${locationLabel}`,
          description: `Order #${order.orderNumber} was invoiced ${Math.floor(ageHours)} hours ago and still needs shipment confirmation.`,
          relatedLabel: `Order #${order.orderNumber}`,
          timestamp,
        }];
      }
    }

    return [];
  });
}

function buildRecentOrderNotifications({ orders, auditLog, clients, locations }) {
  const cutoff = Date.now() - RECENT_ORDER_WINDOW_HOURS * 60 * 60 * 1000;

  return auditLog
    .filter((entry) => entry.action === 'order_received' && toMillis(entry.timestamp) >= cutoff)
    .map((entry) => {
      const order = orders.find((candidate) => candidate.id === entry.orderId);
      const totalUnits = order?.items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0) ?? 0;
      const clientName = order ? getClientName(clients, order.clientId) : 'New order';
      const locationName = order ? getLocationName(locations, order.locationId) : '';
      const sourceLabel =
        order?.source === 'edi' ? 'EDI PO received' : order?.source === 'portal' ? 'portal order received' : 'order received';
      const titleSegments = [
        `${clientName} ${sourceLabel}`,
        locationName ? `— ${locationName}` : null,
        totalUnits ? `${formatUnits(totalUnits)}` : null,
      ].filter(Boolean);

      return {
        key: `order-received:${entry.id}`,
        type: 'order-received',
        severity: 'info',
        title: titleSegments.join(' '),
        description: order
          ? `Order #${order.orderNumber} was received and is ready for fulfilment planning.`
          : entry.details,
        relatedLabel: order ? `Order #${order.orderNumber}` : 'Order received',
        timestamp: entry.timestamp,
      };
    });
}

function buildFifoNotifications({ orders, batches, products, clients }) {
  const outstandingLines = orders
    .filter((order) => order.status === 'pending' || order.status === 'partial')
    .flatMap((order) =>
      order.items
        .filter((item) => Math.max(Number(item.quantity ?? 0) - Number(item.fulfilledQty ?? 0) - Number(item.declinedQty ?? 0), 0) > 0)
        .map((item) => ({
          order,
          item,
        }))
    );

  const linesByProductId = outstandingLines.reduce((map, line) => {
    const current = map.get(line.item.productId) ?? [];
    current.push(line);
    map.set(line.item.productId, current);
    return map;
  }, new Map());

  return Array.from(linesByProductId.entries()).flatMap(([productId, lines]) => {
    const oldestBatch = [...batches]
      .filter((batch) => batch.productId === productId && batch.status === 'active' && Number(batch.qtyRemaining) > 0)
      .sort((left, right) => toMillis(left.productionDate) - toMillis(right.productionDate))[0];

    if (!oldestBatch) return [];

    const nextLine = [...lines].sort((left, right) => toMillis(left.order.createdAt) - toMillis(right.order.createdAt))[0];
    if (!nextLine) return [];

    const product = getProduct(products, productId);
    const clientName = getClientName(clients, nextLine.order.clientId);
    const timestamp = getNotificationTimestamp(nextLine.order.createdAt, oldestBatch.updatedAt, oldestBatch.productionDate);

    return [{
      key: `fifo:${oldestBatch.id}:${nextLine.order.id}:${timestamp}`,
      type: 'fifo',
      severity: 'warning',
      title: `Batch ${oldestBatch.batchNumber} FIFO — assign to next ${clientName} order`,
      description: `Use the oldest ${getProductDisplayName(product)} batch against Order #${nextLine.order.orderNumber} first.`,
      relatedLabel: oldestBatch.batchNumber,
      timestamp,
    }];
  });
}

export function buildOperationalNotifications({ orders, batches, auditLog, clients, locations, products }) {
  const now = Date.now();

  return [
    ...buildLowStockNotifications({ batches, products }),
    ...buildLateOrderNotifications({ orders, clients, locations, now }),
    ...buildRecentOrderNotifications({ orders, auditLog, clients, locations }),
    ...buildFifoNotifications({ orders, batches, products, clients }),
  ].sort((left, right) => toMillis(right.timestamp) - toMillis(left.timestamp));
}
