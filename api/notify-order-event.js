import { getAdminClient, getCallerFromBearer } from '../src/server/email/supabaseAdmin.js';
import { sendTransactionalEmail } from '../src/server/email/resendClient.js';
import { buildOrderEmail } from '../src/server/email/orderEmailTemplates.js';
import { publicContactEmail } from '../src/server/auth/userCredentials.js';

const ALLOWED_EVENTS = new Set([
  'order_received',
  'order_shipped',
  'order_delivered',
  'order_updated',
  'invoice_ready',
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const { orderId, eventType } = req.body ?? {};
  if (!orderId || typeof orderId !== 'string') {
    return res.status(400).json({ ok: false, error: 'Order ID is required.' });
  }
  if (!eventType || !ALLOWED_EVENTS.has(eventType)) {
    return res.status(400).json({ ok: false, error: 'Unsupported email event type.' });
  }

  let supabase;
  try {
    supabase = getAdminClient();
  } catch (configError) {
    return res.status(500).json({ ok: false, error: configError.message });
  }

  const callerResult = await getCallerFromBearer(req, supabase);
  if (callerResult.error) {
    return res.status(callerResult.status).json({ ok: false, error: callerResult.error });
  }

  const orderContextResult = await loadOrderContext(supabase, orderId);
  if (!orderContextResult.ok) {
    return res.status(orderContextResult.status).json({ ok: false, error: orderContextResult.error });
  }

  const context = orderContextResult.context;
  const access = await canNotifyOrder(supabase, callerResult, context.order);
  if (!access.ok) {
    return res.status(access.status).json({ ok: false, error: access.error });
  }

  const recipients = await resolveRecipients(supabase, eventType, context.order, context.client);
  if (!recipients.length) {
    await writeEmailAudit(supabase, callerResult, context, eventType, false, 'No recipient email is configured.');
    return res.status(200).json({
      ok: false,
      skipped: true,
      error: 'No recipient email is configured for this order.',
    });
  }

  const email = buildOrderEmail({ eventType, ...context });
  let sendResult;
  try {
    sendResult = await sendTransactionalEmail({
      to: recipients,
      subject: email.subject,
      html: email.html,
      text: email.text,
      idempotencyKey: `modhanios-${eventType}-${context.order.id}`,
    });
  } catch (error) {
    sendResult = { ok: false, error: error.message };
  }

  await writeEmailAudit(
    supabase,
    callerResult,
    context,
    eventType,
    sendResult.ok,
    sendResult.ok
      ? `Sent ${email.label} email to ${recipients.join(', ')}`
      : `Failed ${email.label} email to ${recipients.join(', ')}: ${sendResult.error}`
  );

  if (!sendResult.ok) {
    return res.status(502).json({ ok: false, error: sendResult.error });
  }

  return res.status(200).json({
    ok: true,
    eventType,
    recipients,
    emailId: sendResult.id,
  });
}

async function loadOrderContext(supabase, orderId) {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();

  if (orderError) return { ok: false, status: 500, error: orderError.message };
  if (!order) return { ok: false, status: 404, error: 'Order not found.' };

  const [clientResult, locationResult, itemResult] = await Promise.all([
    supabase.from('clients').select('*').eq('id', order.client_id).maybeSingle(),
    supabase.from('locations').select('*').eq('id', order.location_id).maybeSingle(),
    supabase.from('order_items').select('*').eq('order_id', order.id),
  ]);

  const firstError = [clientResult, locationResult, itemResult].find((result) => result.error)?.error;
  if (firstError) return { ok: false, status: 500, error: firstError.message };

  const productIds = [...new Set((itemResult.data ?? []).map((item) => item.product_id).filter(Boolean))];
  const productResult = productIds.length
    ? await supabase.from('products').select('*').in('id', productIds)
    : { data: [], error: null };

  if (productResult.error) {
    return { ok: false, status: 500, error: productResult.error.message };
  }

  const productsById = new Map((productResult.data ?? []).map((product) => [product.id, product]));
  const items = (itemResult.data ?? []).map((item) => ({
    ...item,
    product: productsById.get(item.product_id) ?? null,
  }));

  return {
    ok: true,
    context: {
      order,
      client: clientResult.data,
      location: locationResult.data,
      items,
    },
  };
}

async function canNotifyOrder(supabase, caller, order) {
  if (caller.profile) return { ok: true };

  if (!caller.contact || caller.contact.status !== 'active') {
    return { ok: false, status: 403, error: 'Only active customers or staff can send order notifications.' };
  }

  const [clientAccess, locationAccess] = await Promise.all([
    supabase
      .from('customer_client_assignments')
      .select('customer_user_id')
      .eq('customer_user_id', caller.user.id)
      .eq('client_id', order.client_id)
      .maybeSingle(),
    supabase
      .from('customer_location_assignments')
      .select('customer_user_id')
      .eq('customer_user_id', caller.user.id)
      .eq('location_id', order.location_id)
      .maybeSingle(),
  ]);

  if (clientAccess.error || locationAccess.error || !clientAccess.data || !locationAccess.data) {
    return { ok: false, status: 403, error: 'This customer cannot notify for that order.' };
  }

  return { ok: true };
}

async function resolveRecipients(supabase, eventType, order, client) {
  if (eventType === 'order_shipped' && client?.email_packing_slip && client?.packing_slip_email) {
    return normalizeRecipients(client.packing_slip_email);
  }

  if (eventType === 'invoice_ready' && client?.email_invoice && client?.invoice_email) {
    return normalizeRecipients(client.invoice_email);
  }

  const [clientContactsResult, locationContactsResult] = await Promise.all([
    supabase
      .from('customer_client_assignments')
      .select('customer_user_id')
      .eq('client_id', order.client_id),
    supabase
      .from('customer_location_assignments')
      .select('customer_user_id')
      .eq('location_id', order.location_id),
  ]);

  if (clientContactsResult.error || locationContactsResult.error) {
    return [];
  }

  const locationUserIds = new Set((locationContactsResult.data ?? []).map((row) => row.customer_user_id));
  const matchingUserIds = (clientContactsResult.data ?? [])
    .filter((row) => locationUserIds.has(row.customer_user_id))
    .map((row) => row.customer_user_id);

  const contactResult = matchingUserIds.length
    ? await supabase
        .from('customer_contacts')
        .select('email, contact_email')
        .in('user_id', matchingUserIds)
        .eq('status', 'active')
    : { data: [], error: null };

  if (contactResult.error) return [];

  const matchingContacts = (contactResult.data ?? []).map((contact) => publicContactEmail(contact));

  const fallbackEmails = [
    client?.email_packing_slip ? client?.packing_slip_email : null,
    client?.email_invoice ? client?.invoice_email : null,
  ];

  return normalizeRecipients([...matchingContacts, ...fallbackEmails]);
}

async function writeEmailAudit(supabase, caller, context, eventType, success, details) {
  await supabase.rpc('modhanios_insert_audit', {
    p_action: success ? 'email_sent' : 'email_failed',
    p_order_id: context.order.id,
    p_client_id: context.order.client_id,
    p_user_id: caller.auditUserId,
    p_user_name: caller.auditUserName,
    p_details: details,
    p_previous_value: eventType,
    p_new_value: success ? 'sent' : 'failed',
  }).then(() => null, () => null);
}

function normalizeRecipients(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(
    values
      .map((entry) => String(entry ?? '').trim().toLowerCase())
      .filter((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry))
  )];
}
