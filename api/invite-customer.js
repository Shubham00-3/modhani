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

  const { email, fullName, clientId } = req.body ?? {};

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

  let supabase;

  try {
    supabase = getAdminClient();
  } catch (configError) {
    return res.status(500).json({ ok: false, error: configError.message });
  }

  // Verify that the caller is an authenticated staff member.
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Authorization header is required.' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user: caller }, error: callerError } = await supabase.auth.getUser(token);

  if (callerError || !caller) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired session.' });
  }

  // Confirm the caller is staff with manage_settings permission.
  const { data: staffProfile, error: staffError } = await supabase
    .from('profiles')
    .select('user_id, manage_settings')
    .eq('user_id', caller.id)
    .maybeSingle();

  if (staffError || !staffProfile) {
    return res.status(403).json({ ok: false, error: 'Only staff users can invite customers.' });
  }

  if (!staffProfile.manage_settings) {
    return res.status(403).json({ ok: false, error: 'You need settings-management permission to invite customers.' });
  }

  // Check if the email is already registered as a customer_contact.
  const { data: existingContact } = await supabase
    .from('customer_contacts')
    .select('user_id, email')
    .eq('email', trimmedEmail)
    .maybeSingle();

  if (existingContact) {
    return res.status(409).json({ ok: false, error: 'A customer with that email already exists.' });
  }

  // Determine the redirect URL (the app root).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    || process.env.VITE_APP_URL
    || normalizePublicUrl(process.env.VERCEL_URL)
    || (req.headers['x-forwarded-host']
      ? `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host']}`
      : null)
    || 'http://localhost:5173';

  const redirectTo = normalizePublicUrl(appUrl);

  // Invite the user via Supabase Auth admin API.
  const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    trimmedEmail,
    {
      data: {
        full_name: trimmedName,
        account_type: 'customer',
      },
      redirectTo,
    }
  );

  if (inviteError) {
    // If the user already exists in auth (e.g. was deleted from customer_contacts but auth record remains),
    // we may get a "user already registered" error. Handle gracefully.
    if (inviteError.message?.toLowerCase().includes('already registered') || inviteError.message?.toLowerCase().includes('already been registered')) {
      return res.status(409).json({ ok: false, error: 'An account with this email already exists in the system. Try updating their status instead.' });
    }

    return res.status(500).json({ ok: false, error: inviteError.message || 'Failed to send invite.' });
  }

  const userId = inviteData.user?.id;

  if (!userId) {
    return res.status(500).json({ ok: false, error: 'Invite sent but no user ID was returned.' });
  }

  // Create the customer_contacts row (using service_role, bypasses RLS).
  const contactStatus = clientId ? 'active' : 'pending';
  const { error: insertError } = await supabase
    .from('customer_contacts')
    .insert({
      user_id: userId,
      email: trimmedEmail,
      full_name: trimmedName,
      client_id: clientId || null,
      status: contactStatus,
    });

  if (insertError) {
    // If the contact row couldn't be created, the auth invite was still sent.
    // Return success but warn about the contact record.
    return res.status(207).json({
      ok: true,
      userId,
      warning: `Invite email sent, but contact record failed: ${insertError.message}. The customer can still accept the invite; link them manually from the Customers page.`,
    });
  }

  return res.status(200).json({
    ok: true,
    userId,
    email: trimmedEmail,
    fullName: trimmedName,
    status: contactStatus,
  });
}

function normalizePublicUrl(value) {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/$/, '');
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
