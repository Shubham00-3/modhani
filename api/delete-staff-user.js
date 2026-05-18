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

  const { userId } = req.body ?? {};

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ ok: false, error: 'User ID is required.' });
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
    return res.status(403).json({ ok: false, error: 'Only staff users can remove team members.' });
  }
  if (!callerProfile.manage_settings) {
    return res.status(403).json({ ok: false, error: 'You need settings-management permission to remove team members.' });
  }

  // Safety guard #1: admin cannot delete themselves.
  if (userId === caller.id) {
    return res.status(400).json({ ok: false, error: "You can't remove your own account. Ask another settings admin to do it." });
  }

  // Look up the target profile.
  const { data: target, error: targetError } = await supabase
    .from('profiles')
    .select('user_id, email, full_name, role, manage_settings')
    .eq('user_id', userId)
    .maybeSingle();

  if (targetError || !target) {
    return res.status(404).json({ ok: false, error: 'Staff or driver profile not found.' });
  }

  // Safety guard #2: never remove the last settings admin.
  if (target.manage_settings) {
    const { count, error: countError } = await supabase
      .from('profiles')
      .select('user_id', { count: 'exact', head: true })
      .eq('manage_settings', true)
      .neq('user_id', userId);

    if (countError) {
      return res.status(500).json({ ok: false, error: `Could not verify admin count: ${countError.message}` });
    }
    if ((count ?? 0) === 0) {
      return res.status(400).json({ ok: false, error: 'At least one settings admin must remain. Grant another user settings access before removing this one.' });
    }
  }

  // Delete profile row first; auth user deletion follows.
  const { error: deleteProfileError } = await supabase
    .from('profiles')
    .delete()
    .eq('user_id', userId);

  if (deleteProfileError) {
    return res.status(500).json({ ok: false, error: `Failed to delete profile: ${deleteProfileError.message}` });
  }

  const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId);

  if (deleteAuthError) {
    return res.status(207).json({
      ok: true,
      warning: `Profile deleted, but the auth account could not be removed: ${deleteAuthError.message}. The email ${target.email} may need manual cleanup in the Supabase dashboard.`,
    });
  }

  // Best-effort audit.
  await supabase.rpc('modhanios_insert_audit', {
    p_action: target.role === 'driver' ? 'driver_removed' : 'staff_removed',
    p_order_id: null,
    p_client_id: null,
    p_user_id: caller.id,
    p_user_name: callerProfile.full_name,
    p_details: `Removed ${target.role} ${target.full_name} (${target.email})`,
    p_previous_value: target.email,
    p_new_value: null,
  }).then(() => null, () => null);

  return res.status(200).json({
    ok: true,
    deletedUserId: userId,
    deletedEmail: target.email,
    deletedRole: target.role,
  });
}
