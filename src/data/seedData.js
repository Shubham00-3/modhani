// ModhaniOS — Seed Data
// Realistic demo data for all entities

export const CURRENT_USER = {
  id: 'user-001',
  name: 'Priya Modhani',
  initials: 'PM',
  role: 'admin',
};

export const USERS = [
  { id: 'user-001', name: 'Priya Modhani', initials: 'PM', role: 'admin' },
  { id: 'user-002', name: 'Aman Singh', initials: 'AS', role: 'staff' },
  { id: 'user-003', name: 'Roshni Patel', initials: 'RP', role: 'staff' },
];

export const PRODUCTS = [
  { id: 'prod-001', name: 'Dahi', unitSize: '500g', category: 'Yogurt', baseCataloguePrice: 5.50 },
  { id: 'prod-002', name: 'Dahi', unitSize: '1kg', category: 'Yogurt', baseCataloguePrice: 9.00 },
  { id: 'prod-003', name: 'Lassi Mango', unitSize: '1L', category: 'Lassi', baseCataloguePrice: 6.00 },
  { id: 'prod-004', name: 'Lassi Plain', unitSize: '1L', category: 'Lassi', baseCataloguePrice: 5.00 },
  { id: 'prod-005', name: 'Paneer', unitSize: '400g', category: 'Cheese', baseCataloguePrice: 8.00 },
  { id: 'prod-006', name: 'Raita', unitSize: '250ml', category: 'Yogurt', baseCataloguePrice: 3.50 },
];

export const CLIENTS = [
  {
    id: 'client-001',
    name: 'Loblaws',
    locationCount: 100,
    emailPackingSlip: true,
    emailInvoice: true,
    deliveryMethod: 'edi',
  },
  {
    id: 'client-002',
    name: 'Chalo FreshCo',
    locationCount: 100,
    emailPackingSlip: true,
    emailInvoice: true,
    deliveryMethod: 'both',
  },
  {
    id: 'client-003',
    name: 'A1 Cash & Carry',
    locationCount: 8,
    emailPackingSlip: true,
    emailInvoice: false,
    deliveryMethod: 'email',
  },
  {
    id: 'client-004',
    name: 'Desi Stores',
    locationCount: 4,
    emailPackingSlip: false,
    emailInvoice: true,
    deliveryMethod: 'portal',
  },
];

export const LOCATIONS = [
  // Loblaws
  { id: 'loc-001', clientId: 'client-001', name: 'Location 07 — Brampton' },
  { id: 'loc-002', clientId: 'client-001', name: 'Location 12 — Mississauga' },
  { id: 'loc-003', clientId: 'client-001', name: 'Location 22 — Vaughan' },
  { id: 'loc-004', clientId: 'client-001', name: 'Location 44 — Mississauga' },
  { id: 'loc-005', clientId: 'client-001', name: 'Location 31 — Scarborough' },
  // Chalo FreshCo
  { id: 'loc-006', clientId: 'client-002', name: 'Location 05 — Brampton' },
  { id: 'loc-007', clientId: 'client-002', name: 'Location 12 — Mississauga' },
  { id: 'loc-008', clientId: 'client-002', name: 'Location 18 — Ajax' },
  // A1 Cash & Carry
  { id: 'loc-009', clientId: 'client-003', name: 'Store 3 — Etobicoke' },
  { id: 'loc-010', clientId: 'client-003', name: 'Store 7 — Mississauga' },
  // Desi Stores
  { id: 'loc-011', clientId: 'client-004', name: 'Store 1 — Scarborough' },
  { id: 'loc-012', clientId: 'client-004', name: 'Store 2 — Markham' },
];

export const CLIENT_PRICING = [
  // Loblaws
  { id: 'cp-001', clientId: 'client-001', productId: 'prod-001', price: 5.00, volumeBrackets: [{ minQty: 500, price: 4.75 }, { minQty: 1000, price: 4.50 }] },
  { id: 'cp-002', clientId: 'client-001', productId: 'prod-002', price: 8.50, volumeBrackets: [] },
  { id: 'cp-003', clientId: 'client-001', productId: 'prod-003', price: 5.50, volumeBrackets: [] },
  { id: 'cp-004', clientId: 'client-001', productId: 'prod-004', price: 4.50, volumeBrackets: [] },
  { id: 'cp-005', clientId: 'client-001', productId: 'prod-005', price: 7.50, volumeBrackets: [] },
  { id: 'cp-006', clientId: 'client-001', productId: 'prod-006', price: 3.00, volumeBrackets: [] },
  // Chalo FreshCo
  { id: 'cp-007', clientId: 'client-002', productId: 'prod-001', price: 5.50, volumeBrackets: [{ minQty: 500, price: 5.25 }] },
  { id: 'cp-008', clientId: 'client-002', productId: 'prod-003', price: 5.75, volumeBrackets: [] },
  { id: 'cp-009', clientId: 'client-002', productId: 'prod-005', price: 7.75, volumeBrackets: [] },
  // A1 Cash & Carry
  { id: 'cp-010', clientId: 'client-003', productId: 'prod-001', price: 7.00, volumeBrackets: [] },
  { id: 'cp-011', clientId: 'client-003', productId: 'prod-002', price: 11.00, volumeBrackets: [] },
  { id: 'cp-012', clientId: 'client-003', productId: 'prod-005', price: 9.50, volumeBrackets: [] },
  // Desi Stores
  { id: 'cp-013', clientId: 'client-004', productId: 'prod-001', price: 6.50, volumeBrackets: [] },
  { id: 'cp-014', clientId: 'client-004', productId: 'prod-005', price: 8.50, volumeBrackets: [] },
  { id: 'cp-015', clientId: 'client-004', productId: 'prod-006', price: 4.00, volumeBrackets: [] },
];

export const BATCHES = [
  { id: 'batch-001', batchNumber: 'B-2039', productId: 'prod-001', productionDate: '2025-03-27', qtyProduced: 1000, qtyRemaining: 340, status: 'active' },
  { id: 'batch-002', batchNumber: 'B-2040', productId: 'prod-001', productionDate: '2025-03-30', qtyProduced: 800, qtyRemaining: 800, status: 'active' },
  { id: 'batch-003', batchNumber: 'B-2041', productId: 'prod-003', productionDate: '2025-03-28', qtyProduced: 500, qtyRemaining: 120, status: 'active' },
  { id: 'batch-004', batchNumber: 'B-2042', productId: 'prod-002', productionDate: '2025-03-29', qtyProduced: 600, qtyRemaining: 450, status: 'active' },
  { id: 'batch-005', batchNumber: 'B-2043', productId: 'prod-005', productionDate: '2025-03-31', qtyProduced: 400, qtyRemaining: 300, status: 'active' },
  { id: 'batch-006', batchNumber: 'B-2044', productId: 'prod-001', productionDate: '2025-04-01', qtyProduced: 2000, qtyRemaining: 1300, status: 'active' },
  { id: 'batch-007', batchNumber: 'B-2038', productId: 'prod-001', productionDate: '2025-03-25', qtyProduced: 500, qtyRemaining: 0, status: 'cleared' },
  { id: 'batch-008', batchNumber: 'B-2045', productId: 'prod-004', productionDate: '2025-04-01', qtyProduced: 600, qtyRemaining: 400, status: 'active' },
];

export const ORDERS = [
  {
    id: 'order-001', orderNumber: 1041, clientId: 'client-001', locationId: 'loc-001',
    source: 'edi', status: 'shipped', lockedBy: null, lockedAt: null,
    qbInvoiceNumber: 'INV-8841', qbSyncStatus: 'pushed',
    createdAt: '2025-04-01T09:14:00', fulfilledAt: '2025-04-01T10:30:00',
    invoicedAt: '2025-04-01T11:00:00', shippedAt: '2025-04-01T14:00:00',
    items: [
      { id: 'oi-001', productId: 'prod-001', quantity: 2000, fulfilledQty: 2000,
        basePrice: 5.50, clientPrice: 5.00, overridePrice: null, overrideReason: null,
        assignedBatches: [{ batchId: 'batch-007', qty: 500 }, { batchId: 'batch-001', qty: 660 }, { batchId: 'batch-002', qty: 840 }] },
    ],
  },
  {
    id: 'order-002', orderNumber: 1042, clientId: 'client-002', locationId: 'loc-007',
    source: 'portal', status: 'invoiced', lockedBy: null, lockedAt: null,
    qbInvoiceNumber: null, qbSyncStatus: 'pending',
    createdAt: '2025-04-01T09:41:00', fulfilledAt: '2025-04-01T11:00:00',
    invoicedAt: '2025-04-01T12:00:00', shippedAt: null,
    items: [
      { id: 'oi-002', productId: 'prod-003', quantity: 500, fulfilledQty: 500,
        basePrice: 6.00, clientPrice: 5.75, overridePrice: null, overrideReason: null,
        assignedBatches: [{ batchId: 'batch-003', qty: 380 }, { batchId: 'batch-003', qty: 120 }] },
    ],
  },
  {
    id: 'order-003', orderNumber: 1043, clientId: 'client-003', locationId: 'loc-009',
    source: 'portal', status: 'pending', lockedBy: null, lockedAt: null,
    qbInvoiceNumber: null, qbSyncStatus: 'pending',
    createdAt: '2025-04-01T10:02:00', fulfilledAt: null,
    invoicedAt: null, shippedAt: null,
    items: [
      { id: 'oi-003', productId: 'prod-002', quantity: 300, fulfilledQty: 0,
        basePrice: 9.00, clientPrice: 11.00, overridePrice: null, overrideReason: null,
        assignedBatches: [] },
    ],
  },
  {
    id: 'order-004', orderNumber: 1044, clientId: 'client-004', locationId: 'loc-011',
    source: 'portal', status: 'shipped', lockedBy: null, lockedAt: null,
    qbInvoiceNumber: 'INV-8842', qbSyncStatus: 'pushed',
    createdAt: '2025-04-01T10:30:00', fulfilledAt: '2025-04-01T12:00:00',
    invoicedAt: '2025-04-01T13:00:00', shippedAt: '2025-04-01T16:00:00',
    items: [
      { id: 'oi-004', productId: 'prod-005', quantity: 150, fulfilledQty: 150,
        basePrice: 8.00, clientPrice: 8.50, overridePrice: null, overrideReason: null,
        assignedBatches: [{ batchId: 'batch-005', qty: 150 }] },
    ],
  },
  {
    id: 'order-005', orderNumber: 1045, clientId: 'client-001', locationId: 'loc-003',
    source: 'edi', status: 'invoiced', lockedBy: null, lockedAt: null,
    qbInvoiceNumber: null, qbSyncStatus: 'pending',
    createdAt: '2025-03-31T08:00:00', fulfilledAt: '2025-03-31T10:00:00',
    invoicedAt: '2025-03-31T11:00:00', shippedAt: null,
    items: [
      { id: 'oi-005', productId: 'prod-004', quantity: 400, fulfilledQty: 400,
        basePrice: 5.00, clientPrice: 4.50, overridePrice: null, overrideReason: null,
        assignedBatches: [{ batchId: 'batch-008', qty: 400 }] },
    ],
  },
  {
    id: 'order-006', orderNumber: 1046, clientId: 'client-002', locationId: 'loc-006',
    source: 'portal', status: 'pending', lockedBy: null, lockedAt: null,
    qbInvoiceNumber: null, qbSyncStatus: 'pending',
    createdAt: '2025-03-31T09:00:00', fulfilledAt: null,
    invoicedAt: null, shippedAt: null,
    items: [
      { id: 'oi-006', productId: 'prod-001', quantity: 800, fulfilledQty: 0,
        basePrice: 5.50, clientPrice: 5.50, overridePrice: null, overrideReason: null,
        assignedBatches: [] },
    ],
  },
  {
    id: 'order-007', orderNumber: 1047, clientId: 'client-001', locationId: 'loc-004',
    source: 'edi', status: 'shipped', lockedBy: null, lockedAt: null,
    qbInvoiceNumber: 'INV-8839', qbSyncStatus: 'pushed',
    createdAt: '2025-03-31T07:30:00', fulfilledAt: '2025-03-31T09:00:00',
    invoicedAt: '2025-03-31T10:00:00', shippedAt: '2025-03-31T14:00:00',
    items: [
      { id: 'oi-007', productId: 'prod-003', quantity: 1200, fulfilledQty: 1200,
        basePrice: 6.00, clientPrice: 5.50, overridePrice: 5.20, overrideReason: 'Bulk deal agreed with regional manager',
        assignedBatches: [] },
    ],
  },
  {
    id: 'order-008', orderNumber: 1048, clientId: 'client-003', locationId: 'loc-010',
    source: 'portal', status: 'invoiced', lockedBy: null, lockedAt: null,
    qbInvoiceNumber: null, qbSyncStatus: 'pending',
    createdAt: '2025-03-30T10:15:00', fulfilledAt: '2025-03-30T12:00:00',
    invoicedAt: '2025-03-30T13:00:00', shippedAt: null,
    items: [
      { id: 'oi-008', productId: 'prod-005', quantity: 200, fulfilledQty: 200,
        basePrice: 8.00, clientPrice: 9.50, overridePrice: null, overrideReason: null,
        assignedBatches: [{ batchId: 'batch-005', qty: 200 }] },
    ],
  },
];

export const AUDIT_LOG = [
  { id: 'audit-001', timestamp: '2025-04-01T11:00:00', action: 'invoice_created', orderId: 'order-001', userId: 'user-001', userName: 'Priya Modhani', details: 'Invoice INV-8841 created for Order #1041', previousValue: null, newValue: 'INV-8841' },
  { id: 'audit-002', timestamp: '2025-04-01T10:30:00', action: 'order_fulfilled', orderId: 'order-001', userId: 'user-002', userName: 'Aman Singh', details: 'Order #1041 fulfilled — 2,000 Dahi 500g from batches B-2038, B-2039, B-2040', previousValue: 'pending', newValue: 'fulfilled' },
  { id: 'audit-003', timestamp: '2025-04-01T14:00:00', action: 'order_shipped', orderId: 'order-001', userId: 'user-003', userName: 'Roshni Patel', details: 'Order #1041 marked as shipped', previousValue: 'invoiced', newValue: 'shipped' },
  { id: 'audit-004', timestamp: '2025-03-31T10:00:00', action: 'price_override', orderId: 'order-007', userId: 'user-001', userName: 'Priya Modhani', details: 'Price override on Lassi 1L Mango: $5.50 → $5.20. Reason: Bulk deal agreed with regional manager', previousValue: '$5.50', newValue: '$5.20' },
  { id: 'audit-005', timestamp: '2025-04-01T08:00:00', action: 'production_logged', orderId: null, userId: 'user-002', userName: 'Aman Singh', details: 'Produced 2,000 Dahi 500g — Batch B-2044', previousValue: null, newValue: 'B-2044: 2,000 units' },
  { id: 'audit-006', timestamp: '2025-03-31T07:00:00', action: 'production_logged', orderId: null, userId: 'user-002', userName: 'Aman Singh', details: 'Produced 600 Lassi 1L Plain — Batch B-2045', previousValue: null, newValue: 'B-2045: 600 units' },
  { id: 'audit-007', timestamp: '2025-04-01T12:00:00', action: 'batch_assigned', orderId: 'order-002', userId: 'user-003', userName: 'Roshni Patel', details: 'Batch B-2041 assigned to Order #1042 — 500 Lassi 1L Mango', previousValue: '500 remaining', newValue: '120 remaining' },
  { id: 'audit-008', timestamp: '2025-04-01T09:14:00', action: 'order_received', orderId: 'order-001', userId: 'user-001', userName: 'System (EDI)', details: 'EDI order received — Loblaws, Location 07, 2,000 Dahi 500g', previousValue: null, newValue: 'Order #1041' },
  { id: 'audit-009', timestamp: '2025-03-30T13:00:00', action: 'invoice_created', orderId: 'order-008', userId: 'user-001', userName: 'Priya Modhani', details: 'Invoice created for Order #1048 — A1 Cash & Carry', previousValue: null, newValue: 'pending QB sync' },
  { id: 'audit-010', timestamp: '2025-04-01T16:00:00', action: 'packing_slip_sent', orderId: 'order-004', userId: 'user-003', userName: 'Roshni Patel', details: 'Packing slip emailed to Desi Stores for Order #1044', previousValue: null, newValue: 'email sent' },
  { id: 'audit-011', timestamp: '2025-04-01T11:05:00', action: 'qb_sync', orderId: 'order-001', userId: 'user-001', userName: 'System', details: 'Invoice INV-8841 pushed to QuickBooks Desktop', previousValue: 'pending', newValue: 'pushed' },
];

// Helper to get product display name
export function getProductDisplayName(product) {
  if (!product) return 'Unknown';
  return `${product.name} ${product.unitSize}`;
}

// Helper to get client name by id
export function getClientName(clients, clientId) {
  const client = clients.find(c => c.id === clientId);
  return client ? client.name : 'Unknown';
}

// Helper to get location name by id
export function getLocationName(locations, locationId) {
  const loc = locations.find(l => l.id === locationId);
  return loc ? loc.name : 'Unknown';
}

// Helper to get product by id
export function getProduct(products, productId) {
  return products.find(p => p.id === productId);
}

// Helper to format currency
export function formatCurrency(amount) {
  if (amount == null) return '—';
  return `$${Number(amount).toFixed(2)}`;
}

// Helper to format date
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

// Helper to format time
export function formatTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Helper to format datetime
export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}
