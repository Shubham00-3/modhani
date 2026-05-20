import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration.');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  let supabase;
  try {
    supabase = getAdminClient();
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Authorization header is required.' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired session.' });
  }

  await Promise.all([
    supabase
      .from('profiles')
      .update({ failed_login_attempts: 0, failed_login_last_at: null })
      .eq('user_id', user.id),
    supabase
      .from('customer_contacts')
      .update({ failed_login_attempts: 0, failed_login_last_at: null })
      .eq('user_id', user.id),
  ]);

  return res.status(200).json({ ok: true });
}
