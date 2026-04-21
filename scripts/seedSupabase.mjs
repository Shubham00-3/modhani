import { createClient } from '@supabase/supabase-js';
import {
  AUDIT_LOG,
  BATCHES,
  CLIENT_PRICING,
  CLIENTS,
  LOCATIONS,
  ORDERS,
  PRODUCTS,
  QUICKBOOKS_SETTINGS,
  USERS,
} from '../src/data/phaseOneData.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const seedPassword = process.env.SUPABASE_SEED_PASSWORD || 'ChangeMe123!';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function main() {
  const userIdMap = await ensureAuthUsers();
  await resetTables();
  await seedCoreTables(userIdMap);
  console.log('Supabase Phase 1 seed completed successfully.');
}

async function ensureAuthUsers() {
  const existingUsers = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100,
    });

    if (error) throw error;

    existingUsers.push(...(data.users ?? []));
    totalPages = data.total_pages ?? 1;
    page += 1;
  }

  const userIdMap = new Map();

  for (const user of USERS) {
    const existing = existingUsers.find((entry) => entry.email?.toLowerCase() === user.email.toLowerCase());

    if (existing) {
      const { error } = await supabase.auth.admin.updateUserById(existing.id, {
        password: seedPassword,
        email_confirm: true,
        user_metadata: {
          full_name: user.name,
          initials: user.initials,
          role: user.role,
        },
      });
      if (error) throw error;
      userIdMap.set(user.id, existing.id);
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: seedPassword,
      email_confirm: true,
      user_metadata: {
        full_name: user.name,
        initials: user.initials,
        role: user.role,
      },
    });

    if (error) throw error;
    userIdMap.set(user.id, data.user.id);
  }

  return userIdMap;
}

async function resetTables() {
  const deletes = [
    ['batch_assignments', 'order_item_id'],
    ['order_items', 'order_id'],
    ['audit_events', 'id'],
    ['orders', 'id'],
    ['batches', 'id'],
    ['client_product_prices', 'id'],
    ['locations', 'id'],
    ['products', 'id'],
    ['clients', 'id'],
    ['quickbooks_settings', 'id'],
    ['profiles', 'user_id'],
  ];

  for (const [table, column] of deletes) {
    const { error } = await supabase.from(table).delete().not(column, 'is', null);
    if (error) throw error;
  }
}

async function seedCoreTables(userIdMap) {
  await insertRows('profiles', USERS.map((user) => ({
    user_id: userIdMap.get(user.id),
    email: user.email,
    full_name: user.name,
    initials: user.initials,
    role: user.role,
    fulfil_orders: user.permissions.fulfilOrders,
    override_prices: user.permissions.overridePrices,
    manage_settings: user.permissions.manageSettings,
  })));

  await insertRows('clients', CLIENTS.map((client) => ({
    id: client.id,
    name: client.name,
    location_count: client.locationCount,
    email_packing_slip: client.emailPackingSlip,
    email_invoice: client.emailInvoice,
    delivery_method: client.deliveryMethod,
    packing_slip_email: client.packingSlipEmail,
    invoice_email: client.invoiceEmail,
  })));

  await insertRows('locations', LOCATIONS.map((location) => ({
    id: location.id,
    client_id: location.clientId,
    code: location.code,
    city: location.city,
    name: location.name,
  })));

  await insertRows('products', PRODUCTS.map((product) => ({
    id: product.id,
    name: product.name,
    unit_size: product.unitSize,
    category: product.category,
    base_catalogue_price: product.baseCataloguePrice,
  })));

  await insertRows('client_product_prices', CLIENT_PRICING.map((price) => ({
    id: price.id,
    client_id: price.clientId,
    product_id: price.productId,
    price: price.price,
  })));

  await insertRows('batches', BATCHES.map((batch) => ({
    id: batch.id,
    batch_number: batch.batchNumber,
    product_id: batch.productId,
    production_date: batch.productionDate,
    qty_produced: batch.qtyProduced,
    qty_remaining: batch.qtyRemaining,
    status: batch.status,
  })));

  await insertRows('orders', ORDERS.map((order) => ({
    id: order.id,
    order_number: order.orderNumber,
    client_id: order.clientId,
    location_id: order.locationId,
    source: order.source,
    status: order.status,
    locked_by: order.lockedBy ? userIdMap.get(order.lockedBy) : null,
    locked_at: order.lockedAt,
    invoice_number: order.invoiceNumber,
    invoice_total: order.invoiceTotal,
    qb_invoice_number: order.qbInvoiceNumber,
    qb_sync_status: order.qbSyncStatus,
    packing_slip_number: order.packingSlipNumber,
    created_at: toTimestamp(order.createdAt),
    fulfilled_at: toTimestamp(order.fulfilledAt),
    invoiced_at: toTimestamp(order.invoicedAt),
    qb_synced_at: toTimestamp(order.qbSyncedAt),
    shipped_at: toTimestamp(order.shippedAt),
    declined_at: toTimestamp(order.declinedAt),
    decline_reason: order.declineReason,
    packing_slip_sent_at: toTimestamp(order.packingSlipSentAt),
    invoice_email_sent_at: toTimestamp(order.invoiceEmailSentAt),
  })));

  await insertRows(
    'order_items',
    ORDERS.flatMap((order) =>
      order.items.map((item) => ({
        id: item.id,
        order_id: order.id,
        product_id: item.productId,
        quantity: item.quantity,
        fulfilled_qty: item.fulfilledQty,
        declined_qty: item.declinedQty ?? 0,
        base_price: item.basePrice,
        client_price: item.clientPrice,
        override_price: item.overridePrice,
        override_reason: item.overrideReason,
      }))
    )
  );

  await insertRows(
    'batch_assignments',
    ORDERS.flatMap((order) =>
      order.items.flatMap((item) =>
        item.assignedBatches.map((assigned, index) => ({
          id: `${item.id}-${assigned.batchId}-${index + 1}`,
          order_item_id: item.id,
          batch_id: assigned.batchId,
          qty: assigned.qty,
        }))
      )
    )
  );

  await insertRows('audit_events', AUDIT_LOG.map((entry) => ({
    id: entry.id,
    timestamp: toTimestamp(entry.timestamp),
    action: entry.action,
    order_id: entry.orderId,
    client_id: entry.clientId,
    user_id: entry.userId ? userIdMap.get(entry.userId) ?? null : null,
    user_name: entry.userName,
    details: entry.details,
    previous_value: entry.previousValue,
    new_value: entry.newValue,
  })));

  await insertRows('quickbooks_settings', [
    {
      id: 'singleton',
      connected: QUICKBOOKS_SETTINGS.connected,
      company_name: QUICKBOOKS_SETTINGS.companyName,
      connector_name: QUICKBOOKS_SETTINGS.connectorName,
      status: QUICKBOOKS_SETTINGS.status,
      last_sync_at: toTimestamp(QUICKBOOKS_SETTINGS.lastSyncAt),
      next_invoice_sequence: QUICKBOOKS_SETTINGS.nextInvoiceSequence,
    },
  ]);
}

async function insertRows(table, rows) {
  if (!rows.length) return;
  const { error } = await supabase.from(table).insert(rows);
  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }
}

function toTimestamp(value) {
  if (!value) return null;
  return new Date(value).toISOString();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
