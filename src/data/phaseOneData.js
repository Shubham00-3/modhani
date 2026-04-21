export const CURRENT_USER_ID = 'user-001';

export const USERS = [
  {
    id: 'user-001',
    email: 'priya.modhani@modhanios.local',
    name: 'Priya Modhani',
    initials: 'PM',
    role: 'admin',
    permissions: {
      fulfilOrders: true,
      overridePrices: true,
      manageSettings: true,
    },
  },
  {
    id: 'user-002',
    email: 'aman.singh@modhanios.local',
    name: 'Aman Singh',
    initials: 'AS',
    role: 'operations',
    permissions: {
      fulfilOrders: true,
      overridePrices: false,
      manageSettings: false,
    },
  },
  {
    id: 'user-003',
    email: 'roshni.patel@modhanios.local',
    name: 'Roshni Patel',
    initials: 'RP',
    role: 'billing',
    permissions: {
      fulfilOrders: false,
      overridePrices: true,
      manageSettings: false,
    },
  },
];

export const PRODUCTS = [
];

export const CLIENTS = [
];

export const LOCATIONS = [];

export const CLIENT_PRICING = [];

export const QUICKBOOKS_SETTINGS = {
  connected: false,
  companyName: 'Pending client configuration',
  connectorName: 'QuickBooks Desktop Web Connector',
  status: 'setup_pending',
  lastSyncAt: null,
  nextInvoiceSequence: 9101,
};

export const BATCHES = [];

export const ORDERS = [];

export const AUDIT_LOG = [];

export function getProduct(products, productId) {
  return products.find((product) => product.id === productId);
}

export function getProductDisplayName(product) {
  if (!product) return 'Unknown product';
  return `${product.name} ${product.unitSize}`;
}

export function getClientName(clients, clientId) {
  return clients.find((client) => client.id === clientId)?.name ?? 'Unknown client';
}

export function getLocationName(locations, locationId) {
  return locations.find((location) => location.id === locationId)?.name ?? 'Unknown location';
}

export function formatCurrency(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '-';
  return `$${Number(amount).toFixed(2)}`;
}

export function formatDate(dateString) {
  if (!dateString) return '-';
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dateString));
}

export function formatShortDate(dateString) {
  if (!dateString) return '-';
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateString));
}

export function formatTime(dateString) {
  if (!dateString) return '-';
  return new Intl.DateTimeFormat('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(dateString));
}

export function formatDateTime(dateString) {
  if (!dateString) return '-';
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(dateString));
}

export function getEffectiveItemPrice(item) {
  return item.overridePrice ?? item.clientPrice ?? item.basePrice ?? 0;
}

export function getItemOutstandingQty(item) {
  return Math.max(item.quantity - item.fulfilledQty - (item.declinedQty ?? 0), 0);
}

export function getOrderOutstandingQty(order) {
  return order.items.reduce((sum, item) => sum + getItemOutstandingQty(item), 0);
}

export function getOrderFulfilmentBucket(order) {
  if (order.status === 'declined') return 'Declined';
  if (order.items.every((item) => getItemOutstandingQty(item) === 0)) return 'Fully fulfilled';
  if (order.items.some((item) => item.fulfilledQty > 0)) return 'Partial';
  return 'Pending';
}

export function getOrderValue(order) {
  if (order.invoiceTotal != null) return order.invoiceTotal;
  return order.items.reduce((sum, item) => {
    return sum + getEffectiveItemPrice(item) * Math.max(item.quantity - (item.declinedQty ?? 0), 0);
  }, 0);
}

export function getInvoiceableTotal(order) {
  return order.items.reduce((sum, item) => {
    return sum + getEffectiveItemPrice(item) * item.fulfilledQty;
  }, 0);
}

export function getBatchLabel(batches, batchId) {
  return batches.find((batch) => batch.id === batchId)?.batchNumber ?? batchId;
}

export function getClientPricingForProduct(clientPricing, clientId, productId, fallbackPrice = 0) {
  return clientPricing.find((price) => price.clientId === clientId && price.productId === productId)?.price ?? fallbackPrice;
}

export function buildBatchSummary(order, batches) {
  return order.items.flatMap((item) =>
    item.assignedBatches.map((assigned) => ({
      batchNumber: getBatchLabel(batches, assigned.batchId),
      qty: assigned.qty,
      batchId: assigned.batchId,
      productId: item.productId,
    }))
  );
}

export function buildReportRowsFromOrders({ orders, clients, locations, products, batches }) {
  return orders.flatMap((order) =>
    order.items.map((item) => {
      const product = getProduct(products, item.productId);

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        clientId: order.clientId,
        clientName: getClientName(clients, order.clientId),
        locationId: order.locationId,
        locationName: getLocationName(locations, order.locationId),
        productId: item.productId,
        productName: product?.name ?? 'Unknown product',
        unitSize: product?.unitSize ?? '',
        productDisplayName: getProductDisplayName(product),
        category: product?.category ?? '',
        source: order.source,
        status: order.status,
        createdAt: order.createdAt,
        fulfilledAt: order.fulfilledAt,
        invoicedAt: order.invoicedAt,
        shippedAt: order.shippedAt,
        invoiceNumber: order.invoiceNumber,
        qbInvoiceNumber: order.qbInvoiceNumber,
        packingSlipNumber: order.packingSlipNumber,
        batchNumbers: item.assignedBatches.map((assigned) => getBatchLabel(batches, assigned.batchId)).join(', '),
        orderedQty: item.quantity,
        fulfilledQty: item.fulfilledQty,
        declinedQty: item.declinedQty ?? 0,
        outstandingQty: getItemOutstandingQty(item),
        basePrice: item.basePrice,
        clientPrice: item.clientPrice,
        overridePrice: item.overridePrice,
        effectivePrice: getEffectiveItemPrice(item),
        hasPriceOverride: item.overridePrice != null,
        fulfilledValue: item.fulfilledQty * getEffectiveItemPrice(item),
        orderedValue: Math.max(item.quantity - (item.declinedQty ?? 0), 0) * getEffectiveItemPrice(item),
      };
    })
  );
}
