/* global process */
const RESEND_SEND_URL = 'https://api.resend.com/emails';

export function getEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MODHANI_EMAIL_FROM || process.env.EMAIL_FROM || 'Modhani <onboarding@resend.dev>';
  const replyTo = process.env.MODHANI_EMAIL_REPLY_TO || process.env.EMAIL_REPLY_TO || null;

  if (!apiKey) {
    throw new Error('Missing RESEND_API_KEY.');
  }

  return { apiKey, from, replyTo };
}

export async function sendTransactionalEmail({ to, subject, html, text, idempotencyKey }) {
  const recipients = normalizeRecipients(to);
  if (!recipients.length) {
    return { ok: false, error: 'No recipient email address is available.' };
  }

  const { apiKey, from, replyTo } = getEmailConfig();
  const response = await fetch(RESEND_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      error: payload?.message || payload?.error || `Resend request failed (${response.status}).`,
    };
  }

  return { ok: true, id: payload?.id ?? null };
}

function normalizeRecipients(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(
    values
      .map((entry) => String(entry ?? '').trim().toLowerCase())
      .filter((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry))
  )];
}
