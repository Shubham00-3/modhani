import {
  buildReportRowsFromOrders,
  buildTierPrices,
  getProductTierPrice,
  normalizeLotCode,
  normalizePriceTier,
  QUICKBOOKS_SETTINGS,
} from '../data/phaseOneData';

function profileToUi(profile) {
  return {
    id: profile.user_id,
    email: profile.email,
    name: profile.full_name,
    initials: profile.initials,
    role: profile.role,
    disabledAt: profile.disabled_at ?? null,
    disabledReason: profile.disabled_reason ?? null,
    permissions: {
      fulfilOrders: profile.fulfil_orders,
      overridePrices: profile.override_prices,
      editInvoices: profile.edit_invoices ?? (profile.fulfil_orders || profile.override_prices),
      manageSettings: profile.manage_settings,
    },
  };
}

function clientToUi(client) {
  return {
    id: client.id,
    name: client.name,
    priceTier: normalizePriceTier(client.price_tier),
    locationCount: client.location_count,
    emailPackingSlip: client.email_packing_slip,
    emailInvoice: client.email_invoice,
    deliveryMethod: client.delivery_method,
    packingSlipEmail: client.packing_slip_email,
    invoiceEmail: client.invoice_email,
    qbCustomerName: client.qb_customer_name ?? client.name,
    qbMappingStatus: client.qb_mapping_status ?? 'ready',
    operatingAs: client.operating_as ?? '',
  };
}

function locationToUi(location) {
  return {
    id: location.id,
    clientId: location.client_id,
    code: location.code,
    city: location.city,
    name: location.name,
    addressLine1: location.address_line1 ?? '',
    addressLine2: location.address_line2 ?? '',
    province: location.province ?? '',
    postalCode: location.postal_code ?? '',
    country: location.country ?? 'Canada',
    qbShipToName: location.qb_ship_to_name ?? location.name,
    qbMappingStatus: location.qb_mapping_status ?? 'needs_address',
    repName: location.rep_name ?? '',
    repEmail: location.rep_email ?? '',
    repPhone: location.rep_phone ?? '',
  };
}

function productToUi(product) {
  const baseCataloguePrice = Number(product.base_catalogue_price);

  return {
    id: product.id,
    name: product.name,
    unitSize: product.unit_size,
    category: product.category,
    baseCataloguePrice,
    tierPrices: buildTierPrices(baseCataloguePrice, product.tier_prices),
    itemNumber: product.item_number ?? '',
    upc: product.upc ?? '',
    packagingDetails: product.packaging_details ?? '',
    unitsPerCase: product.units_per_case == null ? null : Number(product.units_per_case),
    shelfLifeDays: product.shelf_life_days == null ? null : Number(product.shelf_life_days),
    leadTimeDays: product.lead_time_days == null ? null : Number(product.lead_time_days),
    orderUnitLabel: product.order_unit_label ?? '',
    qbItemName: product.qb_item_name ?? `${product.name} ${product.unit_size}`.trim(),
    qbMappingStatus: product.qb_mapping_status ?? 'ready',
    imageUrl: product.image_url ?? '',
    imagePath: product.image_path ?? '',
  };
}

function quickBooksJobToUi(job) {
  return {
    id: job.id,
    orderId: job.order_id,
    jobType: job.job_type,
    status: job.status,
    qbInvoiceNumber: job.qb_invoice_number,
    qbTxnId: job.qb_txn_id,
    qbEditSequence: job.qb_edit_sequence,
    errorMessage: job.error_message,
    attempts: Number(job.attempts ?? 0),
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

function pricingToUi(pricing) {
  return {
    id: pricing.id,
    clientId: pricing.client_id,
    productId: pricing.product_id,
    price: Number(pricing.price),
    isActive: Boolean(pricing.is_active),
  };
}

function batchToUi(batch) {
  return {
    id: batch.id,
    batchNumber: normalizeLotCode(batch.batch_number),
    productId: batch.product_id,
    productionDate: batch.production_date,
    qtyProduced: Number(batch.qty_produced),
    qtyRemaining: Number(batch.qty_remaining),
    status: batch.status,
    updatedAt: batch.updated_at,
    deletedAt: batch.deleted_at ?? null,
    deletedBy: batch.deleted_by ?? null,
    deletedReason: batch.deleted_reason ?? null,
  };
}

function auditToUi(entry) {
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    action: entry.action,
    orderId: entry.order_id,
    clientId: entry.client_id,
    userId: entry.user_id,
    userName: entry.user_name,
    details: entry.details,
    previousValue: entry.previous_value,
    newValue: entry.new_value,
  };
}

function notificationDismissalToUi(entry) {
  return {
    userId: entry.user_id,
    notificationKey: entry.notification_key,
    dismissedAt: entry.dismissed_at,
  };
}

function quickBooksToUi(settings) {
  if (!settings) return QUICKBOOKS_SETTINGS;

  return {
    id: settings.id,
    connected: settings.connected,
    companyName: settings.company_name,
    connectorName: settings.connector_name,
    status: settings.status,
    lastSyncAt: settings.last_sync_at,
    connectorLastSeenAt: settings.connector_last_seen_at,
    failedSyncCount: Number(settings.failed_sync_count ?? 0),
    nextInvoiceSequence: settings.next_invoice_sequence,
  };
}

function reportLineToUi(row) {
  return {
    orderId: row.order_id,
    orderNumber: Number(row.order_number),
    clientId: row.client_id,
    clientName: row.client_name,
    locationId: row.location_id,
    locationName: row.location_name,
    productId: row.product_id,
    productName: row.product_name,
    unitSize: row.unit_size,
    productDisplayName: row.product_display_name,
    category: row.category,
    source: row.source,
    status: row.status,
    createdAt: row.created_at,
    fulfilledAt: row.fulfilled_at,
    invoicedAt: row.invoiced_at,
    shippedAt: row.shipped_at,
    invoiceNumber: row.invoice_number,
    qbInvoiceNumber: row.qb_invoice_number,
    packingSlipNumber: row.packing_slip_number,
    batchNumbers: String(row.batch_numbers ?? '')
      .split(',')
      .map((lotCode) => normalizeLotCode(lotCode))
      .filter(Boolean)
      .join(', '),
    orderedQty: Number(row.ordered_qty),
    fulfilledQty: Number(row.fulfilled_qty),
    invoiceQty: row.invoice_qty == null ? null : Number(row.invoice_qty),
    declinedQty: Number(row.declined_qty ?? 0),
    outstandingQty: Number(row.outstanding_qty),
    basePrice: Number(row.base_price),
    clientPrice: Number(row.client_price),
    overridePrice: row.override_price == null ? null : Number(row.override_price),
    effectivePrice: Number(row.effective_price),
    hasPriceOverride: Boolean(row.has_price_override),
    fulfilledValue: Number(row.fulfilled_value),
    orderedValue: Number(row.ordered_value),
  };
}

function profileToDb(user) {
  return {
    user_id: user.id,
    email: user.email ?? null,
    full_name: user.name,
    initials: user.initials,
    role: user.role,
    fulfil_orders: user.permissions.fulfilOrders,
    override_prices: user.permissions.overridePrices,
    edit_invoices: Boolean(user.permissions.editInvoices),
    manage_settings: user.permissions.manageSettings,
  };
}

function clientToDb(client) {
  return {
    id: client.id,
    name: client.name,
    price_tier: normalizePriceTier(client.priceTier),
    location_count: client.locationCount ?? 0,
    email_packing_slip: Boolean(client.emailPackingSlip),
    email_invoice: Boolean(client.emailInvoice),
    delivery_method: client.deliveryMethod,
    packing_slip_email: client.packingSlipEmail ?? null,
    invoice_email: client.invoiceEmail ?? null,
    qb_customer_name: client.qbCustomerName ?? client.name,
    qb_mapping_status: client.qbMappingStatus ?? 'ready',
    operating_as: client.operatingAs?.trim() || null,
  };
}

function locationToDb(location) {
  return {
    id: location.id,
    client_id: location.clientId,
    code: location.code ?? null,
    city: location.city ?? null,
    name: location.name,
    address_line1: location.addressLine1 ?? null,
    address_line2: location.addressLine2 ?? null,
    province: location.province ?? null,
    postal_code: location.postalCode ?? null,
    country: location.country ?? 'Canada',
    qb_ship_to_name: location.qbShipToName ?? location.name,
    qb_mapping_status: location.qbMappingStatus ?? 'needs_address',
    rep_name: location.repName?.trim() || null,
    rep_email: location.repEmail?.trim() || null,
    rep_phone: location.repPhone?.trim() || null,
  };
}

function productToDb(product) {
  const tierPrices = buildTierPrices(product.baseCataloguePrice, product.tierPrices);

  return {
    id: product.id,
    name: product.name,
    unit_size: product.unitSize,
    category: product.category ?? null,
    base_catalogue_price: getProductTierPrice({ ...product, tierPrices }, 1),
    tier_prices: tierPrices,
    item_number: product.itemNumber ?? null,
    upc: product.upc ?? null,
    packaging_details: product.packagingDetails ?? null,
    units_per_case: product.unitsPerCase == null || product.unitsPerCase === '' ? null : Number(product.unitsPerCase),
    shelf_life_days: product.shelfLifeDays == null || product.shelfLifeDays === '' ? null : Number(product.shelfLifeDays),
    lead_time_days: product.leadTimeDays == null || product.leadTimeDays === '' ? null : Number(product.leadTimeDays),
    order_unit_label: product.orderUnitLabel ?? null,
    qb_item_name: product.qbItemName ?? `${product.name} ${product.unitSize}`.trim(),
    qb_mapping_status: product.qbMappingStatus ?? 'ready',
    image_url: product.imageUrl ?? null,
    image_path: product.imagePath ?? null,
  };
}

function pricingToDb(pricing) {
  return {
    id: pricing.id,
    client_id: pricing.clientId,
    product_id: pricing.productId,
    price: Number(pricing.price ?? 0),
    is_active: Boolean(pricing.isActive),
  };
}

function customerContactToUi(contact) {
  return {
    userId: contact.user_id,
    email: contact.email,
    fullName: contact.full_name,
    clientId: contact.client_id,
    status: contact.status,
    createdAt: contact.created_at,
    updatedAt: contact.updated_at,
  };
}

function customerClientAssignmentToUi(row) {
  return {
    customerUserId: row.customer_user_id,
    clientId: row.client_id,
  };
}

function customerLocationAssignmentToUi(row) {
  return {
    customerUserId: row.customer_user_id,
    locationId: row.location_id,
  };
}

function batchToDb(batch) {
  return {
    id: batch.id,
    batch_number: normalizeLotCode(batch.batchNumber),
    product_id: batch.productId,
    production_date: batch.productionDate,
    qty_produced: Number(batch.qtyProduced),
    qty_remaining: Number(batch.qtyRemaining),
    status: batch.status,
  };
}

function orderToDb(order) {
  return {
    id: order.id,
    order_number: order.orderNumber,
    client_id: order.clientId,
    location_id: order.locationId,
    source: order.source,
    status: order.status,
    locked_by: order.lockedBy,
    locked_at: order.lockedAt,
    invoice_number: order.invoiceNumber,
    invoice_total: order.invoiceTotal,
    qb_invoice_number: order.qbInvoiceNumber,
    qb_txn_id: order.qbTxnId ?? null,
    qb_edit_sequence: order.qbEditSequence ?? null,
    qb_sync_status: order.qbSyncStatus,
    invoice_ship_to_name: order.invoiceShipToName ?? null,
    invoice_address_line1: order.invoiceAddressLine1 ?? null,
    invoice_address_line2: order.invoiceAddressLine2 ?? null,
    invoice_city: order.invoiceCity ?? null,
    invoice_province: order.invoiceProvince ?? null,
    invoice_postal_code: order.invoicePostalCode ?? null,
    invoice_country: order.invoiceCountry ?? null,
    packing_slip_number: order.packingSlipNumber,
    pod_signature_data_url: order.podSignatureDataUrl ?? null,
    pod_signed_by: order.podSignedBy ?? null,
    pod_signed_at: order.podSignedAt ?? null,
    pod_notes: order.podNotes ?? null,
    pod_captured_by: order.podCapturedBy ?? null,
    created_at: order.createdAt,
    fulfilled_at: order.fulfilledAt,
    invoiced_at: order.invoicedAt,
    qb_synced_at: order.qbSyncedAt,
    shipped_at: order.shippedAt,
    declined_at: order.declinedAt,
    decline_reason: order.declineReason,
    packing_slip_sent_at: order.packingSlipSentAt,
    invoice_email_sent_at: order.invoiceEmailSentAt,
  };
}

function orderItemToDb(orderId, item) {
  return {
    id: item.id,
    order_id: orderId,
    product_id: item.productId,
    quantity: Number(item.quantity),
    fulfilled_qty: Number(item.fulfilledQty),
    invoice_qty: item.invoiceQty == null ? null : Number(item.invoiceQty),
    declined_qty: Number(item.declinedQty ?? 0),
    base_price: Number(item.basePrice),
    client_price: Number(item.clientPrice),
    override_price: item.overridePrice == null ? null : Number(item.overridePrice),
    override_reason: item.overrideReason ?? null,
    qb_txn_line_id: item.qbTxnLineId ?? null,
  };
}

function assignmentToDb(orderItemId, assigned, index) {
  return {
    id: `${orderItemId}-${assigned.batchId}-${index + 1}`,
    order_item_id: orderItemId,
    batch_id: assigned.batchId,
    qty: Number(assigned.qty),
  };
}

function auditToDb(audit) {
  return {
    id: audit.id,
    timestamp: audit.timestamp,
    action: audit.action,
    order_id: audit.orderId,
    client_id: audit.clientId,
    user_id: audit.userId,
    user_name: audit.userName,
    details: audit.details,
    previous_value: audit.previousValue,
    new_value: audit.newValue,
  };
}

function quickBooksToDb(settings) {
  return {
    id: settings.id ?? 'singleton',
    connected: Boolean(settings.connected),
    company_name: settings.companyName,
    connector_name: settings.connectorName,
    status: settings.status,
    last_sync_at: settings.lastSyncAt,
    connector_last_seen_at: settings.connectorLastSeenAt ?? null,
    failed_sync_count: Number(settings.failedSyncCount ?? 0),
    next_invoice_sequence: Number(settings.nextInvoiceSequence),
  };
}

export async function fetchRemoteState(supabase, userId) {
  const [
    profilesResult,
    clientsResult,
    locationsResult,
    productsResult,
    pricingResult,
    batchesResult,
    ordersResult,
    orderItemsResult,
    assignmentsResult,
    auditResult,
    quickBooksResult,
    quickBooksJobsResult,
    reportRowsResult,
    notificationDismissalsResult,
    customerContactsResult,
    customerClientAssignmentsResult,
    customerLocationAssignmentsResult,
  ] = await Promise.all([
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('clients').select('*').order('name'),
    supabase.from('locations').select('*').order('name'),
    supabase.from('products').select('*').order('name'),
    supabase.from('client_product_prices').select('*'),
    supabase.from('batches').select('*').order('production_date', { ascending: false }),
    supabase.from('orders').select('*').order('created_at', { ascending: false }),
    supabase.from('order_items').select('*'),
    supabase.from('batch_assignments').select('*'),
    supabase.from('audit_events').select('*').order('timestamp', { ascending: false }),
    supabase.from('quickbooks_settings').select('*').limit(1).maybeSingle(),
    supabase.from('quickbooks_sync_jobs').select('*').order('created_at', { ascending: false }),
    supabase.from('report_order_lines').select('*').order('created_at', { ascending: false }),
    userId
      ? supabase
          .from('notification_dismissals')
          .select('*')
          .eq('user_id', userId)
          .order('dismissed_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabase.from('customer_contacts').select('*').order('created_at', { ascending: false }),
    supabase.from('customer_client_assignments').select('*'),
    supabase.from('customer_location_assignments').select('*'),
  ]);

  const results = [
    profilesResult,
    clientsResult,
    locationsResult,
    productsResult,
    pricingResult,
    batchesResult,
    ordersResult,
    orderItemsResult,
    assignmentsResult,
    auditResult,
    quickBooksResult,
    quickBooksJobsResult,
    reportRowsResult,
    notificationDismissalsResult,
    customerContactsResult,
    customerClientAssignmentsResult,
    customerLocationAssignmentsResult,
  ];

  const firstError = results
    .filter(
      (result) =>
        result !== reportRowsResult &&
        result !== notificationDismissalsResult &&
        result !== quickBooksJobsResult &&
        result !== customerContactsResult &&
        result !== customerClientAssignmentsResult &&
        result !== customerLocationAssignmentsResult
    )
    .find((result) => result.error)?.error;
  if (firstError) {
    throw firstError;
  }

  const assignmentsByItemId = new Map();
  (assignmentsResult.data ?? []).forEach((assignment) => {
    const current = assignmentsByItemId.get(assignment.order_item_id) ?? [];
    current.push({ batchId: assignment.batch_id, qty: Number(assignment.qty) });
    assignmentsByItemId.set(assignment.order_item_id, current);
  });

  const itemsByOrderId = new Map();
  (orderItemsResult.data ?? []).forEach((item) => {
    const current = itemsByOrderId.get(item.order_id) ?? [];
    current.push({
      id: item.id,
      productId: item.product_id,
      quantity: Number(item.quantity),
      fulfilledQty: Number(item.fulfilled_qty),
      invoiceQty: item.invoice_qty == null ? null : Number(item.invoice_qty),
      declinedQty: Number(item.declined_qty ?? 0),
      basePrice: Number(item.base_price),
      clientPrice: Number(item.client_price),
      overridePrice: item.override_price == null ? null : Number(item.override_price),
      overrideReason: item.override_reason,
      qbTxnLineId: item.qb_txn_line_id ?? null,
      assignedBatches: assignmentsByItemId.get(item.id) ?? [],
    });
    itemsByOrderId.set(item.order_id, current);
  });

  const orders = (ordersResult.data ?? []).map((order) => ({
    id: order.id,
    orderNumber: Number(order.order_number),
    clientId: order.client_id,
    locationId: order.location_id,
    source: order.source,
    status: order.status === 'shipped' && order.pod_signed_at ? 'delivered' : order.status,
    lockedBy: order.locked_by,
    lockedAt: order.locked_at,
    invoiceNumber: order.invoice_number,
    invoiceTotal: order.invoice_total == null ? null : Number(order.invoice_total),
    qbInvoiceNumber: order.qb_invoice_number,
    qbTxnId: order.qb_txn_id ?? null,
    qbEditSequence: order.qb_edit_sequence ?? null,
    qbSyncStatus: order.qb_sync_status,
    invoiceShipToName: order.invoice_ship_to_name ?? null,
    invoiceAddressLine1: order.invoice_address_line1 ?? null,
    invoiceAddressLine2: order.invoice_address_line2 ?? null,
    invoiceCity: order.invoice_city ?? null,
    invoiceProvince: order.invoice_province ?? null,
    invoicePostalCode: order.invoice_postal_code ?? null,
    invoiceCountry: order.invoice_country ?? null,
    packingSlipNumber: order.packing_slip_number,
    podSignatureDataUrl: order.pod_signature_data_url ?? null,
    podSignedBy: order.pod_signed_by ?? null,
    podSignedAt: order.pod_signed_at ?? null,
    podNotes: order.pod_notes ?? null,
    podCapturedBy: order.pod_captured_by ?? null,
    driverUserId: order.driver_user_id ?? null,
    driverAssignedAt: order.driver_assigned_at ?? null,
    driverAssignedBy: order.driver_assigned_by ?? null,
    createdAt: order.created_at,
    fulfilledAt: order.fulfilled_at,
    invoicedAt: order.invoiced_at,
    qbSyncedAt: order.qb_synced_at,
    shippedAt: order.shipped_at,
    declinedAt: order.declined_at,
    declineReason: order.decline_reason,
    packingSlipSentAt: order.packing_slip_sent_at,
    invoiceEmailSentAt: order.invoice_email_sent_at,
    items: itemsByOrderId.get(order.id) ?? [],
  }));

  const fallbackReportRows = buildReportRowsFromOrders({
    orders,
    clients: (clientsResult.data ?? []).map(clientToUi),
    locations: (locationsResult.data ?? []).map(locationToUi),
    products: (productsResult.data ?? []).map(productToUi),
    batches: (batchesResult.data ?? []).map(batchToUi),
  });

  const reportRows = reportRowsResult.error ? fallbackReportRows : (reportRowsResult.data ?? []).map(reportLineToUi);

  return {
    users: (profilesResult.data ?? []).map(profileToUi),
    clients: (clientsResult.data ?? []).map(clientToUi),
    locations: (locationsResult.data ?? []).map(locationToUi),
    products: (productsResult.data ?? []).map(productToUi),
    clientPricing: (pricingResult.data ?? []).map(pricingToUi),
    batches: (batchesResult.data ?? []).map(batchToUi),
    orders,
    auditLog: (auditResult.data ?? []).map(auditToUi),
    notificationDismissals: notificationDismissalsResult.error
      ? []
      : (notificationDismissalsResult.data ?? []).map(notificationDismissalToUi),
    quickBooks: quickBooksToUi(quickBooksResult.data),
    quickBooksJobs: quickBooksJobsResult.error ? [] : (quickBooksJobsResult.data ?? []).map(quickBooksJobToUi),
    reportRows,
    customerContacts: customerContactsResult.error ? [] : (customerContactsResult.data ?? []).map(customerContactToUi),
    customerClientAssignments: customerClientAssignmentsResult.error ? [] : (customerClientAssignmentsResult.data ?? []).map(customerClientAssignmentToUi),
    customerLocationAssignments: customerLocationAssignmentsResult.error ? [] : (customerLocationAssignmentsResult.data ?? []).map(customerLocationAssignmentToUi),
  };
}

/**
 * Custom error thrown when a recognized user is in the disabled state.
 * The AuthScreen / provider catches this to sign them out and surface a
 * clear message instead of letting them into the app.
 */
export class AccountDisabledError extends Error {
  constructor() {
    super('Your account has been disabled. Contact a settings admin to re-enable it.');
    this.name = 'AccountDisabledError';
    this.code = 'ACCOUNT_DISABLED';
  }
}

export async function fetchAuthIdentity(supabase, userId) {
  const { data: staffProfile, error: staffError } = await supabase
    .from('profiles')
    .select('user_id, role, disabled_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (staffError) throw staffError;
  if (staffProfile) {
    if (staffProfile.disabled_at) throw new AccountDisabledError();
    if (staffProfile.role === 'driver') return 'driver';
    return 'staff';
  }

  // Customer side — block disabled status too.
  const { data: contact } = await supabase
    .from('customer_contacts')
    .select('user_id, status')
    .eq('user_id', userId)
    .maybeSingle();
  if (contact?.status === 'disabled') throw new AccountDisabledError();

  return 'customer';
}

export async function fetchDriverPortalState(supabase, userId) {
  const data = await fetchRemoteState(supabase, userId);
  // Drivers only see orders that are (a) still in shipped status — meaning
  // POD hasn't been captured yet — AND (b) explicitly assigned to them.
  // Once POD is captured the order flips to "delivered" and disappears from
  // the queue immediately.
  const isDriverVisible = (order) =>
    order.status === 'shipped' && order.driverUserId === userId;

  const driverOrders = data.orders.filter(isDriverVisible);
  const visibleOrderIds = new Set(driverOrders.map((order) => order.id));

  return {
    ...data,
    orders: driverOrders,
    auditLog: data.auditLog.filter((entry) => {
      if (!entry.orderId) return false;
      return visibleOrderIds.has(entry.orderId);
    }),
    quickBooksJobs: [],
    reportRows: [],
    customerContacts: [],
    customerClientAssignments: [],
    customerLocationAssignments: [],
  };
}

export async function fetchCustomerPortalState(supabase, user) {
  const { data: contact, error: contactError } = await supabase
    .from('customer_contacts')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (contactError) throw contactError;

  if (!contact) {
    return {
      contact: null,
      clients: [],
      locations: [],
      products: [],
      recentOrders: [],
      assignedClientIds: [],
      assignedLocationIds: [],
    };
  }

  // Fetch junction-table assignments for this customer.
  const [clientAssignResult, locationAssignResult] = await Promise.all([
    supabase.from('customer_client_assignments').select('client_id').eq('customer_user_id', user.id),
    supabase.from('customer_location_assignments').select('location_id').eq('customer_user_id', user.id),
  ]);

  const assignedClientIds = (clientAssignResult.data ?? []).map((r) => r.client_id);
  const assignedLocationIds = (locationAssignResult.data ?? []).map((r) => r.location_id);

  if (contact.status !== 'active' || assignedClientIds.length === 0) {
    return {
      contact: customerContactToUi(contact),
      clients: [],
      locations: [],
      products: [],
      recentOrders: [],
      assignedClientIds,
      assignedLocationIds,
    };
  }

  // Fetch data for ALL assigned clients.
  const [
    clientsResult,
    locationsResult,
    productsResult,
    pricingResult,
    ordersResult,
    orderItemsResult,
  ] = await Promise.all([
    supabase.from('clients').select('*').in('id', assignedClientIds).order('name'),
    assignedLocationIds.length > 0
      ? supabase.from('locations').select('*').in('id', assignedLocationIds).order('name')
      : Promise.resolve({ data: [], error: null }),
    supabase.from('products').select('*').order('name'),
    supabase.from('client_product_prices').select('*').in('client_id', assignedClientIds),
    supabase
      .from('orders')
      .select('*')
      .in('client_id', assignedClientIds)
      .eq('source', 'portal')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('order_items').select('*'),
  ]);

  const firstError = [clientsResult, locationsResult, productsResult, pricingResult, ordersResult, orderItemsResult].find(
    (result) => result.error
  )?.error;
  if (firstError) throw firstError;

  const productsById = new Map((productsResult.data ?? []).map((product) => [product.id, productToUi(product)]));
  const products = (pricingResult.data ?? [])
    .filter((pricing) => assignedClientIds.includes(pricing.client_id))
    .filter((pricing) => pricing.is_active && Number(pricing.price) > 0)
    .map((pricing) => {
      const productUi = productsById.get(pricing.product_id);
      if (!productUi) return null;

      return {
        ...productUi,
        clientPrice: Number(pricing.price),
        pricingId: pricing.id,
        pricingClientId: pricing.client_id,
      };
    })
    .filter(Boolean)
    .sort((left, right) =>
      `${left.name} ${left.unitSize}`.localeCompare(`${right.name} ${right.unitSize}`)
    );

  const itemsByOrderId = new Map();
  (orderItemsResult.data ?? []).forEach((item) => {
    const current = itemsByOrderId.get(item.order_id) ?? [];
    current.push({
      id: item.id,
      productId: item.product_id,
      quantity: Number(item.quantity),
      fulfilledQty: Number(item.fulfilled_qty),
      invoiceQty: item.invoice_qty == null ? null : Number(item.invoice_qty),
      declinedQty: Number(item.declined_qty ?? 0),
      basePrice: Number(item.base_price),
      clientPrice: Number(item.client_price),
      overridePrice: item.override_price == null ? null : Number(item.override_price),
      overrideReason: item.override_reason,
      assignedBatches: [],
    });
    itemsByOrderId.set(item.order_id, current);
  });

  const recentOrders = (ordersResult.data ?? []).map((order) => ({
    id: order.id,
    orderNumber: Number(order.order_number),
    clientId: order.client_id,
    locationId: order.location_id,
    source: order.source,
    status: order.status === 'shipped' && order.pod_signed_at ? 'delivered' : order.status,
    createdAt: order.created_at,
    items: itemsByOrderId.get(order.id) ?? [],
  }));

  return {
    contact: customerContactToUi(contact),
    clients: (clientsResult.data ?? []).map(clientToUi),
    // Backward compat: keep single `client` as first assigned client.
    client: clientsResult.data?.length ? clientToUi(clientsResult.data[0]) : null,
    locations: (locationsResult.data ?? []).map(locationToUi),
    products,
    recentOrders,
    assignedClientIds,
    assignedLocationIds,
  };
}

export async function registerCustomerProfile(supabase, fullName) {
  return callRpc(supabase, 'modhanios_register_customer_profile', {
    p_full_name: fullName,
  });
}

export async function submitCustomerOrder(supabase, { clientId, locationId, items }) {
  return callRpc(supabase, 'modhanios_submit_customer_order', {
    p_client_id: clientId,
    p_location_id: locationId,
    p_items: items,
  });
}

export async function persistNotificationDismissals(supabase, userId, notificationKeys) {
  if (!notificationKeys.length) return { error: null, data: [] };

  const rows = notificationKeys.map((notificationKey) => ({
    user_id: userId,
    notification_key: notificationKey,
    dismissed_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from('notification_dismissals')
    .upsert(rows, { onConflict: 'user_id,notification_key' })
    .select('*');

  return {
    data: (data ?? []).map(notificationDismissalToUi),
    error,
  };
}

export async function executeWorkflowAction(supabase, action, currentUser) {
  switch (action.type) {
    case 'LOCK_ORDER':
      return callRpc(supabase, 'modhanios_lock_order', {
        p_order_id: action.payload.orderId,
        p_user_id: currentUser.id,
      });
    case 'UNLOCK_ORDER':
      return callRpc(supabase, 'modhanios_unlock_order', {
        p_order_id: action.payload.orderId,
        p_user_id: currentUser.id,
      });
    case 'APPLY_FULFILMENT':
      return callRpc(supabase, 'modhanios_apply_fulfilment', {
        p_order_id: action.payload.orderId,
        p_user_id: currentUser.id,
        p_assignments: action.payload.assignments,
      });
    case 'APPLY_FULFILMENT_AND_DECLINE_REMAINING':
      return callRpc(supabase, 'modhanios_apply_fulfilment_close_remaining', {
        p_order_id: action.payload.orderId,
        p_user_id: currentUser.id,
        p_assignments: action.payload.assignments,
        p_reason: action.payload.reason,
      });
    case 'DECLINE_ORDER':
      return callRpc(supabase, 'modhanios_decline_order', {
        p_order_id: action.payload.orderId,
        p_user_id: currentUser.id,
        p_reason: action.payload.reason,
      });
    case 'CREATE_INVOICE':
      return callRpc(supabase, 'modhanios_create_invoice', {
        p_order_id: action.payload.orderId,
        p_user_id: currentUser.id,
        p_invoice_number: action.payload.invoiceNumber,
        p_overrides: action.payload.overrides,
        p_invoice_email_sent_at: action.payload.invoiceEmailSentAt,
        p_ship_to_name: action.payload.shipTo?.name ?? null,
        p_ship_to_address_line1: action.payload.shipTo?.addressLine1 ?? null,
        p_ship_to_address_line2: action.payload.shipTo?.addressLine2 ?? null,
        p_ship_to_city: action.payload.shipTo?.city ?? null,
        p_ship_to_province: action.payload.shipTo?.province ?? null,
        p_ship_to_postal_code: action.payload.shipTo?.postalCode ?? null,
        p_ship_to_country: action.payload.shipTo?.country ?? null,
      });
    case 'EDIT_INVOICE':
      return callRpc(supabase, 'modhanios_update_invoice', {
        p_order_id: action.payload.orderId,
        p_user_id: currentUser.id,
        p_lines: action.payload.lines,
        p_reason: action.payload.reason,
        p_ship_to: action.payload.shipTo ?? null,
      });
    case 'PUSH_QB_INVOICE':
      return callRpc(supabase, 'modhanios_push_qb_invoice', {
        p_order_id: action.payload.orderId,
        p_user_id: currentUser.id,
        p_qb_invoice_number: action.payload.qbInvoiceNumber,
      });
    case 'QUEUE_QB_INVOICE':
      return callRpc(supabase, 'modhanios_queue_qb_invoice', {
        p_order_id: action.payload.orderId,
        p_user_id: currentUser.id,
      });
    case 'CONFIRM_SHIPMENT':
      return callRpc(supabase, 'modhanios_confirm_shipment', {
        p_order_id: action.payload.orderId,
        p_user_id: currentUser.id,
        p_packing_slip_number: action.payload.packingSlipNumber,
        p_packing_slip_sent_at: action.payload.packingSlipSentAt,
      });
    case 'COMPLETE_DELIVERY_POD':
      return callRpc(supabase, 'modhanios_complete_delivery_pod', {
        p_order_id: action.payload.orderId,
        p_user_id: currentUser.id,
        p_signed_by: action.payload.signedBy,
        p_signature_data_url: action.payload.signatureDataUrl,
        p_notes: action.payload.notes ?? null,
      });
    case 'LOG_PRODUCTION_BATCH':
      return callRpc(supabase, 'modhanios_log_production_batch', {
        p_batch_id: action.payload.id,
        p_batch_number: action.payload.batchNumber,
        p_product_id: action.payload.productId,
        p_production_date: action.payload.productionDate,
        p_qty_produced: action.payload.qtyProduced,
        p_user_id: currentUser.id,
      });
    case 'EDIT_PRODUCTION_BATCH':
      return callRpc(supabase, 'modhanios_edit_production_batch', {
        p_batch_id: action.payload.id,
        p_user_id: currentUser.id,
        p_new_qty: action.payload.qtyProduced,
        p_reason: action.payload.reason ?? null,
      });
    case 'SOFT_DELETE_BATCH':
      return callRpc(supabase, 'modhanios_soft_delete_batch', {
        p_batch_id: action.payload.id,
        p_user_id: currentUser.id,
        p_reason: action.payload.reason ?? null,
      });
    case 'RESTORE_BATCH':
      return callRpc(supabase, 'modhanios_restore_batch', {
        p_batch_id: action.payload.id,
        p_user_id: currentUser.id,
      });
    case 'ASSIGN_DRIVER':
      return callRpc(supabase, 'modhanios_assign_driver', {
        p_order_id: action.payload.orderId,
        p_user_id: currentUser.id,
        p_driver_user_id: action.payload.driverUserId ?? null,
      });
    default:
      return { error: null };
  }
}

export async function executeAdminAction(supabase, action, currentUser, currentState) {
  switch (action.type) {
    case 'ADD_PRODUCT':
    case 'UPDATE_PRODUCT': {
      const product = action.payload;
      return callRpc(supabase, 'modhanios_upsert_product', {
        p_user_id: currentUser.id,
        p_id: product.id,
        p_name: product.name,
        p_unit_size: product.unitSize,
        p_category: product.category ?? null,
        p_base_catalogue_price: Number(product.baseCataloguePrice ?? 0),
        p_tier_prices: buildTierPrices(product.baseCataloguePrice, product.tierPrices),
        p_item_number: product.itemNumber ?? null,
        p_upc: product.upc ?? null,
        p_packaging_details: product.packagingDetails ?? null,
        p_units_per_case: product.unitsPerCase == null || product.unitsPerCase === '' ? null : Number(product.unitsPerCase),
        p_shelf_life_days: product.shelfLifeDays == null || product.shelfLifeDays === '' ? null : Number(product.shelfLifeDays),
        p_lead_time_days: product.leadTimeDays == null || product.leadTimeDays === '' ? null : Number(product.leadTimeDays),
        p_order_unit_label: product.orderUnitLabel ?? null,
        p_qb_item_name: product.qbItemName ?? `${product.name} ${product.unitSize}`.trim(),
        p_image_url: product.imageUrl ?? null,
        p_image_path: product.imagePath ?? null,
      });
    }
    case 'ADD_CLIENT':
    case 'UPDATE_CLIENT': {
      const existingClient =
        action.type === 'UPDATE_CLIENT'
          ? currentState.clients.find((client) => client.id === action.payload.id)
          : null;
      const client = {
        ...existingClient,
        ...action.payload,
      };
      const existingLocations = currentState.locations.filter((location) => location.clientId === client.id).length;
      return callRpc(supabase, 'modhanios_upsert_client', {
        p_user_id: currentUser.id,
        p_id: client.id,
        p_name: client.name,
        p_location_count: Number(client.locationCount ?? existingLocations ?? 0),
        p_delivery_method: client.deliveryMethod,
        p_email_packing_slip: Boolean(client.emailPackingSlip),
        p_email_invoice: Boolean(client.emailInvoice),
        p_packing_slip_email: client.packingSlipEmail ?? null,
        p_invoice_email: client.invoiceEmail ?? null,
        p_qb_customer_name: client.qbCustomerName ?? client.name,
        p_operating_as: client.operatingAs?.trim() || null,
      });
    }
    case 'ADD_LOCATION':
    case 'UPDATE_LOCATION': {
      const location = action.payload;
      return callRpc(supabase, 'modhanios_upsert_location', {
        p_user_id: currentUser.id,
        p_id: location.id,
        p_client_id: location.clientId,
        p_code: location.code ?? null,
        p_city: location.city ?? null,
        p_name: location.name,
        p_address_line1: location.addressLine1 ?? null,
        p_address_line2: location.addressLine2 ?? null,
        p_province: location.province ?? null,
        p_postal_code: location.postalCode ?? null,
        p_country: location.country ?? 'Canada',
        p_qb_ship_to_name: location.qbShipToName ?? location.name,
        p_rep_name: location.repName?.trim() || null,
        p_rep_email: location.repEmail?.trim() || null,
        p_rep_phone: location.repPhone?.trim() || null,
      });
    }
    case 'SET_CLIENT_PRICING': {
      const pricing = action.payload;
      return callRpc(supabase, 'modhanios_set_client_price', {
        p_user_id: currentUser.id,
        p_id: pricing.id,
        p_client_id: pricing.clientId,
        p_product_id: pricing.productId,
        p_price: Number(pricing.price ?? 0),
        p_is_active: Boolean(pricing.isActive),
      });
    }
    case 'SAVE_CLIENT_CATALOGUE':
      return callRpc(supabase, 'modhanios_save_client_catalogue', {
        p_user_id: currentUser.id,
        p_client_id: action.payload.clientId,
        p_price_tier: normalizePriceTier(action.payload.priceTier),
        p_enabled_product_ids: action.payload.enabledProductIds ?? [],
      });
    case 'ADD_BATCH':
      return callRpc(supabase, 'modhanios_log_production_batch', {
        p_batch_id: action.payload.id,
        p_batch_number: action.payload.batchNumber,
        p_product_id: action.payload.productId,
        p_production_date: action.payload.productionDate,
        p_qty_produced: action.payload.qtyProduced,
        p_user_id: currentUser.id,
      });
    case 'UPDATE_BATCH':
      return upsertRow(supabase, 'batches', batchToDb(action.payload));
    case 'UPDATE_CUSTOMER_CONTACT': {
      const contact = action.payload;
      return callRpc(supabase, 'modhanios_update_customer_contact', {
        p_user_id: currentUser.id,
        p_contact_user_id: contact.userId,
        p_full_name: contact.fullName,
        p_client_id: contact.clientId || null,
        p_status: contact.status,
      });
    }
    case 'UPDATE_CUSTOMER_ASSIGNMENTS': {
      const { customerUserId, clientIds, locationIds } = action.payload;

      // Snapshot the existing rows BEFORE deleting so we can rollback if
      // any subsequent step fails. Supabase doesn't expose multi-table
      // transactions to the client, so this is a best-effort manual undo.
      const [existingClientsResult, existingLocationsResult, existingContactResult] =
        await Promise.all([
          supabase
            .from('customer_client_assignments')
            .select('customer_user_id, client_id')
            .eq('customer_user_id', customerUserId),
          supabase
            .from('customer_location_assignments')
            .select('customer_user_id, location_id')
            .eq('customer_user_id', customerUserId),
          supabase
            .from('customer_contacts')
            .select('client_id')
            .eq('user_id', customerUserId)
            .maybeSingle(),
        ]);

      if (existingClientsResult.error) return { error: existingClientsResult.error };
      if (existingLocationsResult.error) return { error: existingLocationsResult.error };
      if (existingContactResult.error) return { error: existingContactResult.error };

      const existingClients = existingClientsResult.data ?? [];
      const existingLocations = existingLocationsResult.data ?? [];
      const existingContact = existingContactResult.data ?? null;

      const rollback = async () => {
        // Try to restore previous state; ignore errors so we don't mask the
        // original failure that triggered the rollback.
        await supabase
          .from('customer_client_assignments')
          .delete()
          .eq('customer_user_id', customerUserId);
        await supabase
          .from('customer_location_assignments')
          .delete()
          .eq('customer_user_id', customerUserId);
        if (existingClients?.length) {
          await supabase.from('customer_client_assignments').insert(existingClients);
        }
        if (existingLocations?.length) {
          await supabase.from('customer_location_assignments').insert(existingLocations);
        }
        if (existingContact) {
          await supabase
            .from('customer_contacts')
            .update({ client_id: existingContact.client_id ?? null })
            .eq('user_id', customerUserId);
        }
      };

      const { error: delClientErr } = await supabase
        .from('customer_client_assignments')
        .delete()
        .eq('customer_user_id', customerUserId);
      if (delClientErr) return { error: delClientErr };

      const { error: delLocErr } = await supabase
        .from('customer_location_assignments')
        .delete()
        .eq('customer_user_id', customerUserId);
      if (delLocErr) {
        await rollback();
        return { error: delLocErr };
      }

      if (clientIds.length > 0) {
        const clientRows = clientIds.map((cid) => ({
          customer_user_id: customerUserId,
          client_id: cid,
        }));
        const { error: insClientErr } = await supabase
          .from('customer_client_assignments')
          .insert(clientRows);
        if (insClientErr) {
          await rollback();
          return { error: insClientErr };
        }
      }

      if (locationIds.length > 0) {
        const locationRows = locationIds.map((lid) => ({
          customer_user_id: customerUserId,
          location_id: lid,
        }));
        const { error: insLocErr } = await supabase
          .from('customer_location_assignments')
          .insert(locationRows);
        if (insLocErr) {
          await rollback();
          return { error: insLocErr };
        }
      }

      // Also update the legacy client_id on customer_contacts for backward compat.
      const { error: contactUpdateErr } = await supabase
        .from('customer_contacts')
        .update({ client_id: clientIds[0] || null })
        .eq('user_id', customerUserId);
      if (contactUpdateErr) {
        await rollback();
        return { error: contactUpdateErr };
      }

      return { error: null };
    }
    case 'UPDATE_USER': {
      const targetUser = currentState.users.find((user) => user.id === action.payload.id);
      if (!targetUser) {
        return { error: new Error('Target user not found.') };
      }

      const nextPermissions = {
        ...targetUser.permissions,
        ...(action.payload.permissions ?? {}),
      };

      return callRpc(supabase, 'modhanios_update_staff_permissions', {
        p_user_id: currentUser.id,
        p_target_user_id: targetUser.id,
        p_fulfil_orders: Boolean(nextPermissions.fulfilOrders),
        p_override_prices: Boolean(nextPermissions.overridePrices),
        p_edit_invoices: Boolean(nextPermissions.editInvoices),
        p_manage_settings: Boolean(nextPermissions.manageSettings),
      });
    }
    case 'UPDATE_QB_SETTINGS':
      return callRpc(supabase, 'modhanios_update_quickbooks_settings', {
        p_user_id: currentUser.id,
        p_company_name: action.payload.companyName ?? currentState.quickBooks.companyName,
        p_connector_name: action.payload.connectorName ?? currentState.quickBooks.connectorName,
      });
    default:
      return { error: null };
  }
}

export async function persistAction(supabase, action, previousState, nextState) {
  switch (action.type) {
    case 'ADD_PRODUCT':
    case 'UPDATE_PRODUCT':
      return upsertRow(supabase, 'products', productToDb(action.payload));
    case 'ADD_CLIENT':
    case 'UPDATE_CLIENT':
      return upsertRow(supabase, 'clients', clientToDb(action.payload));
    case 'ADD_LOCATION':
    case 'UPDATE_LOCATION':
      return upsertRow(supabase, 'locations', locationToDb(action.payload));
    case 'SET_CLIENT_PRICING':
      return supabase.from('client_product_prices').upsert(pricingToDb(action.payload), {
        onConflict: 'client_id,product_id',
      });
    case 'SAVE_CLIENT_CATALOGUE': {
      const client = nextState.clients.find((entry) => entry.id === action.payload.clientId);
      const clientPricing = nextState.clientPricing.filter((entry) => entry.clientId === action.payload.clientId);

      if (client) {
        const { error: clientError } = await supabase
          .from('clients')
          .update({ price_tier: normalizePriceTier(client.priceTier) })
          .eq('id', client.id);
        if (clientError) return { error: clientError };
      }

      if (!clientPricing.length) return { error: null };
      return supabase.from('client_product_prices').upsert(clientPricing.map(pricingToDb), {
        onConflict: 'client_id,product_id',
      });
    }
    case 'ADD_BATCH':
    case 'UPDATE_BATCH':
      return upsertRow(supabase, 'batches', batchToDb(action.payload));
    case 'ADD_ORDER':
      return persistOrderGraph(supabase, action.payload);
    case 'LOCK_ORDER':
    case 'UNLOCK_ORDER':
    case 'DECLINE_ORDER':
    case 'CREATE_INVOICE':
    case 'EDIT_INVOICE':
    case 'PUSH_QB_INVOICE':
    case 'QUEUE_QB_INVOICE':
    case 'CONFIRM_SHIPMENT': {
      const order = nextState.orders.find((entry) => entry.id === action.payload.orderId);
      if (!order) return { error: null };
      await persistOrderGraph(supabase, order);
      if (action.type === 'PUSH_QB_INVOICE') {
        return upsertRow(supabase, 'quickbooks_settings', quickBooksToDb(nextState.quickBooks));
      }
      return { error: null };
    }
    case 'APPLY_FULFILMENT': {
      const order = nextState.orders.find((entry) => entry.id === action.payload.orderId);
      if (!order) return { error: null };
      const touchedBatchIds = new Set(action.payload.assignments.map((assignment) => assignment.batchId));
      const touchedBatches = nextState.batches.filter((batch) => touchedBatchIds.has(batch.id));
      await persistOrderGraph(supabase, order);
      if (touchedBatches.length) {
        const { error } = await supabase.from('batches').upsert(touchedBatches.map(batchToDb));
        if (error) return { error };
      }
      return { error: null };
    }
    case 'UPDATE_USER': {
      const user = nextState.users.find((entry) => entry.id === action.payload.id);
      if (!user) return { error: null };
      const { error } = await supabase.from('profiles').update(profileToDb(user)).eq('user_id', user.id);
      return { error };
    }
    case 'UPDATE_QB_SETTINGS':
      return upsertRow(supabase, 'quickbooks_settings', quickBooksToDb(nextState.quickBooks));
    case 'ADD_AUDIT':
      return upsertRow(supabase, 'audit_events', auditToDb(action.payload));
    default:
      return { error: null };
  }
}

async function callRpc(supabase, fn, params) {
  const { data, error } = await supabase.rpc(fn, params);
  return { data, error };
}

async function upsertRow(supabase, table, payload) {
  const { error } = await supabase.from(table).upsert(payload);
  return { error };
}

async function persistOrderGraph(supabase, order) {
  const { error: orderError } = await supabase.from('orders').upsert(orderToDb(order));
  if (orderError) return { error: orderError };

  const orderItems = order.items.map((item) => orderItemToDb(order.id, item));
  if (orderItems.length) {
    const { error: itemsError } = await supabase.from('order_items').upsert(orderItems);
    if (itemsError) return { error: itemsError };
  }

  const itemIds = order.items.map((item) => item.id);
  if (itemIds.length) {
    const { error: deleteError } = await supabase.from('batch_assignments').delete().in('order_item_id', itemIds);
    if (deleteError) return { error: deleteError };
  }

  const assignments = order.items.flatMap((item) =>
    item.assignedBatches.map((assigned, index) => assignmentToDb(item.id, assigned, index))
  );

  if (assignments.length) {
    const { error: assignmentError } = await supabase.from('batch_assignments').insert(assignments);
    if (assignmentError) return { error: assignmentError };
  }

  return { error: null };
}

export function buildAuthSeedUsers(users) {
  return users.map((user) => ({
    email: user.email,
    fullName: user.name,
    initials: user.initials,
    role: user.role,
    permissions: user.permissions,
  }));
}
