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
  { id: 'prod-001', name: 'Dahi', unitSize: '500g', category: 'Cultured Dairy', baseCataloguePrice: 5.6 },
  { id: 'prod-002', name: 'Dahi', unitSize: '1kg', category: 'Cultured Dairy', baseCataloguePrice: 9.4 },
  { id: 'prod-003', name: 'Lassi Mango', unitSize: '1L', category: 'Beverage', baseCataloguePrice: 6.25 },
  { id: 'prod-004', name: 'Lassi Plain', unitSize: '1L', category: 'Beverage', baseCataloguePrice: 5.2 },
  { id: 'prod-005', name: 'Paneer', unitSize: '400g', category: 'Fresh Cheese', baseCataloguePrice: 8.75 },
  { id: 'prod-006', name: 'Raita', unitSize: '750g', category: 'Prepared Dairy', baseCataloguePrice: 4.35 },
];

export const CLIENTS = [
  {
    id: 'client-001',
    name: 'Loblaws',
    locationCount: 4,
    emailPackingSlip: true,
    emailInvoice: true,
    deliveryMethod: 'edi',
    packingSlipEmail: 'receiving@loblaws-demo.ca',
    invoiceEmail: 'ap@loblaws-demo.ca',
  },
  {
    id: 'client-002',
    name: 'Chalo FreshCo',
    locationCount: 2,
    emailPackingSlip: true,
    emailInvoice: true,
    deliveryMethod: 'both',
    packingSlipEmail: 'logistics@chalofreshco-demo.ca',
    invoiceEmail: 'finance@chalofreshco-demo.ca',
  },
  {
    id: 'client-003',
    name: 'A1 Cash & Carry',
    locationCount: 2,
    emailPackingSlip: true,
    emailInvoice: false,
    deliveryMethod: 'email',
    packingSlipEmail: 'receiving@a1cash-demo.ca',
    invoiceEmail: 'billing@a1cash-demo.ca',
  },
  {
    id: 'client-004',
    name: 'Desi Stores',
    locationCount: 2,
    emailPackingSlip: false,
    emailInvoice: true,
    deliveryMethod: 'email',
    packingSlipEmail: 'warehouse@desistores-demo.ca',
    invoiceEmail: 'ap@desistores-demo.ca',
  },
];

export const LOCATIONS = [
  { id: 'loc-001', clientId: 'client-001', code: '07', city: 'Brampton', name: 'DC 07 - Brampton' },
  { id: 'loc-002', clientId: 'client-001', code: '12', city: 'Mississauga', name: 'Store 12 - Mississauga' },
  { id: 'loc-003', clientId: 'client-001', code: '22', city: 'Vaughan', name: 'Store 22 - Vaughan' },
  { id: 'loc-004', clientId: 'client-001', code: '31', city: 'Scarborough', name: 'Store 31 - Scarborough' },
  { id: 'loc-005', clientId: 'client-002', code: '05', city: 'Brampton', name: 'Store 05 - Brampton' },
  { id: 'loc-006', clientId: 'client-002', code: '18', city: 'Ajax', name: 'Store 18 - Ajax' },
  { id: 'loc-007', clientId: 'client-003', code: '03', city: 'Etobicoke', name: 'Store 03 - Etobicoke' },
  { id: 'loc-008', clientId: 'client-003', code: '07', city: 'Mississauga', name: 'Store 07 - Mississauga' },
  { id: 'loc-009', clientId: 'client-004', code: '01', city: 'Scarborough', name: 'Store 01 - Scarborough' },
  { id: 'loc-010', clientId: 'client-004', code: '02', city: 'Markham', name: 'Store 02 - Markham' },
];

export const CLIENT_PRICING = [
  { id: 'cp-001', clientId: 'client-001', productId: 'prod-001', price: 5.0 },
  { id: 'cp-002', clientId: 'client-001', productId: 'prod-002', price: 8.9 },
  { id: 'cp-003', clientId: 'client-001', productId: 'prod-003', price: 5.95 },
  { id: 'cp-004', clientId: 'client-001', productId: 'prod-004', price: 4.65 },
  { id: 'cp-005', clientId: 'client-001', productId: 'prod-005', price: 8.2 },
  { id: 'cp-006', clientId: 'client-001', productId: 'prod-006', price: 3.9 },
  { id: 'cp-007', clientId: 'client-002', productId: 'prod-001', price: 5.45 },
  { id: 'cp-008', clientId: 'client-002', productId: 'prod-002', price: 9.1 },
  { id: 'cp-009', clientId: 'client-002', productId: 'prod-003', price: 6.0 },
  { id: 'cp-010', clientId: 'client-002', productId: 'prod-004', price: 4.95 },
  { id: 'cp-011', clientId: 'client-002', productId: 'prod-005', price: 8.5 },
  { id: 'cp-012', clientId: 'client-002', productId: 'prod-006', price: 4.05 },
  { id: 'cp-013', clientId: 'client-003', productId: 'prod-001', price: 6.85 },
  { id: 'cp-014', clientId: 'client-003', productId: 'prod-002', price: 11.25 },
  { id: 'cp-015', clientId: 'client-003', productId: 'prod-003', price: 6.9 },
  { id: 'cp-016', clientId: 'client-003', productId: 'prod-005', price: 9.35 },
  { id: 'cp-017', clientId: 'client-003', productId: 'prod-006', price: 4.75 },
  { id: 'cp-018', clientId: 'client-004', productId: 'prod-001', price: 6.2 },
  { id: 'cp-019', clientId: 'client-004', productId: 'prod-004', price: 5.1 },
  { id: 'cp-020', clientId: 'client-004', productId: 'prod-005', price: 9.1 },
  { id: 'cp-021', clientId: 'client-004', productId: 'prod-006', price: 4.35 },
];

export const QUICKBOOKS_SETTINGS = {
  connected: false,
  companyName: 'Pending client configuration',
  connectorName: 'QuickBooks Desktop Web Connector',
  status: 'setup_pending',
  lastSyncAt: null,
  nextInvoiceSequence: 9101,
};

export const BATCHES = [
  { id: 'batch-001', batchNumber: 'B-4101', productId: 'prod-001', productionDate: '2026-04-14', qtyProduced: 1200, qtyRemaining: 660, status: 'active' },
  { id: 'batch-002', batchNumber: 'B-4102', productId: 'prod-001', productionDate: '2026-04-18', qtyProduced: 900, qtyRemaining: 900, status: 'active' },
  { id: 'batch-003', batchNumber: 'B-4103', productId: 'prod-002', productionDate: '2026-04-16', qtyProduced: 650, qtyRemaining: 470, status: 'active' },
  { id: 'batch-004', batchNumber: 'B-4104', productId: 'prod-003', productionDate: '2026-04-17', qtyProduced: 700, qtyRemaining: 140, status: 'active' },
  { id: 'batch-005', batchNumber: 'B-4105', productId: 'prod-004', productionDate: '2026-04-19', qtyProduced: 600, qtyRemaining: 340, status: 'active' },
  { id: 'batch-006', batchNumber: 'B-4106', productId: 'prod-005', productionDate: '2026-04-18', qtyProduced: 500, qtyRemaining: 500, status: 'active' },
  { id: 'batch-007', batchNumber: 'B-4107', productId: 'prod-006', productionDate: '2026-04-20', qtyProduced: 450, qtyRemaining: 450, status: 'active' },
  { id: 'batch-008', batchNumber: 'B-4099', productId: 'prod-001', productionDate: '2026-04-10', qtyProduced: 300, qtyRemaining: 0, status: 'cleared' },
];

export const ORDERS = [
  {
    id: 'order-001',
    orderNumber: 1051,
    clientId: 'client-001',
    locationId: 'loc-001',
    source: 'edi',
    status: 'shipped',
    lockedBy: null,
    lockedAt: null,
    invoiceNumber: 'MOD-1051',
    invoiceTotal: 3300,
    qbInvoiceNumber: null,
    qbSyncStatus: 'pending',
    packingSlipNumber: 'PS-1051',
    createdAt: '2026-04-18T07:45:00',
    fulfilledAt: '2026-04-18T09:00:00',
    invoicedAt: '2026-04-18T09:25:00',
    qbSyncedAt: null,
    shippedAt: '2026-04-18T12:10:00',
    declinedAt: null,
    declineReason: null,
    packingSlipSentAt: '2026-04-18T12:14:00',
    invoiceEmailSentAt: '2026-04-18T09:28:00',
    items: [
      {
        id: 'oi-001',
        productId: 'prod-001',
        quantity: 660,
        fulfilledQty: 660,
        declinedQty: 0,
        basePrice: 5.6,
        clientPrice: 5.0,
        overridePrice: null,
        overrideReason: null,
        assignedBatches: [
          { batchId: 'batch-008', qty: 300 },
          { batchId: 'batch-001', qty: 360 },
        ],
      },
    ],
  },
  {
    id: 'order-002',
    orderNumber: 1052,
    clientId: 'client-002',
    locationId: 'loc-005',
    source: 'portal',
    status: 'invoiced',
    lockedBy: null,
    lockedAt: null,
    invoiceNumber: 'MOD-1052',
    invoiceTotal: 3276,
    qbInvoiceNumber: null,
    qbSyncStatus: 'pending',
    packingSlipNumber: null,
    createdAt: '2026-04-19T08:30:00',
    fulfilledAt: '2026-04-19T09:20:00',
    invoicedAt: '2026-04-19T10:05:00',
    qbSyncedAt: null,
    shippedAt: null,
    declinedAt: null,
    declineReason: null,
    packingSlipSentAt: null,
    invoiceEmailSentAt: '2026-04-19T10:08:00',
    items: [
      {
        id: 'oi-002',
        productId: 'prod-003',
        quantity: 560,
        fulfilledQty: 560,
        declinedQty: 0,
        basePrice: 6.25,
        clientPrice: 6.0,
        overridePrice: 5.85,
        overrideReason: 'Approved flyer support rate for weekend promotion',
        assignedBatches: [{ batchId: 'batch-004', qty: 560 }],
      },
    ],
  },
  {
    id: 'order-003',
    orderNumber: 1053,
    clientId: 'client-003',
    locationId: 'loc-007',
    source: 'portal',
    status: 'partial',
    lockedBy: null,
    lockedAt: null,
    invoiceNumber: null,
    invoiceTotal: null,
    qbInvoiceNumber: null,
    qbSyncStatus: 'pending',
    packingSlipNumber: null,
    createdAt: '2026-04-19T11:00:00',
    fulfilledAt: '2026-04-19T12:15:00',
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
        quantity: 320,
        fulfilledQty: 180,
        declinedQty: 0,
        basePrice: 9.4,
        clientPrice: 11.25,
        overridePrice: null,
        overrideReason: null,
        assignedBatches: [{ batchId: 'batch-003', qty: 180 }],
      },
    ],
  },
  {
    id: 'order-004',
    orderNumber: 1054,
    clientId: 'client-004',
    locationId: 'loc-009',
    source: 'portal',
    status: 'pending',
    lockedBy: null,
    lockedAt: null,
    invoiceNumber: null,
    invoiceTotal: null,
    qbInvoiceNumber: null,
    qbSyncStatus: 'pending',
    packingSlipNumber: null,
    createdAt: '2026-04-20T08:10:00',
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
        quantity: 180,
        fulfilledQty: 0,
        declinedQty: 0,
        basePrice: 8.75,
        clientPrice: 9.1,
        overridePrice: null,
        overrideReason: null,
        assignedBatches: [],
      },
    ],
  },
  {
    id: 'order-005',
    orderNumber: 1055,
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
    createdAt: '2026-04-20T06:40:00',
    fulfilledAt: '2026-04-20T07:20:00',
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
        declinedQty: 0,
        basePrice: 5.2,
        clientPrice: 4.65,
        overridePrice: null,
        overrideReason: null,
        assignedBatches: [{ batchId: 'batch-005', qty: 260 }],
      },
    ],
  },
  {
    id: 'order-006',
    orderNumber: 1056,
    clientId: 'client-003',
    locationId: 'loc-008',
    source: 'portal',
    status: 'fulfilled',
    lockedBy: null,
    lockedAt: null,
    invoiceNumber: null,
    invoiceTotal: null,
    qbInvoiceNumber: null,
    qbSyncStatus: 'pending',
    packingSlipNumber: null,
    createdAt: '2026-04-20T09:15:00',
    fulfilledAt: '2026-04-20T10:05:00',
    invoicedAt: null,
    qbSyncedAt: null,
    shippedAt: null,
    declinedAt: '2026-04-20T10:06:00',
    declineReason: 'Remaining balance cancelled after customer approved a short shipment.',
    packingSlipSentAt: null,
    invoiceEmailSentAt: null,
    items: [
      {
        id: 'oi-006',
        productId: 'prod-001',
        quantity: 300,
        fulfilledQty: 180,
        declinedQty: 120,
        basePrice: 5.6,
        clientPrice: 6.85,
        overridePrice: null,
        overrideReason: null,
        assignedBatches: [{ batchId: 'batch-001', qty: 180 }],
      },
    ],
  },
  {
    id: 'order-007',
    orderNumber: 1057,
    clientId: 'client-004',
    locationId: 'loc-010',
    source: 'portal',
    status: 'declined',
    lockedBy: null,
    lockedAt: null,
    invoiceNumber: null,
    invoiceTotal: null,
    qbInvoiceNumber: null,
    qbSyncStatus: 'pending',
    packingSlipNumber: null,
    createdAt: '2026-04-20T11:40:00',
    fulfilledAt: null,
    invoicedAt: null,
    qbSyncedAt: null,
    shippedAt: null,
    declinedAt: '2026-04-20T12:05:00',
    declineReason: 'Requested delivery window could not be met with current stock.',
    packingSlipSentAt: null,
    invoiceEmailSentAt: null,
    items: [
      {
        id: 'oi-007',
        productId: 'prod-005',
        quantity: 240,
        fulfilledQty: 0,
        declinedQty: 240,
        basePrice: 8.75,
        clientPrice: 9.1,
        overridePrice: null,
        overrideReason: null,
        assignedBatches: [],
      },
    ],
  },
  {
    id: 'order-008',
    orderNumber: 1058,
    clientId: 'client-002',
    locationId: 'loc-006',
    source: 'portal',
    status: 'pending',
    lockedBy: null,
    lockedAt: null,
    invoiceNumber: null,
    invoiceTotal: null,
    qbInvoiceNumber: null,
    qbSyncStatus: 'pending',
    packingSlipNumber: null,
    createdAt: '2026-04-21T07:55:00',
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
        id: 'oi-008',
        productId: 'prod-006',
        quantity: 120,
        fulfilledQty: 0,
        declinedQty: 0,
        basePrice: 4.35,
        clientPrice: 4.05,
        overridePrice: null,
        overrideReason: null,
        assignedBatches: [],
      },
      {
        id: 'oi-009',
        productId: 'prod-001',
        quantity: 200,
        fulfilledQty: 0,
        declinedQty: 0,
        basePrice: 5.6,
        clientPrice: 5.45,
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
    timestamp: '2026-04-18T07:45:00',
    action: 'order_received',
    orderId: 'order-001',
    clientId: 'client-001',
    userId: null,
    userName: 'System (EDI)',
    details: 'EDI order received for Loblaws DC 07 - Brampton',
    previousValue: null,
    newValue: 'Order #1051',
  },
  {
    id: 'audit-002',
    timestamp: '2026-04-18T09:00:00',
    action: 'batch_assigned',
    orderId: 'order-001',
    clientId: 'client-001',
    userId: 'user-002',
    userName: 'Aman Singh',
    details: 'Assigned batches B-4099 and B-4101 to Order #1051',
    previousValue: '660 outstanding',
    newValue: '0 outstanding',
  },
  {
    id: 'audit-003',
    timestamp: '2026-04-18T09:25:00',
    action: 'invoice_created',
    orderId: 'order-001',
    clientId: 'client-001',
    userId: 'user-003',
    userName: 'Roshni Patel',
    details: 'Invoice MOD-1051 created for Order #1051',
    previousValue: null,
    newValue: 'MOD-1051',
  },
  {
    id: 'audit-004',
    timestamp: '2026-04-18T12:10:00',
    action: 'packing_slip_created',
    orderId: 'order-001',
    clientId: 'client-001',
    userId: 'user-003',
    userName: 'Roshni Patel',
    details: 'Packing slip PS-1051 generated and shipment confirmed',
    previousValue: null,
    newValue: 'PS-1051',
  },
  {
    id: 'audit-005',
    timestamp: '2026-04-19T10:00:00',
    action: 'price_override',
    orderId: 'order-002',
    clientId: 'client-002',
    userId: 'user-001',
    userName: 'Priya Modhani',
    details: 'Lassi Mango 1L override from $6.00 to $5.85. Reason: Approved flyer support rate for weekend promotion',
    previousValue: '$6.00',
    newValue: '$5.85',
  },
  {
    id: 'audit-006',
    timestamp: '2026-04-19T10:05:00',
    action: 'invoice_created',
    orderId: 'order-002',
    clientId: 'client-002',
    userId: 'user-003',
    userName: 'Roshni Patel',
    details: 'Invoice MOD-1052 created for Order #1052',
    previousValue: null,
    newValue: 'MOD-1052',
  },
  {
    id: 'audit-007',
    timestamp: '2026-04-19T12:15:00',
    action: 'order_partial',
    orderId: 'order-003',
    clientId: 'client-003',
    userId: 'user-002',
    userName: 'Aman Singh',
    details: 'Order #1053 partially fulfilled. 140 units remain outstanding.',
    previousValue: 'Pending',
    newValue: 'Partial',
  },
  {
    id: 'audit-008',
    timestamp: '2026-04-20T07:20:00',
    action: 'order_fulfilled',
    orderId: 'order-005',
    clientId: 'client-001',
    userId: 'user-002',
    userName: 'Aman Singh',
    details: 'Order #1055 fully fulfilled and ready for invoicing.',
    previousValue: 'Pending',
    newValue: 'Fulfilled',
  },
  {
    id: 'audit-009',
    timestamp: '2026-04-20T10:06:00',
    action: 'order_balance_declined',
    orderId: 'order-006',
    clientId: 'client-003',
    userId: 'user-002',
    userName: 'Aman Singh',
    details: 'Remaining balance on Order #1056 declined after partial fulfilment. Reason: Remaining balance cancelled after customer approved a short shipment.',
    previousValue: '120 outstanding',
    newValue: '0 outstanding',
  },
  {
    id: 'audit-010',
    timestamp: '2026-04-20T12:05:00',
    action: 'order_declined',
    orderId: 'order-007',
    clientId: 'client-004',
    userId: 'user-001',
    userName: 'Priya Modhani',
    details: 'Order #1057 declined. Reason: Requested delivery window could not be met with current stock.',
    previousValue: 'Pending',
    newValue: 'Declined',
  },
  {
    id: 'audit-011',
    timestamp: '2026-04-20T14:20:00',
    action: 'production_logged',
    orderId: null,
    clientId: null,
    userId: 'user-002',
    userName: 'Aman Singh',
    details: 'Produced 450 Raita 750g - Batch B-4107',
    previousValue: null,
    newValue: 'B-4107: 450 units',
  },
  {
    id: 'audit-012',
    timestamp: '2026-04-21T07:55:00',
    action: 'order_received',
    orderId: 'order-008',
    clientId: 'client-002',
    userId: 'user-001',
    userName: 'Priya Modhani',
    details: 'Portal order created for Chalo FreshCo Store 18 - Ajax',
    previousValue: null,
    newValue: 'Order #1058',
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
        orderedValue: Math.max(item.quantity - (item.declinedQty ?? 0), 0) * getEffectiveItemPrice(item),
      };
    })
  );
}
