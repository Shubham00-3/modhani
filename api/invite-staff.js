import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase server configuration.');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function normalizePublicUrl(value) {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/$/, '');
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function initialsFromName(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'U';
}

const ALLOWED_ROLES = new Set(['staff', 'driver']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const { email, fullName, role, permissions } = req.body ?? {};

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ ok: false, error: 'Email is required.' });
  }
  if (!fullName || typeof fullName !== 'string') {
    return res.status(400).json({ ok: false, error: 'Full name is required.' });
  }
  if (!role || !ALLOWED_ROLES.has(role)) {
    return res.status(400).json({ ok: false, error: 'Role must be "staff" or "driver".' });
  }

  const trimmedEmail = email.trim().toLowerCase();
  const trimmedName = fullName.trim();

  if (!trimmedEmail || !trimmedName) {
    return res.status(400).json({ ok: false, error: 'Email and full name must not be empty.' });
  }

  // Drivers don't get any back-office permissions. Staff defaults to none
  // unless the inviter explicitly opted them in.
  const perms = role === 'driver'
    ? { fulfilOrders: false, overridePrices: false, editInvoices: false, manageSettings: false }
    : {
        fulfilOrders: Boolean(permissions?.fulfilOrders),
        overridePrices: Boolean(permissions?.overridePrices),
        editInvoices: Boolean(permissions?.editInvoices),
        manageSettings: Boolean(permissions?.manageSettings),
      };

  let supabase;
  try {
    supabase = getAdminClient();
  } catch (configError) {
    return res.status(500).json({ ok: false, error: configError.message });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Authorization header is required.' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user: caller }, error: callerError } = await supabase.auth.getUser(token);

  if (callerError || !caller) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired session.' });
  }

  const { data: callerProfile, error: callerProfileError } = await supabase
    .from('profiles')
    .select('user_id, manage_settings, full_name')
    .eq('user_id', caller.id)
    .maybeSingle();

  if (callerProfileError || !callerProfile) {
    return res.status(403).json({ ok: false, error: 'Only staff users can invite team members.' });
  }
  if (!callerProfile.manage_settings) {
    return res.status(403).json({ ok: false, error: 'You need settings-management permission to invite team members.' });
  }

  // Refuse if a profile already exists for this email (staff/driver) or if a
  // customer is registered with the same email — let admin resolve manually.
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('user_id, role')
    .eq('email', trimmedEmail)
    .maybeSingle();

  if (existingProfile) {
    return res.status(409).json({ ok: false, error: `A ${existingProfile.role} user with that email already exists.` });
  }

  const { data: existingContact } = await supabase
    .from('customer_contacts')
    .select('user_id')
    .eq('email', trimmedEmail)
    .maybeSingle();

  if (existingContact) {
    return res.status(409).json({ ok: false, error: 'A customer already exists with that email.' });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    || process.env.VITE_APP_URL
    || normalizePublicUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL)
    || normalizePublicUrl(process.env.VERCEL_URL)
    || (req.headers['x-forwarded-host']
      ? `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host']}`
      : null)
    || 'http://localhost:5173';

  const redirectTo = normalizePublicUrl(appUrl);

  const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    trimmedEmail,
    {
      data: {
        full_name: trimmedName,
        account_type: role,
        must_change_password: true,
      },
      redirectTo,
    }
  );

  if (inviteError) {
    const msg = inviteError.message?.toLowerCase() ?? '';
    if (msg.includes('already registered') || msg.includes('already been registered')) {
      return res.status(409).json({ ok: false, error: 'An auth account with this email already exists. Try sending a password reset instead.' });
    }
    return res.status(500).json({ ok: false, error: inviteError.message || 'Failed to send invite email.' });
  }

  const userId = inviteData.user?.id;
  if (!userId) {
    return res.status(500).json({ ok: false, error: 'Invite sent but no user ID was returned.' });
  }

  // Insert the matching profiles row so the app recognizes them on first login.
  const { error: insertError } = await supabase
    .from('profiles')
    .insert({
      user_id: userId,
      email: trimmedEmail,
      full_name: trimmedName,
      initials: initialsFromName(trimmedName),
      role,
      fulfil_orders: perms.fulfilOrders,
      override_prices: perms.overridePrices,
      edit_invoices: perms.editInvoices,
      manage_settings: perms.manageSettings,
    });

  if (insertError) {
    const { error: cleanupError } = await supabase.auth.admin.deleteUser(userId);
    const cleanupMessage = cleanupError
      ? ` Cleanup also failed: ${cleanupError.message}.`
      : ' The auth account was removed so the invite can be retried.';

    return res.status(500).json({
      ok: false,
      error: `Invite email was sent, but the profile record could not be created: ${insertError.message}.${cleanupMessage}`,
    });
  }

  // Best-effort audit log; don't fail the response if it doesn't land.
  await supabase.rpc('modhanios_insert_audit', {
    p_action: role === 'driver' ? 'driver_invited' : 'staff_invited',
    p_order_id: null,
    p_client_id: null,
    p_user_id: caller.id,
    p_user_name: callerProfile.full_name,
    p_details: `Invited ${role} ${trimmedName} (${trimmedEmail})`,
    p_previous_value: null,
    p_new_value: trimmedEmail,
  }).then(() => null, () => null);

  return res.status(200).json({
    ok: true,
    userId,
    email: trimmedEmail,
    fullName: trimmedName,
    role,
    permissions: perms,
  });
}
