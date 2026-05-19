/* global process */
import { createClient } from '@supabase/supabase-js';

export function getAdminClient() {
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

export async function getCallerFromBearer(req, supabase) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Authorization header is required.', status: 401 };
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { error: 'Invalid or expired session.', status: 401 };
  }

  const [{ data: profile }, { data: contact }] = await Promise.all([
    supabase
      .from('profiles')
      .select('user_id, email, full_name, role, manage_settings')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('customer_contacts')
      .select('user_id, email, full_name, status')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  return {
    user,
    profile,
    contact,
    auditUserId: profile?.user_id ?? contact?.user_id ?? user.id,
    auditUserName: profile?.full_name ?? contact?.full_name ?? user.email ?? 'Unknown user',
  };
}
