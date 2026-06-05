import { getAdminClient } from '../src/server/email/supabaseAdmin.js';
import {
  ensureUsernameAvailable,
  getRequestAppUrl,
  internalAuthEmailForUsername,
  normalizeOptionalEmail,
  normalizeUsername,
  requireSettingsAdmin,
  sendCredentialEmail,
  upsertCredentialRecord,
  validatePassword,
  validateUsername,
} from '../src/server/auth/userCredentials.js';

const ALLOWED_ROLES = new Set(['staff', 'driver', 'customer']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const { role, fullName, username, password, contactEmail, permissions, clientIds, locationIds } = req.body ?? {};
  const normalizedRole = String(role ?? '').trim().toLowerCase();
  const normalizedName = String(fullName ?? '').trim();
  const normalizedUsername = normalizeUsername(username);
  const normalizedContactEmail = contactEmail ? normalizeOptionalEmail(contactEmail) : null;

  if (!ALLOWED_ROLES.has(normalizedRole)) {
    return res.status(400).json({ ok: false, error: 'Role must be staff, driver, or customer.' });
  }
  if (!normalizedName) {
    return res.status(400).json({ ok: false, error: 'Full name is required.' });
  }
  const usernameError = validateUsername(normalizedUsername);
  if (usernameError) return res.status(400).json({ ok: false, error: usernameError });
  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ ok: false, error: passwordError });
  if (contactEmail && !normalizedContactEmail) {
    return res.status(400).json({ ok: false, error: 'Contact email is invalid.' });
  }

  let supabase;
  try {
    supabase = getAdminClient();
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  const caller = await requireSettingsAdmin(req, supabase);
  if (!caller.ok) return res.status(caller.status).json({ ok: false, error: caller.error });

  try {
    const available = await ensureUsernameAvailable(supabase, normalizedUsername);
    if (!available.ok) return res.status(409).json({ ok: false, error: available.error });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  const authEmail = internalAuthEmailForUsername(normalizedUsername);
  const perms = normalizedRole === 'staff'
    ? {
        fulfilOrders: Boolean(permissions?.fulfilOrders),
        overridePrices: Boolean(permissions?.overridePrices),
        editInvoices: Boolean(permissions?.editInvoices),
        manageSettings: Boolean(permissions?.manageSettings),
      }
    : { fulfilOrders: false, overridePrices: false, editInvoices: false, manageSettings: false };

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: normalizedName,
      account_type: normalizedRole,
      username: normalizedUsername,
      contact_email: normalizedContactEmail,
      must_change_password: false,
    },
  });

  if (authError) {
    return res.status(500).json({ ok: false, error: authError.message || 'Failed to create auth user.' });
  }

  const userId = authData.user?.id;
  if (!userId) {
    return res.status(500).json({ ok: false, error: 'Auth user was created without an ID.' });
  }

  const profileResult = normalizedRole === 'customer'
    ? await createCustomerContact(supabase, {
        userId,
        authEmail,
        fullName: normalizedName,
        username: normalizedUsername,
        contactEmail: normalizedContactEmail,
        clientIds,
        locationIds,
      })
    : await createProfile(supabase, {
        userId,
        authEmail,
        fullName: normalizedName,
        username: normalizedUsername,
        contactEmail: normalizedContactEmail,
        role: normalizedRole,
        permissions: perms,
      });

  if (!profileResult.ok) {
    await supabase.auth.admin.deleteUser(userId).then(() => null, () => null);
    return res.status(500).json({ ok: false, error: profileResult.error });
  }

  const { error: credentialError } = await upsertCredentialRecord(supabase, {
    userId,
    role: normalizedRole,
    username: normalizedUsername,
    authEmail,
    password,
    contactEmail: normalizedContactEmail,
    updatedBy: caller.user.id,
  });

  if (credentialError) {
    await supabase.auth.admin.deleteUser(userId).then(() => null, () => null);
    return res.status(500).json({ ok: false, error: `User created but credential storage failed: ${credentialError.message}` });
  }

  const sendResult = await sendCredentialEmail({
    to: normalizedContactEmail,
    fullName: normalizedName,
    username: normalizedUsername,
    password,
    role: normalizedRole,
    appUrl: getRequestAppUrl(req),
  }).catch((error) => ({ ok: false, error: error.message }));

  await supabase.rpc('modhanios_insert_audit', {
    p_action: normalizedRole === 'customer' ? 'customer_created' : normalizedRole === 'driver' ? 'driver_created' : 'staff_created',
    p_order_id: null,
    p_client_id: null,
    p_user_id: caller.user.id,
    p_user_name: caller.profile.full_name,
    p_details: `Created ${normalizedRole} ${normalizedName} (${normalizedUsername}) with admin-managed credentials`,
    p_previous_value: null,
    p_new_value: normalizedUsername,
  }).then(() => null, () => null);

  return res.status(sendResult.ok ? 200 : 207).json({
    ok: true,
    userId,
    role: normalizedRole,
    username: normalizedUsername,
    contactEmail: normalizedContactEmail,
    emailSent: Boolean(normalizedContactEmail && sendResult.ok && !sendResult.skipped),
    warning: !sendResult.ok
      ? `User was created, but credential email failed: ${sendResult.error}. Share the username and password manually.`
      : normalizedContactEmail
        ? null
        : 'User was created. No contact email was provided, so share the username and password manually.',
  });
}

async function createProfile(supabase, { userId, authEmail, fullName, username, contactEmail, role, permissions }) {
  const { error } = await supabase.from('profiles').insert({
    user_id: userId,
    email: authEmail,
    full_name: fullName,
    initials: initialsFromName(fullName),
    role,
    username,
    contact_email: contactEmail,
    fulfil_orders: permissions.fulfilOrders,
    override_prices: permissions.overridePrices,
    edit_invoices: permissions.editInvoices,
    manage_settings: permissions.manageSettings,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

async function createCustomerContact(supabase, { userId, authEmail, fullName, username, contactEmail, clientIds, locationIds }) {
  const resolvedClientIds = normalizeIdArray(clientIds);
  const resolvedLocationIds = normalizeIdArray(locationIds);
  const { error } = await supabase.from('customer_contacts').insert({
    user_id: userId,
    email: authEmail,
    full_name: fullName,
    username,
    contact_email: contactEmail,
    client_id: resolvedClientIds[0] || null,
    status: resolvedClientIds.length > 0 ? 'active' : 'pending',
  });
  if (error) return { ok: false, error: error.message };

  if (resolvedClientIds.length) {
    const { error: clientError } = await supabase.from('customer_client_assignments').insert(
      resolvedClientIds.map((clientId) => ({ customer_user_id: userId, client_id: clientId }))
    );
    if (clientError) return { ok: false, error: clientError.message };
  }

  if (resolvedLocationIds.length) {
    const { error: locationError } = await supabase.from('customer_location_assignments').insert(
      resolvedLocationIds.map((locationId) => ({ customer_user_id: userId, location_id: locationId }))
    );
    if (locationError) return { ok: false, error: locationError.message };
  }

  return { ok: true };
}

function normalizeIdArray(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((entry) => String(entry ?? '').trim()).filter(Boolean))]
    : [];
}

function initialsFromName(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'U';
}
