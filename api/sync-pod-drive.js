import crypto from 'node:crypto';
import { getAdminClient, getCallerFromBearer } from '../src/server/email/supabaseAdmin.js';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const { orderId, fileName, html } = req.body ?? {};
  if (!orderId || typeof orderId !== 'string') {
    return res.status(400).json({ ok: false, error: 'Order ID is required.' });
  }
  if (!html || typeof html !== 'string') {
    return res.status(400).json({ ok: false, error: 'POD HTML is required.' });
  }

  let supabase;
  try {
    supabase = getAdminClient();
  } catch (configError) {
    return res.status(500).json({ ok: false, error: configError.message });
  }

  const callerResult = await getCallerFromBearer(req, supabase);
  if (callerResult.error) {
    return res.status(callerResult.status).json({ ok: false, error: callerResult.error });
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, order_number, client_id, driver_user_id, pod_signed_at')
    .eq('id', orderId)
    .maybeSingle();

  if (orderError) return res.status(500).json({ ok: false, error: orderError.message });
  if (!order) return res.status(404).json({ ok: false, error: 'Order not found.' });
  if (!order.pod_signed_at) {
    return res.status(409).json({ ok: false, error: 'POD must be saved before it can sync to Google Drive.' });
  }

  const access = canSyncPod(callerResult, order);
  if (!access.ok) {
    return res.status(403).json({ ok: false, error: access.error });
  }

  const config = getDriveConfig();
  if (!config.ok) {
    return res.status(200).json({ ok: false, skipped: true, error: config.error });
  }

  let driveFile;
  try {
    const accessToken = await getGoogleAccessToken(config);
    driveFile = await uploadPodHtml({
      accessToken,
      folderId: config.folderId,
      fileName: sanitizeDriveFileName(fileName || `POD-${order.order_number}.html`),
      html,
    });
  } catch (error) {
    await writeDriveAudit(supabase, callerResult, order, false, error.message);
    return res.status(502).json({ ok: false, error: error.message });
  }

  const syncedAt = new Date().toISOString();
  const updateResult = await supabase
    .from('orders')
    .update({
      pod_drive_file_id: driveFile.id,
      pod_drive_web_view_link: driveFile.webViewLink ?? null,
      pod_drive_synced_at: syncedAt,
    })
    .eq('id', orderId);

  const trackingError = updateResult.error?.message ?? null;
  await writeDriveAudit(
    supabase,
    callerResult,
    order,
    true,
    trackingError
      ? `Uploaded POD ${driveFile.name} to Google Drive, but tracking columns were not updated: ${trackingError}`
      : `Uploaded POD ${driveFile.name} to Google Drive`
  );

  return res.status(200).json({
    ok: true,
    file: driveFile,
    syncedAt,
    trackingError,
  });
}

function canSyncPod(caller, order) {
  if (caller.profile?.manage_settings) return { ok: true };
  if (caller.profile?.role === 'staff' || caller.profile?.role === 'admin') return { ok: true };
  if (caller.profile?.role === 'driver' && order.driver_user_id === caller.user.id) return { ok: true };
  return { ok: false, error: 'Only staff/admins or the assigned driver can sync this POD.' };
}

function getDriveConfig() {
  const folderId = process.env.GOOGLE_DRIVE_POD_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID;
  let clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if ((!clientEmail || !privateKey) && process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      const json = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      clientEmail = clientEmail || json.client_email;
      privateKey = privateKey || json.private_key;
    } catch {
      return { ok: false, error: 'GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.' };
    }
  }

  privateKey = normalizePrivateKey(privateKey);

  if (!folderId || !clientEmail || !privateKey) {
    return {
      ok: false,
      error: 'Google Drive sync is not configured. Set GOOGLE_DRIVE_POD_FOLDER_ID plus service-account credentials.',
    };
  }

  return { ok: true, folderId, clientEmail, privateKey };
}

function normalizePrivateKey(privateKey) {
  return String(privateKey ?? '').replace(/\\n/g, '\n').trim();
}

async function getGoogleAccessToken({ clientEmail, privateKey }) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: clientEmail,
      scope: DRIVE_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    },
    privateKey
  );

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Google token request failed (${response.status}).`);
  }

  return data.access_token;
}

function signJwt(header, payload, privateKey) {
  const encodedHeader = base64UrlJson(header);
  const encodedPayload = base64UrlJson(payload);
  const input = `${encodedHeader}.${encodedPayload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(input);
  signer.end();
  const signature = signer.sign(privateKey, 'base64url');
  return `${input}.${signature}`;
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function uploadPodHtml({ accessToken, folderId, fileName, html }) {
  const boundary = `modhani-pod-${crypto.randomUUID()}`;
  const metadata = {
    name: fileName,
    mimeType: 'text/html',
    parents: [folderId],
  };
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const response = await fetch(DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary="${boundary}"`,
    },
    body,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.id) {
    throw new Error(data.error?.message || `Google Drive upload failed (${response.status}).`);
  }

  return data;
}

function sanitizeDriveFileName(value) {
  const cleaned = String(value ?? '')
    .trim()
    .split('')
    .map((char) => (char.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(char) ? '-' : char))
    .join('')
    .replace(/\s+/g, ' ');
  return cleaned || `POD-${Date.now()}.html`;
}

async function writeDriveAudit(supabase, caller, order, success, details) {
  await supabase.rpc('modhanios_insert_audit', {
    p_action: success ? 'pod_drive_synced' : 'pod_drive_sync_failed',
    p_order_id: order.id,
    p_client_id: order.client_id,
    p_user_id: caller.auditUserId,
    p_user_name: caller.auditUserName,
    p_details: details,
    p_previous_value: 'google_drive',
    p_new_value: success ? 'synced' : 'failed',
  }).then(() => null, () => null);
}
