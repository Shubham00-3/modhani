import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration.');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Disable or re-enable a user (staff, driver, or customer) by setting the
 * appropriate flag. We never DELETE the row; the profile/contact persists so
 * audit trail and historical orders stay intact.
 *
 * Body: { userId, disabled, reason? }
 *   - userId  : the user_id to update
 *   - disabled: true = lock out, false = re-enable
 *   - reason  : optional free-text shown in audit log
 *
 * Safety:
 *   - Caller must have manage_settings
 *   - Caller cannot disable themselves
 *   - If the target has manage_settings = true, disabling them must not
 *     leave the org with zero settings admins
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const { userId, disabled, reason } = req.body ?? {};
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ ok: false, error: 'User ID is required.' });
  }
  if (typeof disabled !== 'boolean') {
    return res.status(400).json({ ok: false, error: '"disabled" must be true or false.' });
  }

  let supabase;
  try { supabase = getAdminClient(); }
  catch (e) { return res.status(500).json({ ok: false, error: e.message }); }

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
    return res.status(403).json({ ok: false, error: 'Only staff users can manage other users.' });
  }
  if (!callerProfile.manage_settings) {
    return res.status(403).json({ ok: false, error: 'You need settings-management permission.' });
  }

  if (disabled && userId === caller.id) {
    return res.status(400).json({ ok: false, error: "You can't disable your own account. Ask another settings admin." });
  }

  // Resolve target - could be a staff/driver profile or a customer contact.
  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('user_id, role, full_name, email, manage_settings, disabled_at')
    .eq('user_id', userId)
    .maybeSingle();

  const { data: targetContact } = !targetProfile
    ? await supabase
        .from('customer_contacts')
        .select('user_id, email, full_name, status')
        .eq('user_id', userId)
        .maybeSingle()
    : { data: null };

  if (!targetProfile && !targetContact) {
    return res.status(404).json({ ok: false, error: 'User not found.' });
  }

  // Last-admin guard.
  if (disabled && targetProfile?.manage_settings) {
    const { count, error: countError } = await supabase
      .from('profiles')
      .select('user_id', { count: 'exact', head: true })
      .eq('manage_settings', true)
      .is('disabled_at', null)
      .neq('user_id', userId);

    if (countError) {
      return res.status(500).json({ ok: false, error: `Could not verify admin count: ${countError.message}` });
    }
    if ((count ?? 0) === 0) {
      return res.status(400).json({
        ok: false,
        error: 'At least one settings admin must remain enabled. Grant another user settings access first.',
      });
    }
  }

  // Update the right table.
  if (targetProfile) {
    const update = disabled
      ? {
          disabled_at: new Date().toISOString(),
          disabled_by: caller.id,
          disabled_reason: reason?.trim() || null,
        }
      : { disabled_at: null, disabled_by: null, disabled_reason: null };
    const { error: updateError } = await supabase
      .from('profiles')
      .update(update)
      .eq('user_id', userId);
    if (updateError) {
      return res.status(500).json({ ok: false, error: `Failed to update profile: ${updateError.message}` });
    }
  } else if (targetContact) {
    const nextStatus = disabled ? 'disabled' : 'active';
    const { error: updateError } = await supabase
      .from('customer_contacts')
      .update({ status: nextStatus })
      .eq('user_id', userId);
    if (updateError) {
      return res.status(500).json({ ok: false, error: `Failed to update contact: ${updateError.message}` });
    }
  }

  const { error: authUpdateError } = await supabase.auth.admin.updateUserById(userId, {
    ban_duration: disabled ? '876000h' : 'none',
  });
  if (authUpdateError) {
    return res.status(500).json({
      ok: false,
      error: `User status was updated, but Supabase Auth could not ${disabled ? 'ban' : 'unban'} the account: ${authUpdateError.message}`,
    });
  }

  const targetEmail = targetProfile?.email ?? targetContact?.email ?? '';
  const targetName = targetProfile?.full_name ?? targetContact?.full_name ?? targetEmail;
  const role = targetProfile?.role ?? 'customer';
  const auditReason = reason?.trim();

  await supabase.rpc('modhanios_insert_audit', {
    p_action: disabled ? 'user_disabled' : 'user_enabled',
    p_order_id: null,
    p_client_id: null,
    p_user_id: caller.id,
    p_user_name: callerProfile.full_name,
    p_details: `${disabled ? 'Disabled' : 'Re-enabled'} ${role} ${targetName} (${targetEmail})${auditReason ? ` - ${auditReason}` : ''}`,
    p_previous_value: disabled ? 'active' : 'disabled',
    p_new_value: disabled ? 'disabled' : 'active',
  }).then(() => null, () => null);

  return res.status(200).json({
    ok: true,
    userId,
    disabled,
  });
}
