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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const { email, fullName, clientId, clientIds, locationIds } = req.body ?? {};

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ ok: false, error: 'Email is required.' });
  }

  if (!fullName || typeof fullName !== 'string') {
    return res.status(400).json({ ok: false, error: 'Full name is required.' });
  }

  const trimmedEmail = email.trim().toLowerCase();
  const trimmedName = fullName.trim();

  if (!trimmedEmail || !trimmedName) {
    return res.status(400).json({ ok: false, error: 'Email and full name must not be empty.' });
  }

  const resolvedClientIds = normalizeIdArray(clientIds, clientId);
  const resolvedLocationIds = normalizeIdArray(locationIds);

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

  const { data: staffProfile, error: staffError } = await supabase
    .from('profiles')
    .select('user_id, manage_settings')
    .eq('user_id', caller.id)
    .maybeSingle();

  if (staffError || !staffProfile) {
    return res.status(403).json({ ok: false, error: 'Only staff users can add customers.' });
  }

  if (!staffProfile.manage_settings) {
    return res.status(403).json({ ok: false, error: 'You need settings-management permission to add customers.' });
  }

  const { data: existingContact } = await supabase
    .from('customer_contacts')
    .select('user_id')
    .eq('email', trimmedEmail)
    .maybeSingle();

  if (existingContact) {
    return res.status(409).json({ ok: false, error: 'A customer with that email already exists.' });
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
        account_type: 'customer',
        must_change_password: true,
      },
      redirectTo,
    }
  );

  if (inviteError) {
    if (inviteError.message?.toLowerCase().includes('already registered') || inviteError.message?.toLowerCase().includes('already been registered')) {
      return res.status(409).json({ ok: false, error: 'An account with this email already exists in the auth system. Try updating their status instead.' });
    }

    return res.status(500).json({ ok: false, error: inviteError.message || 'Failed to send customer invite.' });
  }

  const userId = inviteData.user?.id;

  if (!userId) {
    return res.status(500).json({ ok: false, error: 'Invite sent but no user ID was returned.' });
  }

  const contactStatus = resolvedClientIds.length > 0 ? 'active' : 'pending';
  const { error: insertError } = await supabase
    .from('customer_contacts')
    .insert({
      user_id: userId,
      email: trimmedEmail,
      full_name: trimmedName,
      client_id: resolvedClientIds[0] || null,
      status: contactStatus,
    });

  if (insertError) {
    return res.status(207).json({
      ok: true,
      userId,
      warning: `Invite email sent, but contact record failed: ${insertError.message}. Link them manually from the Customers page.`,
    });
  }

  if (resolvedClientIds.length > 0) {
    const clientRows = resolvedClientIds.map((cid) => ({
      customer_user_id: userId,
      client_id: cid,
    }));

    const { error: clientAssignError } = await supabase
      .from('customer_client_assignments')
      .insert(clientRows);

    if (clientAssignError) {
      return res.status(207).json({
        ok: true,
        userId,
        warning: `Invite sent and contact saved, but company assignments failed: ${clientAssignError.message}. Assign companies manually from the Customers page.`,
      });
    }
  }

  if (resolvedLocationIds.length > 0) {
    const locationRows = resolvedLocationIds.map((lid) => ({
      customer_user_id: userId,
      location_id: lid,
    }));

    const { error: locationAssignError } = await supabase
      .from('customer_location_assignments')
      .insert(locationRows);

    if (locationAssignError) {
      return res.status(207).json({
        ok: true,
        userId,
        warning: `Invite sent and companies assigned, but location assignments failed: ${locationAssignError.message}. Assign locations manually from the Customers page.`,
      });
    }
  }

  return res.status(200).json({
    ok: true,
    userId,
    email: trimmedEmail,
    fullName: trimmedName,
    status: contactStatus,
    clientIds: resolvedClientIds,
    locationIds: resolvedLocationIds,
  });
}

function normalizePublicUrl(value) {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/$/, '');
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function normalizeIdArray(arrayValue, legacySingleValue) {
  const combined = [];

  if (Array.isArray(arrayValue)) {
    combined.push(...arrayValue);
  }

  if (legacySingleValue && typeof legacySingleValue === 'string') {
    combined.push(legacySingleValue);
  }

  return [...new Set(combined.map((id) => String(id).trim()).filter(Boolean))];
}
