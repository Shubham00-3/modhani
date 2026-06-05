import { getAdminClient } from '../src/server/email/supabaseAdmin.js';
import { requireSettingsAdmin } from '../src/server/auth/userCredentials.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const userId = String(req.body?.userId ?? '').trim();
  if (!userId) {
    return res.status(400).json({ ok: false, error: 'User ID is required.' });
  }

  let supabase;
  try {
    supabase = getAdminClient();
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  const caller = await requireSettingsAdmin(req, supabase);
  if (!caller.ok) return res.status(caller.status).json({ ok: false, error: caller.error });

  const { data, error } = await supabase
    .from('user_login_credentials')
    .select('user_id, role, username, auth_email, password_plaintext, contact_email, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  if (!data) return res.status(404).json({ ok: false, error: 'No admin-set credential is stored for this user.' });

  return res.status(200).json({
    ok: true,
    userId: data.user_id,
    role: data.role,
    username: data.username,
    authEmail: data.auth_email,
    password: data.password_plaintext,
    contactEmail: data.contact_email,
    updatedAt: data.updated_at,
  });
}
