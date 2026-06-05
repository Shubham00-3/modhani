import { getAdminClient } from '../src/server/email/supabaseAdmin.js';
import { findCredentialByIdentifier } from '../src/server/auth/userCredentials.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const identifier = String(req.body?.identifier ?? '').trim().toLowerCase();
  if (!identifier) {
    return res.status(400).json({ ok: false, error: 'Username is required.' });
  }

  let supabase;
  try {
    supabase = getAdminClient();
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  try {
    const credential = await findCredentialByIdentifier(supabase, identifier);
    if (credential?.auth_email) {
      return res.status(200).json({ ok: true, authEmail: credential.auth_email });
    }
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  if (identifier.includes('@')) {
    return res.status(200).json({ ok: true, authEmail: identifier });
  }

  return res.status(404).json({ ok: false, error: 'Invalid username or password.' });
}
