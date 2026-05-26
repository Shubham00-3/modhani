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
      editInvoices: true,
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
      editInvoices: true,
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
      editInvoices: true,
      manageSettings: false,
    },
  },
  {
    id: 'user-driver-001',
    email: 'driver.modhani@modhanios.local',
    name: 'Modhani Driver',
    initials: 'MD',
    role: 'driver',
    permissions: {
      fulfilOrders: false,
      overridePrices: false,
      editInvoices: false,
      manageSettings: false,
    },
  },
];

export const PRODUCTS = [
];

export const MAX_TIERS = 15;

export const TIERS = [];

export const CLIENTS = [
  {
    id: 'client-loblaws',
    name: 'Loblaws',
    tierId: null,
    locationCount: 100,
    emailPackingSlip: true,
    emailInvoice: true,
    deliveryMethod: 'email',
    packingSlipEmail: '',
    invoiceEmail: '',
    qbCustomerName: 'Loblaws',
    qbMappingStatus: 'ready',
  },
  {
    id: 'client-chalo-freshco',
    name: 'Chalo FreshCo',
    tierId: null,
    locationCount: 100,
    emailPackingSlip: true,
    emailInvoice: true,
    deliveryMethod: 'email',
    packingSlipEmail: '',
    invoiceEmail: '',
    qbCustomerName: 'Chalo FreshCo',
    qbMappingStatus: 'ready',
  },
  {
    id: 'client-a1-cash-carry',
    name: 'A1 Cash & Carry',
    tierId: null,
    locationCount: 10,
    emailPackingSlip: true,
    emailInvoice: true,
    deliveryMethod: 'email',
    packingSlipEmail: '',
    invoiceEmail: '',
    qbCustomerName: 'A1 Cash & Carry',
    qbMappingStatus: 'ready',
  },
  {
    id: 'client-desi-stores',
    name: 'Desi Stores',
    tierId: null,
    locationCount: 4,
    emailPackingSlip: true,
    emailInvoice: true,
    deliveryMethod: 'email',
    packingSlipEmail: '',
    invoiceEmail: '',
    qbCustomerName: 'Desi Stores',
    qbMappingStatus: 'ready',
  },
];

export const LOCATIONS = [];

export const CLIENT_PRICING = [];

export const QUICKBOOKS_SETTINGS = {
  connected: false,
  companyName: 'Pending client configuration',
  connectorName: 'QuickBooks Desktop Web Connector',
  status: 'setup_pending',
  lastSyncAt: null,
  connectorLastSeenAt: null,
  failedSyncCount: 0,
  nextInvoiceSequence: 9101,
};

export const BATCHES = [];

export const ORDERS = [];

export const AUDIT_LOG = [];

export function getProduct(products, productId) {
  return products.find((product) => product.id === productId);
}

export function isProductCatalogActive(product) {
  return product?.isCatalogActive !== false;
}

export function getActiveCatalogProducts(products) {
  return products.filter(isProductCatalogActive);
}

export function getProductDisplayName(product) {
  if (!product) return 'Unknown product';
  const name = String(product.name ?? '').trim();
  const unitSize = String(product.unitSize ?? '').trim();
  if (!unitSize) return name || 'Unknown product';

  const normalize = (value) =>
    String(value ?? '')
      .toLowerCase()
      .replace(/\b(grams|gram|gms|gm)\b/g, 'g')
      .replace(/\b(liters|litres|liter|litre|lit)\b/g, 'l')
      .replace(/[^a-z0-9.%]+/g, '');

  return normalize(name).includes(normalize(unitSize)) ? name : `${name} ${unitSize}`;
}

export function getProductOrderUnitLabel(product) {
  const explicitLabel = String(product?.orderUnitLabel ?? '').trim();
  if (explicitLabel) return explicitLabel;

  const unitsPerCase = Number(product?.unitsPerCase);
  if (Number.isFinite(unitsPerCase) && unitsPerCase > 1) {
    return `Case of ${Number.isInteger(unitsPerCase) ? unitsPerCase : unitsPerCase.toLocaleString()}`;
  }

  if (Number.isFinite(unitsPerCase) && unitsPerCase === 1) return 'Each';
  return 'Case';
}

export function getProductUnitsPerCase(product) {
  const unitsPerCase = Number(product?.unitsPerCase);
  return Number.isFinite(unitsPerCase) && unitsPerCase > 0 ? unitsPerCase : 1;
}

export function formatCaseQuantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return '0';
  return quantity.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export const CASE_QUANTITY_STEP = 0.25;

export function isValidCaseQuantityStep(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) return false;
  const stepCount = quantity / CASE_QUANTITY_STEP;
  return Math.abs(stepCount - Math.round(stepCount)) < 0.000001;
}

export function getNextCaseQuantity(value, deltaSteps) {
  const quantity = Number(value) || 0;
  const nextStepCount = Math.max(0, Math.round(quantity / CASE_QUANTITY_STEP) + deltaSteps);
  return Number((nextStepCount * CASE_QUANTITY_STEP).toFixed(2));
}

export function getCaseQuantityUnitCount(product, value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  const rawUnits = quantity * getProductUnitsPerCase(product);
  const roundedUnits = Math.round(rawUnits);
  return Math.abs(rawUnits - roundedUnits) < 0.000001 ? roundedUnits : rawUnits;
}

export function formatCaseQuantityBreakdown(product, value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) return '';

  const unitsPerCase = getProductUnitsPerCase(product);
  const caseLabel = quantity === 1 ? 'case' : 'cases';
  if (unitsPerCase <= 1) return `${formatCaseQuantity(quantity)} ${caseLabel}`;

  const unitCount = getCaseQuantityUnitCount(product, quantity);
  const formattedUnits = unitCount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${formatCaseQuantity(quantity)} ${caseLabel} = ${formattedUnits} units`;
}

export function getClientTier(tiers, clientOrTierId) {
  if (!clientOrTierId) return null;
  const tierId = typeof clientOrTierId === 'string' ? clientOrTierId : clientOrTierId.tierId;
  if (!tierId) return null;
  return tiers.find((tier) => tier.id === tierId) ?? null;
}

export function getTierProductPrice(tier, productId) {
  if (!tier) return null;
  const entry = (tier.products ?? []).find((row) => row.productId === productId);
  if (!entry) return null;
  const price = Number(entry.price);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

export function getTierProductIds(tier) {
  if (!tier) return [];
  return (tier.products ?? []).map((row) => row.productId);
}

export function getClientsForTier(clients, tierId) {
  if (!tierId) return [];
  return clients.filter((client) => client.tierId === tierId);
}

export const PRODUCT_IMAGE_FALLBACK_URL = '/modhani-logo.png';

export function hasProductImage(product) {
  return Boolean((product?.imageUrl || product?.imagePath || '').trim());
}

export function getProductImageUrl(product, options = {}) {
  const imageUrl = (product?.imageUrl || product?.imagePath || '').trim();
  return imageUrl || (options.fallback ? PRODUCT_IMAGE_FALLBACK_URL : '');
}

export function getClientName(clients, clientId) {
  return clients.find((client) => client.id === clientId)?.name ?? 'Unknown client';
}

/**
 * Friendly client label for pickers, tables, and reports. Returns the
 * Operating-As name when set; falls back to the legal name. Pass a client
 * object directly or a (clients, clientId) pair.
 */
export function getClientDisplayName(clientOrClients, maybeClientId) {
  const client = Array.isArray(clientOrClients)
    ? clientOrClients.find((entry) => entry.id === maybeClientId)
    : clientOrClients;
  if (!client) return 'Unknown client';
  const operatingAs = client.operatingAs?.trim();
  return operatingAs || client.name;
}

export function getLocationName(locations, locationId) {
  return locations.find((location) => location.id === locationId)?.name ?? 'Unknown location';
}

export function getQuickBooksSyncLabel(order) {
  if (order.qbSyncStatus === 'pushed') return order.qbInvoiceNumber ?? 'Pushed';
  if (order.qbSyncStatus === 'syncing') return 'Syncing';
  if (order.qbSyncStatus === 'failed') return 'Failed';
  if (order.qbSyncStatus === 'pending') return 'Pending sync';
  return '-';
}

export function isLocationShipToReady(location) {
  return Boolean((location?.qbShipToName || location?.name)?.trim());
}

export function getLotCodeBase(productionDate) {
  const [year, month, day] = String(productionDate ?? '').split('-').map(Number);
  if (!year || !month || !day) return '';

  const current = Date.UTC(year, month - 1, day);
  const start = Date.UTC(year, 0, 1);
  const dayOfYear = Math.floor((current - start) / 86400000) + 1;
  return `${String(year).slice(-2)}${String(dayOfYear).padStart(3, '0')}`;
}

export function getNextLotCode(batches, productionDate) {
  return getLotCodeBase(productionDate);
}

export function normalizeLotCode(lotCode) {
  return String(lotCode ?? '').trim().replace(/^(\d{5})-\d+$/, '$1');
}

export function getOrderShipToSnapshot(order, location) {
  return {
    name: order?.invoiceShipToName ?? location?.name ?? '',
    addressLine1: order?.invoiceAddressLine1 ?? location?.addressLine1 ?? '',
    addressLine2: order?.invoiceAddressLine2 ?? location?.addressLine2 ?? '',
    city: order?.invoiceCity ?? location?.city ?? '',
    province: order?.invoiceProvince ?? location?.province ?? '',
    postalCode: order?.invoicePostalCode ?? location?.postalCode ?? '',
    country: order?.invoiceCountry ?? location?.country ?? 'Canada',
  };
}

export function formatClientLocationScale(client, configuredCount = 0) {
  const plannedCount = Number(client?.locationCount ?? 0);
  if (configuredCount > 0) {
    return `${configuredCount} configured location${configuredCount === 1 ? '' : 's'}`;
  }
  if (plannedCount >= 100) {
    return `Up to ${plannedCount} locations`;
  }
  if (plannedCount > 0) {
    return `${plannedCount} planned location${plannedCount === 1 ? '' : 's'}`;
  }
  return 'No locations configured yet';
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

export function formatTorontoDateTime(dateString) {
  if (!dateString) return '-';
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short',
    timeZone: 'America/Toronto',
  }).format(new Date(dateString));
}

export function getEffectiveItemPrice(item) {
  return item.overridePrice ?? item.clientPrice ?? item.basePrice ?? 0;
}

export function getItemDiscountAmount(item) {
  const raw = Number(item?.discountAmount);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export function getInvoiceLineSubtotal(item) {
  const qty = item.invoiceQty ?? item.fulfilledQty ?? 0;
  return qty * getEffectiveItemPrice(item);
}

export function getInvoiceLineTotal(item) {
  return Math.max(getInvoiceLineSubtotal(item) - getItemDiscountAmount(item), 0);
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
    const billable = Math.max(item.quantity - (item.declinedQty ?? 0), 0);
    const lineSubtotal = getEffectiveItemPrice(item) * billable;
    return sum + Math.max(lineSubtotal - getItemDiscountAmount(item), 0);
  }, 0);
}

export function getInvoiceableTotal(order) {
  return order.items.reduce((sum, item) => {
    const lineSubtotal = getEffectiveItemPrice(item) * item.fulfilledQty;
    return sum + Math.max(lineSubtotal - getItemDiscountAmount(item), 0);
  }, 0);
}

export function getBatchLabel(batches, batchId) {
  return normalizeLotCode(batches.find((batch) => batch.id === batchId)?.batchNumber ?? batchId);
}

export function getClientPricingForProduct(clientPricing, clientId, productId, fallbackPrice = 0) {
  return (
    clientPricing.find(
      (price) => price.clientId === clientId && price.productId === productId && price.isActive !== false
    )?.price ?? fallbackPrice
  );
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
        discountAmount: getItemDiscountAmount(item),
        effectivePrice: getEffectiveItemPrice(item),
        hasPriceOverride: item.overridePrice != null,
        fulfilledValue: Math.max(item.fulfilledQty * getEffectiveItemPrice(item) - getItemDiscountAmount(item), 0),
        orderedValue: Math.max(Math.max(item.quantity - (item.declinedQty ?? 0), 0) * getEffectiveItemPrice(item) - getItemDiscountAmount(item), 0),
      };
    })
  );
}
