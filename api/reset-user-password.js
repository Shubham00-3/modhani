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

function getRequestOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host) return null;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return normalizePublicUrl(`${proto}://${host}`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const { email } = req.body ?? {};

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ ok: false, error: 'Email is required.' });
  }

  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail) {
    return res.status(400).json({ ok: false, error: 'Email must not be empty.' });
  }

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
    return res.status(403).json({ ok: false, error: 'Only staff users can trigger password resets.' });
  }
  if (!callerProfile.manage_settings) {
    return res.status(403).json({ ok: false, error: 'You need settings-management permission to reset passwords.' });
  }

  // The target email should match a known user — either a staff/driver profile
  // or a customer contact. Otherwise refuse, so admins can't spray reset
  // emails at arbitrary external addresses.
  const [{ data: targetProfile }, { data: targetContact }] = await Promise.all([
    supabase.from('profiles').select('user_id, role, full_name').eq('email', trimmedEmail).maybeSingle(),
    supabase.from('customer_contacts').select('user_id, full_name').eq('email', trimmedEmail).maybeSingle(),
  ]);

  if (!targetProfile && !targetContact) {
    return res.status(404).json({ ok: false, error: 'No user found with that email.' });
  }

  const appUrl = getRequestOrigin(req)
    || process.env.NEXT_PUBLIC_APP_URL
    || process.env.VITE_APP_URL
    || normalizePublicUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL)
    || normalizePublicUrl(process.env.VERCEL_URL)
    || 'http://localhost:5173';

  const redirectTo = normalizePublicUrl(appUrl);

  const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
    redirectTo,
  });

  if (resetError) {
    return res.status(500).json({ ok: false, error: resetError.message || 'Failed to send reset email.' });
  }

  // Best-effort audit row.
  await supabase.rpc('modhanios_insert_audit', {
    p_action: 'password_reset_sent',
    p_order_id: null,
    p_client_id: null,
    p_user_id: caller.id,
    p_user_name: callerProfile.full_name,
    p_details: `Sent password reset to ${trimmedEmail}`,
    p_previous_value: null,
    p_new_value: null,
  }).then(() => null, () => null);

  return res.status(200).json({ ok: true, email: trimmedEmail });
}
