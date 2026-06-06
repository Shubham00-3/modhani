import { buildProofOfDeliveryHtml } from '../utils/printDocuments';

function buildPodFileName(order) {
  const orderNumber = String(order?.orderNumber ?? order?.id ?? 'unknown').replace(/[^a-z0-9-]+/gi, '-');
  const signedDate = String(order?.podSignedAt ?? new Date().toISOString()).slice(0, 10);
  return `POD-${orderNumber}-${signedDate}.html`;
}

export async function syncPodToGoogleDrive({ supabase, order, clients, locations, products, batches }) {
  if (!supabase || !order?.id) return { ok: true, skipped: true };

  const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionResult.session) {
    return { ok: false, error: sessionError?.message ?? 'No active session for Google Drive sync.' };
  }

  const html = buildProofOfDeliveryHtml({ order, clients, locations, products, batches });
  const response = await fetch('/api/sync-pod-drive', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionResult.session.access_token}`,
    },
    body: JSON.stringify({
      orderId: order.id,
      fileName: buildPodFileName(order),
      html,
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.ok === false) {
    return {
      ok: false,
      skipped: data.skipped === true,
      error: data.error || `Google Drive sync failed (${response.status}).`,
    };
  }

  return data;
}
