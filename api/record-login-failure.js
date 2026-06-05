import { createClient } from '@supabase/supabase-js';
import { findUserByIdentifier, publicContactEmail } from '../src/server/auth/userCredentials.js';

const MAX_FAILED_ATTEMPTS = 3;

function getAdminClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration.');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function writeAudit(supabase, details) {
  await supabase.rpc('modhanios_insert_audit', {
    p_action: 'user_login_locked',
    p_order_id: null,
    p_client_id: null,
    p_user_id: null,
    p_user_name: 'System',
    p_details: details,
    p_previous_value: 'active',
    p_new_value: 'disabled',
  }).then(() => null, () => null);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const identifier = String(req.body?.identifier ?? req.body?.email ?? '').trim().toLowerCase();
  if (!identifier) {
    return res.status(400).json({ ok: false, error: 'Username is required.' });
  }

  let supabase;
  try {
    supabase = getAdminClient();
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  const targetInfo = await findUserByIdentifier(supabase, identifier);
  const profile = targetInfo?.profile ?? null;
  const contact = targetInfo?.contact ?? null;
  const target = profile ?? contact;
  const role = targetInfo?.role ?? (contact ? 'customer' : null);
  const targetLabel = target?.username || publicContactEmail(target) || identifier;

  if (!target || !role) {
    return res.status(200).json({ ok: true, tracked: false });
  }

  const alreadyDisabled = profile ? Boolean(profile.disabled_at) : contact.status === 'disabled';
  if (alreadyDisabled) {
    return res.status(200).json({
      ok: true,
      tracked: true,
      locked: true,
      attemptsRemaining: 0,
      error: 'This account is disabled. Ask an admin to re-enable it or set a new password.',
    });
  }

  const nextAttempts = Number(target.failed_login_attempts ?? 0) + 1;
  const attemptsRemaining = Math.max(MAX_FAILED_ATTEMPTS - nextAttempts, 0);
  const now = new Date().toISOString();

  if (profile) {
    const shouldLock = nextAttempts >= MAX_FAILED_ATTEMPTS;

    if (shouldLock && profile.manage_settings) {
      const { count, error: countError } = await supabase
        .from('profiles')
        .select('user_id', { count: 'exact', head: true })
        .eq('manage_settings', true)
        .is('disabled_at', null)
        .neq('user_id', profile.user_id);

      if (countError) {
        return res.status(500).json({ ok: false, error: countError.message });
      }

      if ((count ?? 0) === 0) {
        await supabase
          .from('profiles')
          .update({ failed_login_attempts: nextAttempts, failed_login_last_at: now })
          .eq('user_id', profile.user_id);

        return res.status(200).json({
          ok: true,
          tracked: true,
          locked: false,
          attemptsRemaining: 0,
          error: 'Login failed. This is the last settings admin, so the account was not auto-disabled.',
        });
      }
    }

    const update = shouldLock
      ? {
          failed_login_attempts: nextAttempts,
          failed_login_last_at: now,
          disabled_at: now,
          disabled_by: null,
          disabled_reason: `Auto-disabled after ${MAX_FAILED_ATTEMPTS} failed sign-in attempts.`,
        }
      : { failed_login_attempts: nextAttempts, failed_login_last_at: now };

    const { error: updateError } = await supabase
      .from('profiles')
      .update(update)
      .eq('user_id', profile.user_id);

    if (updateError) {
      return res.status(500).json({ ok: false, error: updateError.message });
    }

    if (shouldLock) {
      await supabase.auth.admin.updateUserById(profile.user_id, {
        ban_duration: '876000h',
      }).then(() => null, () => null);
      await writeAudit(supabase, `Auto-disabled ${role} ${profile.full_name} (${targetLabel}) after ${MAX_FAILED_ATTEMPTS} failed sign-in attempts.`);
    }

    return res.status(200).json({
      ok: true,
      tracked: true,
      locked: shouldLock,
      attemptsRemaining,
    });
  }

  const shouldLock = nextAttempts >= MAX_FAILED_ATTEMPTS;
  const { error: updateError } = await supabase
    .from('customer_contacts')
    .update({
      failed_login_attempts: nextAttempts,
      failed_login_last_at: now,
      status: shouldLock ? 'disabled' : contact.status,
    })
    .eq('user_id', contact.user_id);

  if (updateError) {
    return res.status(500).json({ ok: false, error: updateError.message });
  }

  if (shouldLock) {
    await supabase.auth.admin.updateUserById(contact.user_id, {
      ban_duration: '876000h',
    }).then(() => null, () => null);
    await writeAudit(supabase, `Auto-disabled customer ${contact.full_name ?? targetLabel} (${targetLabel}) after ${MAX_FAILED_ATTEMPTS} failed sign-in attempts.`);
  }

  return res.status(200).json({
    ok: true,
    tracked: true,
    locked: shouldLock,
    attemptsRemaining,
  });
}
