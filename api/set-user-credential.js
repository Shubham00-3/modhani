import { getAdminClient } from '../src/server/email/supabaseAdmin.js';
import {
  ensureUsernameAvailable,
  getRequestAppUrl,
  internalAuthEmailForUsername,
  normalizeOptionalEmail,
  normalizeUsername,
  publicContactEmail,
  requireSettingsAdmin,
  sendCredentialEmail,
  upsertCredentialRecord,
  validatePassword,
  validateUsername,
} from '../src/server/auth/userCredentials.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const userId = String(req.body?.userId ?? '').trim();
  const username = normalizeUsername(req.body?.username);
  const password = req.body?.password;
  const requestedContactEmail = req.body?.contactEmail;
  const contactEmail = requestedContactEmail ? normalizeOptionalEmail(requestedContactEmail) : null;

  if (!userId) return res.status(400).json({ ok: false, error: 'User ID is required.' });
  const usernameError = validateUsername(username);
  if (usernameError) return res.status(400).json({ ok: false, error: usernameError });
  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ ok: false, error: passwordError });
  if (requestedContactEmail && !contactEmail) {
    return res.status(400).json({ ok: false, error: 'Contact email is invalid.' });
  }

  let supabase;
  try {
    supabase = getAdminClient();
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  const caller = await requireSettingsAdmin(req, supabase);
  if (!caller.ok) return res.status(caller.status).json({ ok: false, error: caller.error });

  const [{ data: profile, error: profileError }, { data: contact, error: contactError }] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('customer_contacts').select('*').eq('user_id', userId).maybeSingle(),
  ]);

  if (profileError) return res.status(500).json({ ok: false, error: profileError.message });
  if (contactError) return res.status(500).json({ ok: false, error: contactError.message });
  if (!profile && !contact) return res.status(404).json({ ok: false, error: 'User not found.' });

  const role = profile?.role ?? 'customer';
  const targetName = profile?.full_name ?? contact?.full_name ?? username;
  const resolvedContactEmail = requestedContactEmail === undefined
    ? publicContactEmail(profile ?? contact)
    : contactEmail;

  try {
    const available = await ensureUsernameAvailable(supabase, username, userId);
    if (!available.ok) return res.status(409).json({ ok: false, error: available.error });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  const authEmail = internalAuthEmailForUsername(username);
  const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
    email: authEmail,
    password,
    email_confirm: true,
    ban_duration: 'none',
    user_metadata: {
      full_name: targetName,
      account_type: role,
      username,
      contact_email: resolvedContactEmail,
      must_change_password: false,
    },
  });

  if (authError) return res.status(500).json({ ok: false, error: authError.message });

  const table = profile ? 'profiles' : 'customer_contacts';
  const rowUpdate = profile
    ? {
        email: authEmail,
        username,
        contact_email: resolvedContactEmail,
        disabled_at: null,
        disabled_by: null,
        disabled_reason: null,
        failed_login_attempts: 0,
        failed_login_last_at: null,
      }
    : {
        email: authEmail,
        username,
        contact_email: resolvedContactEmail,
        status: 'active',
        failed_login_attempts: 0,
        failed_login_last_at: null,
      };
  const { error: rowError } = await supabase
    .from(table)
    .update(rowUpdate)
    .eq('user_id', userId);
  if (rowError) return res.status(500).json({ ok: false, error: rowError.message });

  const { error: credentialError } = await upsertCredentialRecord(supabase, {
    userId,
    role,
    username,
    authEmail,
    password,
    contactEmail: resolvedContactEmail,
    updatedBy: caller.user.id,
  });
  if (credentialError) return res.status(500).json({ ok: false, error: credentialError.message });

  const sendResult = await sendCredentialEmail({
    to: resolvedContactEmail,
    fullName: targetName,
    username,
    password,
    role,
    appUrl: getRequestAppUrl(req),
  }).catch((error) => ({ ok: false, error: error.message }));

  await supabase.rpc('modhanios_insert_audit', {
    p_action: 'user_credentials_set',
    p_order_id: null,
    p_client_id: null,
    p_user_id: caller.user.id,
    p_user_name: caller.profile.full_name,
    p_details: `Set credentials for ${role} ${targetName} (${username})`,
    p_previous_value: null,
    p_new_value: username,
  }).then(() => null, () => null);

  return res.status(sendResult.ok ? 200 : 207).json({
    ok: true,
    userId,
    role,
    username,
    contactEmail: resolvedContactEmail,
    emailSent: Boolean(resolvedContactEmail && sendResult.ok && !sendResult.skipped),
    warning: !sendResult.ok
      ? `Credentials were saved, but email failed: ${sendResult.error}. Share them manually.`
      : resolvedContactEmail
        ? null
        : 'Credentials were saved. No contact email is set, so share them manually.',
  });
}
