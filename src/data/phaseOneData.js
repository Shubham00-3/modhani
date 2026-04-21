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
  { id: 'prod-001', name: 'Dahi', unitSize: '500g', category: 'Yogurt', baseCataloguePrice: 5.5 },
  { id: 'prod-002', name: 'Dahi', unitSize: '1kg', category: 'Yogurt', baseCataloguePrice: 9 },
  { id: 'prod-003', name: 'Lassi Mango', unitSize: '1L', category: 'Lassi', baseCataloguePrice: 6 },
  { id: 'prod-004', name: 'Lassi Plain', unitSize: '1L', category: 'Lassi', baseCataloguePrice: 5 },
  { id: 'prod-005', name: 'Paneer', unitSize: '400g', category: 'Cheese', baseCataloguePrice: 8 },
  { id: 'prod-006', name: 'Raita', unitSize: '250ml', category: 'Yogurt', baseCataloguePrice: 3.5 },
];

export const CLIENTS = [
  {
    id: 'client-001',
    name: 'Loblaws',
    locationCount: 100,
    emailPackingSlip: true,
    emailInvoice: true,
    deliveryMethod: 'edi',
    packingSlipEmail: 'loblaws-shipments@example.com',
    invoiceEmail: 'loblaws-ap@example.com',
  },
  {
    id: 'client-002',
    name: 'Chalo FreshCo',
    locationCount: 100,
    emailPackingSlip: true,
    emailInvoice: true,
    deliveryMethod: 'both',
    packingSlipEmail: 'freshco-logistics@example.com',
    invoiceEmail: 'freshco-finance@example.com',
  },
  {
    id: 'client-003',
    name: 'A1 Cash & Carry',
    locationCount: 10,
    emailPackingSlip: true,
    emailInvoice: false,
    deliveryMethod: 'email',
    packingSlipEmail: 'a1-receiving@example.com',
    invoiceEmail: 'a1-billing@example.com',
  },
  {
    id: 'client-004',
    name: 'Desi Stores',
    locationCount: 4,
    emailPackingSlip: false,
    emailInvoice: true,
    deliveryMethod: 'email',
    packingSlipEmail: 'desi-warehouse@example.com',
    invoiceEmail: 'desi-ap@example.com',
  },
];

export const LOCATIONS = [
  { id: 'loc-001', clientId: 'client-001', code: '07', city: 'Brampton', name: 'Location 07 - Brampton' },
  { id: 'loc-002', clientId: 'client-001', code: '12', city: 'Mississauga', name: 'Location 12 - Mississauga' },
  { id: 'loc-003', clientId: 'client-001', code: '22', city: 'Vaughan', name: 'Location 22 - Vaughan' },
  { id: 'loc-004', clientId: 'client-001', code: '31', city: 'Scarborough', name: 'Location 31 - Scarborough' },
  { id: 'loc-005', clientId: 'client-002', code: '05', city: 'Brampton', name: 'Location 05 - Brampton' },
  { id: 'loc-006', clientId: 'client-002', code: '12', city: 'Mississauga', name: 'Location 12 - Mississauga' },
  { id: 'loc-007', clientId: 'client-002', code: '18', city: 'Ajax', name: 'Location 18 - Ajax' },
  { id: 'loc-008', clientId: 'client-003', code: '03', city: 'Etobicoke', name: 'Store 03 - Etobicoke' },
  { id: 'loc-009', clientId: 'client-003', code: '07', city: 'Mississauga', name: 'Store 07 - Mississauga' },
  { id: 'loc-010', clientId: 'client-004', code: '01', city: 'Scarborough', name: 'Store 01 - Scarborough' },
  { id: 'loc-011', clientId: 'client-004', code: '02', city: 'Markham', name: 'Store 02 - Markham' },
];

export const CLIENT_PRICING = [
  { id: 'cp-001', clientId: 'client-001', productId: 'prod-001', price: 5 },
  { id: 'cp-002', clientId: 'client-001', productId: 'prod-002', price: 8.5 },
  { id: 'cp-003', clientId: 'client-001', productId: 'prod-003', price: 5.5 },
  { id: 'cp-004', clientId: 'client-001', productId: 'prod-004', price: 4.5 },
  { id: 'cp-005', clientId: 'client-001', productId: 'prod-005', price: 7.5 },
  { id: 'cp-006', clientId: 'client-001', productId: 'prod-006', price: 3.2 },
  { id: 'cp-007', clientId: 'client-002', productId: 'prod-001', price: 5.5 },
  { id: 'cp-008', clientId: 'client-002', productId: 'prod-002', price: 8.9 },
  { id: 'cp-009', clientId: 'client-002', productId: 'prod-003', price: 5.75 },
  { id: 'cp-010', clientId: 'client-002', productId: 'prod-005', price: 7.85 },
  { id: 'cp-011', clientId: 'client-003', productId: 'prod-001', price: 7 },
  { id: 'cp-012', clientId: 'client-003', productId: 'prod-002', price: 11 },
  { id: 'cp-013', clientId: 'client-003', productId: 'prod-005', price: 9.5 },
  { id: 'cp-014', clientId: 'client-004', productId: 'prod-001', price: 6.5 },
  { id: 'cp-015', clientId: 'client-004', productId: 'prod-005', price: 8.5 },
  { id: 'cp-016', clientId: 'client-004', productId: 'prod-006', price: 4 },
];

export const QUICKBOOKS_SETTINGS = {
  connected: true,
  companyName: 'Modhani Foods Inc.',
  connectorName: 'Desktop Sync Connector',
  status: 'connected',
  lastSyncAt: '2026-04-14T14:47:00',
  nextInvoiceSequence: 9103,
};

export const BATCHES = [
  { id: 'batch-001', batchNumber: 'B-3010', productId: 'prod-001', productionDate: '2026-04-08', qtyProduced: 1000, qtyRemaining: 500, status: 'active' },
  { id: 'batch-002', batchNumber: 'B-3011', productId: 'prod-001', productionDate: '2026-04-10', qtyProduced: 800, qtyRemaining: 300, status: 'active' },
  { id: 'batch-003', batchNumber: 'B-3012', productId: 'prod-001', productionDate: '2026-04-13', qtyProduced: 900, qtyRemaining: 900, status: 'active' },
  { id: 'batch-004', batchNumber: 'B-3013', productId: 'prod-003', productionDate: '2026-04-09', qtyProduced: 600, qtyRemaining: 120, status: 'active' },
  { id: 'batch-005', batchNumber: 'B-3014', productId: 'prod-005', productionDate: '2026-04-11', qtyProduced: 400, qtyRemaining: 250, status: 'active' },
  { id: 'batch-006', batchNumber: 'B-3015', productId: 'prod-006', productionDate: '2026-04-12', qtyProduced: 700, qtyRemaining: 700, status: 'active' },
  { id: 'batch-007', batchNumber: 'B-3016', productId: 'prod-004', productionDate: '2026-04-12', qtyProduced: 500, qtyRemaining: 240, status: 'active' },
  { id: 'batch-008', batchNumber: 'B-3017', productId: 'prod-002', productionDate: '2026-04-11', qtyProduced: 600, qtyRemaining: 420, status: 'active' },
  { id: 'batch-009', batchNumber: 'B-3009', productId: 'prod-001', productionDate: '2026-04-05', qtyProduced: 400, qtyRemaining: 0, status: 'cleared' },
];

export const ORDERS = [
  {
    id: 'order-001',
    orderNumber: 1041,
    clientId: 'client-001',
    locationId: 'loc-001',
    source: 'edi',
    status: 'shipped',
    lockedBy: null,
    lockedAt: null,
    invoiceNumber: 'MOD-1041',
    invoiceTotal: 5000,
    qbInvoiceNumber: 'INV-9101',
    qbSyncStatus: 'pushed',
    packingSlipNumber: 'PS-1041',
    createdAt: '2026-04-11T09:14:00',
    fulfilledAt: '2026-04-11T10:30:00',
    invoicedAt: '2026-04-11T11:00:00',
    qbSyncedAt: '2026-04-11T11:12:00',
    shippedAt: '2026-04-11T14:00:00',
    declinedAt: null,
    declineReason: null,
    packingSlipSentAt: '2026-04-11T14:05:00',
    invoiceEmailSentAt: '2026-04-11T11:03:00',
    items: [
      {
        id: 'oi-001',
        productId: 'prod-001',
        quantity: 1000,
        fulfilledQty: 1000,
        basePrice: 5.5,
        clientPrice: 5,
        overridePrice: null,
        overrideReason: null,
        assignedBatches: [
          { batchId: 'batch-009', qty: 400 },
          { batchId: 'batch-001', qty: 500 },
          { batchId: 'batch-002', qty: 100 },
        ],
      },
    ],
  },
  {
    id: 'order-002',
    orderNumber: 1042,
    clientId: 'client-002',
    locationId: 'loc-006',
    source: 'portal',
    status: 'invoiced',
    lockedBy: null,
    lockedAt: null,
    invoiceNumber: 'MOD-1042',
    invoiceTotal: 2760,
    qbInvoiceNumber: null,
    qbSyncStatus: 'pending',
    packingSlipNumber: null,
    createdAt: '2026-04-12T08:25:00',
    fulfilledAt: '2026-04-12T09:10:00',
    invoicedAt: '2026-04-12T09:40:00',
    qbSyncedAt: null,
    shippedAt: null,
    declinedAt: null,
    declineReason: null,
    packingSlipSentAt: null,
    invoiceEmailSentAt: '2026-04-12T09:42:00',
    items: [
      {
        id: 'oi-002',
        productId: 'prod-003',
        quantity: 480,
        fulfilledQty: 480,
        basePrice: 6,
        clientPrice: 5.75,
        overridePrice: null,
        overrideReason: null,
        assignedBatches: [{ batchId: 'batch-004', qty: 480 }],
      },
    ],
  },
  {
    id: 'order-003',
    orderNumber: 1043,
    clientId: 'client-003',
    locationId: 'loc-008',
    source: 'portal',
    status: 'partial',
    lockedBy: null,
    lockedAt: null,
    invoiceNumber: null,
    invoiceTotal: null,
    qbInvoiceNumber: null,
    qbSyncStatus: 'pending',
    packingSlipNumber: null,
    createdAt: '2026-04-13T10:02:00',
    fulfilledAt: '2026-04-13T11:15:00',
    invoicedAt: null,
    qbSyncedAt: null,
    shippedAt: null,
    declinedAt: null,
    declineReason: null,
    packingSlipSentAt: null,
    invoiceEmailSentAt: null,
    items: [
      {
        id: 'oi-003',
        productId: 'prod-002',
        quantity: 300,
        fulfilledQty: 180,
        basePrice: 9,
        clientPrice: 11,
        overridePrice: null,
        overrideReason: null,
        assignedBatches: [{ batchId: 'batch-008', qty: 180 }],
      },
    ],
  },
  {
    id: 'order-004',
    orderNumber: 1044,
    clientId: 'client-004',
    locationId: 'loc-010',
    source: 'portal',
    status: 'pending',
    lockedBy: null,
    lockedAt: null,
    invoiceNumber: null,
    invoiceTotal: null,
    qbInvoiceNumber: null,
    qbSyncStatus: 'pending',
    packingSlipNumber: null,
    createdAt: '2026-04-14T08:35:00',
    fulfilledAt: null,
    invoicedAt: null,
    qbSyncedAt: null,
    shippedAt: null,
    declinedAt: null,
    declineReason: null,
    packingSlipSentAt: null,
    invoiceEmailSentAt: null,
    items: [
      {
        id: 'oi-004',
        productId: 'prod-005',
        quantity: 200,
        fulfilledQty: 0,
        basePrice: 8,
        clientPrice: 8.5,
        overridePrice: null,
        overrideReason: null,
        assignedBatches: [],
      },
    ],
  },
  {
    id: 'order-005',
    orderNumber: 1045,
    clientId: 'client-001',
    locationId: 'loc-003',
    source: 'edi',
    status: 'fulfilled',
    lockedBy: null,
    lockedAt: null,
    invoiceNumber: null,
    invoiceTotal: null,
    qbInvoiceNumber: null,
    qbSyncStatus: 'pending',
    packingSlipNumber: null,
    createdAt: '2026-04-14T06:50:00',
    fulfilledAt: '2026-04-14T08:00:00',
    invoicedAt: null,
    qbSyncedAt: null,
    shippedAt: null,
    declinedAt: null,
    declineReason: null,
    packingSlipSentAt: null,
    invoiceEmailSentAt: null,
    items: [
      {
        id: 'oi-005',
        productId: 'prod-004',
        quantity: 260,
        fulfilledQty: 260,
        basePrice: 5,
        clientPrice: 4.5,
        overridePrice: null,
        overrideReason: null,
        assignedBatches: [{ batchId: 'batch-007', qty: 260 }],
      },
    ],
  },
  {
    id: 'order-006',
    orderNumber: 1046,
    clientId: 'client-002',
    locationId: 'loc-007',
    source: 'portal',
    status: 'pending',
    lockedBy: null,
    lockedAt: null,
    invoiceNumber: null,
    invoiceTotal: null,
    qbInvoiceNumber: null,
    qbSyncStatus: 'pending',
    packingSlipNumber: null,
    createdAt: '2026-04-14T09:00:00',
    fulfilledAt: null,
    invoicedAt: null,
    qbSyncedAt: null,
    shippedAt: null,
    declinedAt: null,
    declineReason: null,
    packingSlipSentAt: null,
    invoiceEmailSentAt: null,
    items: [
      {
        id: 'oi-006',
        productId: 'prod-001',
        quantity: 900,
        fulfilledQty: 0,
        basePrice: 5.5,
        clientPrice: 5.5,
        overridePrice: null,
        overrideReason: null,
        assignedBatches: [],
      },
    ],
  },
  {
    id: 'order-007',
    orderNumber: 1047,
    clientId: 'client-003',
    locationId: 'loc-009',
    source: 'portal',
    status: 'shipped',
    lockedBy: null,
    lockedAt: null,
    invoiceNumber: 'MOD-1047',
    invoiceTotal: 1335,
    qbInvoiceNumber: 'INV-9102',
    qbSyncStatus: 'pushed',
    packingSlipNumber: 'PS-1047',
    createdAt: '2026-04-10T07:30:00',
    fulfilledAt: '2026-04-10T08:30:00',
    invoicedAt: '2026-04-10T09:10:00',
    qbSyncedAt: '2026-04-10T09:18:00',
    shippedAt: '2026-04-10T12:45:00',
    declinedAt: null,
    declineReason: null,
    packingSlipSentAt: '2026-04-10T12:50:00',
    invoiceEmailSentAt: null,
    items: [
      {
        id: 'oi-007',
        productId: 'prod-005',
        quantity: 150,
        fulfilledQty: 150,
        basePrice: 8,
        clientPrice: 9.5,
        overridePrice: 8.9,
        overrideReason: 'Special rate agreed with store manager',
        assignedBatches: [{ batchId: 'batch-005', qty: 150 }],
      },
    ],
  },
  {
    id: 'order-008',
    orderNumber: 1048,
    clientId: 'client-004',
    locationId: 'loc-011',
    source: 'portal',
    status: 'declined',
    lockedBy: null,
    lockedAt: null,
    invoiceNumber: null,
    invoiceTotal: null,
    qbInvoiceNumber: null,
    qbSyncStatus: 'pending',
    packingSlipNumber: null,
    createdAt: '2026-04-09T11:10:00',
    fulfilledAt: null,
    invoicedAt: null,
    qbSyncedAt: null,
    shippedAt: null,
    declinedAt: '2026-04-09T12:00:00',
    declineReason: 'Insufficient stock for requested delivery window',
    packingSlipSentAt: null,
    invoiceEmailSentAt: null,
    items: [
      {
        id: 'oi-008',
        productId: 'prod-001',
        quantity: 400,
        fulfilledQty: 0,
        basePrice: 5.5,
        clientPrice: 6.5,
        overridePrice: null,
        overrideReason: null,
        assignedBatches: [],
      },
    ],
  },
];

export const AUDIT_LOG = [
  {
    id: 'audit-001',
    timestamp: '2026-04-11T09:14:00',
    action: 'order_received',
    orderId: 'order-001',
    clientId: 'client-001',
    userId: 'user-001',
    userName: 'System (EDI)',
    details: 'EDI order received for Loblaws Location 07 - Brampton',
    previousValue: null,
    newValue: 'Order #1041',
  },
  {
    id: 'audit-002',
    timestamp: '2026-04-11T10:30:00',
    action: 'batch_assigned',
    orderId: 'order-001',
    clientId: 'client-001',
    userId: 'user-002',
    userName: 'Aman Singh',
    details: 'Assigned batches B-3009, B-3010, and B-3011 to Order #1041',
    previousValue: 'Pending',
    newValue: 'Fulfilled',
  },
  {
    id: 'audit-003',
    timestamp: '2026-04-11T11:00:00',
    action: 'invoice_created',
    orderId: 'order-001',
    clientId: 'client-001',
    userId: 'user-001',
    userName: 'Priya Modhani',
    details: 'Invoice MOD-1041 created for Order #1041',
    previousValue: null,
    newValue: 'MOD-1041',
  },
  {
    id: 'audit-004',
    timestamp: '2026-04-11T11:12:00',
    action: 'qb_sync',
    orderId: 'order-001',
    clientId: 'client-001',
    userId: 'user-001',
    userName: 'Priya Modhani',
    details: 'Invoice MOD-1041 pushed to QuickBooks Desktop',
    previousValue: 'Pending',
    newValue: 'INV-9101',
  },
  {
    id: 'audit-005',
    timestamp: '2026-04-11T14:00:00',
    action: 'packing_slip_created',
    orderId: 'order-001',
    clientId: 'client-001',
    userId: 'user-003',
    userName: 'Roshni Patel',
    details: 'Packing slip PS-1041 generated and shipment confirmed',
    previousValue: null,
    newValue: 'PS-1041',
  },
  {
    id: 'audit-006',
    timestamp: '2026-04-10T09:10:00',
    action: 'price_override',
    orderId: 'order-007',
    clientId: 'client-003',
    userId: 'user-001',
    userName: 'Priya Modhani',
    details: 'Paneer 400g override from $9.50 to $8.90. Reason: Special rate agreed with store manager',
    previousValue: '$9.50',
    newValue: '$8.90',
  },
  {
    id: 'audit-007',
    timestamp: '2026-04-14T08:00:00',
    action: 'production_logged',
    orderId: null,
    clientId: null,
    userId: 'user-002',
    userName: 'Aman Singh',
    details: 'Produced 500 Lassi Plain 1L - Batch B-3016',
    previousValue: null,
    newValue: '500 units',
  },
  {
    id: 'audit-008',
    timestamp: '2026-04-13T11:15:00',
    action: 'order_partial',
    orderId: 'order-003',
    clientId: 'client-003',
    userId: 'user-002',
    userName: 'Aman Singh',
    details: 'Order #1043 partially fulfilled. 120 units remain outstanding.',
    previousValue: 'Pending',
    newValue: 'Partial',
  },
  {
    id: 'audit-009',
    timestamp: '2026-04-09T12:00:00',
    action: 'order_declined',
    orderId: 'order-008',
    clientId: 'client-004',
    userId: 'user-001',
    userName: 'Priya Modhani',
    details: 'Order #1048 declined. Reason: Insufficient stock for requested delivery window',
    previousValue: 'Pending',
    newValue: 'Declined',
  },
];

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
        orderedValue: item.quantity * getEffectiveItemPrice(item),
      };
    })
  );
}
