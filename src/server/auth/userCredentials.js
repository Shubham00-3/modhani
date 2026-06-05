/* global process */
import { sendTransactionalEmail } from '../email/resendClient.js';

export const INTERNAL_AUTH_DOMAIN = 'auth.modhanios.local';

export function isInternalAuthEmail(value) {
  return String(value ?? '').trim().toLowerCase().endsWith(`@${INTERNAL_AUTH_DOMAIN}`);
}

export function normalizeUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function validateUsername(username) {
  if (!username) return 'Username is required.';
  if (username.length < 3 || username.length > 32) {
    return 'Username must be 3 to 32 characters.';
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(username)) {
    return 'Username can use lowercase letters, numbers, dots, underscores, and hyphens, and must start with a letter or number.';
  }
  return null;
}

export function validatePassword(password) {
  if (!password || typeof password !== 'string') return 'Password is required.';
  if (password.length < 6) return 'Password must be at least 6 characters.';
  return null;
}

export function normalizeOptionalEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function internalAuthEmailForUsername(username) {
  return `${normalizeUsername(username)}@${INTERNAL_AUTH_DOMAIN}`;
}

export function publicContactEmail(row) {
  const contactEmail = normalizeOptionalEmail(row?.contact_email);
  if (contactEmail) return contactEmail;
  const email = String(row?.email ?? '').trim().toLowerCase();
  return email && !isInternalAuthEmail(email) ? email : null;
}

export async function requireSettingsAdmin(req, supabase) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Authorization header is required.' };
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return { ok: false, status: 401, error: 'Invalid or expired session.' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('user_id, full_name, email, manage_settings')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return { ok: false, status: 403, error: 'Only staff users can manage credentials.' };
  }
  if (!profile.manage_settings) {
    return { ok: false, status: 403, error: 'You need settings-management permission.' };
  }

  return { ok: true, user, profile };
}

export async function findCredentialByIdentifier(supabase, identifier) {
  const value = String(identifier ?? '').trim().toLowerCase();
  if (!value) return null;

  const selectors = [
    ['username', normalizeUsername(value)],
    ['auth_email', value],
    ['contact_email', value],
  ];

  for (const [column, needle] of selectors) {
    if (!needle) continue;
    const { data, error } = await supabase
      .from('user_login_credentials')
      .select('*')
      .eq(column, needle)
      .maybeSingle();
    if (isMissingCredentialTable(error)) return null;
    if (error) throw error;
    if (data) return data;
  }

  return null;
}

export async function findUserByIdentifier(supabase, identifier) {
  const value = String(identifier ?? '').trim().toLowerCase();
  if (!value) return null;

  const credential = await findCredentialByIdentifier(supabase, value);
  if (credential) {
    const target = await findUserById(supabase, credential.user_id);
    return target ? { ...target, credential } : null;
  }

  const profile = await findRowByAnyColumn(supabase, 'profiles', value);
  if (profile) return { role: profile.role, profile, userId: profile.user_id, authEmail: profile.email };

  const contact = await findRowByAnyColumn(supabase, 'customer_contacts', value);
  if (contact) return { role: 'customer', contact, userId: contact.user_id, authEmail: contact.email };

  return null;
}

export async function ensureUsernameAvailable(supabase, username, excludingUserId = null) {
  const normalized = normalizeUsername(username);
  const checks = [
    supabase.from('user_login_credentials').select('user_id').eq('username', normalized).maybeSingle(),
    supabase.from('profiles').select('user_id').eq('username', normalized).maybeSingle(),
    supabase.from('customer_contacts').select('user_id').eq('username', normalized).maybeSingle(),
  ];

  const results = await Promise.all(checks);
  for (const result of results) {
    if (isMissingCredentialTable(result.error)) continue;
    if (result.error) throw result.error;
    if (result.data && result.data.user_id !== excludingUserId) {
      return { ok: false, error: 'That username is already in use.' };
    }
  }
  return { ok: true };
}

export async function upsertCredentialRecord(supabase, {
  userId,
  role,
  username,
  authEmail,
  password,
  contactEmail,
  updatedBy,
}) {
  return supabase
    .from('user_login_credentials')
    .upsert({
      user_id: userId,
      role,
      username: normalizeUsername(username),
      auth_email: authEmail,
      password_plaintext: password,
      contact_email: contactEmail,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
}

export async function sendCredentialEmail({ to, fullName, username, password, role, appUrl }) {
  const contactEmail = normalizeOptionalEmail(to);
  if (!contactEmail) return { ok: true, skipped: true };

  const portalUrl = String(appUrl ?? '').replace(/\/$/, '') || 'https://modhani-os.vercel.app';
  const roleLabel = role === 'driver' ? 'driver' : role === 'customer' ? 'customer' : 'staff';
  const safeName = escapeHtml(fullName || 'there');
  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f4f7f4;font-family:Arial,sans-serif;color:#17211b;">
    <div style="max-width:600px;margin:0 auto;padding:28px 18px;">
      <div style="background:#ffffff;border:1px solid #dfe7e2;border-radius:10px;overflow:hidden;">
        <div style="background:#10261a;color:#ffffff;padding:20px 24px;">
          <div style="font-size:13px;text-transform:uppercase;">ModhaniOS</div>
          <h1 style="margin:6px 0 0;font-size:22px;">Your login credentials</h1>
        </div>
        <div style="padding:24px;">
          <p style="font-size:16px;line-height:1.5;margin-top:0;">Hi ${safeName}, your ModhaniOS ${escapeHtml(roleLabel)} account is ready.</p>
          <div style="background:#f7faf8;border:1px solid #e4ece6;border-radius:8px;padding:14px 16px;margin:18px 0;">
            <div><strong>Username:</strong> ${escapeHtml(username)}</div>
            <div><strong>Password:</strong> ${escapeHtml(password)}</div>
          </div>
          <p style="font-size:14px;line-height:1.5;">Sign in here: <a href="${escapeHtml(portalUrl)}">${escapeHtml(portalUrl)}</a></p>
          <p style="font-size:13px;color:#5d6b62;">Keep this information private. Contact Modhani if you need a new password.</p>
        </div>
      </div>
    </div>
  </body>
</html>`;

  const text = [
    `Hi ${fullName || 'there'},`,
    '',
    `Your ModhaniOS ${roleLabel} account is ready.`,
    `Username: ${username}`,
    `Password: ${password}`,
    '',
    `Sign in here: ${portalUrl}`,
  ].join('\n');

  return sendTransactionalEmail({
    to: contactEmail,
    subject: 'Your ModhaniOS login credentials',
    html,
    text,
    idempotencyKey: `modhanios-credentials-${username}-${Date.now()}`,
  });
}

export function getRequestAppUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL
    || process.env.VITE_APP_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || 'https://modhani-os.vercel.app';
}

async function findUserById(supabase, userId) {
  const [{ data: profile, error: profileError }, { data: contact, error: contactError }] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('customer_contacts').select('*').eq('user_id', userId).maybeSingle(),
  ]);
  if (profileError) throw profileError;
  if (contactError) throw contactError;
  if (profile) return { role: profile.role, profile, userId: profile.user_id, authEmail: profile.email };
  if (contact) return { role: 'customer', contact, userId: contact.user_id, authEmail: contact.email };
  return null;
}

async function findRowByAnyColumn(supabase, table, value) {
  const selectors = [
    ['email', value],
    ['username', normalizeUsername(value)],
    ['contact_email', value],
  ];

  for (const [column, needle] of selectors) {
    if (!needle) continue;
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(column, needle)
      .maybeSingle();
    if (isMissingCredentialTable(error)) continue;
    if (error) throw error;
    if (data) return data;
  }
  return null;
}

function isMissingCredentialTable(error) {
  return error?.code === '42P01' || /user_login_credentials|column .*username|column .*contact_email/i.test(error?.message ?? '');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
