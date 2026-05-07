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

  const { customerUserId } = req.body ?? {};

  if (!customerUserId || typeof customerUserId !== 'string') {
    return res.status(400).json({ ok: false, error: 'Customer user ID is required.' });
  }

  let supabase;

  try {
    supabase = getAdminClient();
  } catch (configError) {
    return res.status(500).json({ ok: false, error: configError.message });
  }

  // Verify that the caller is an authenticated staff member with manage_settings.
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Authorization header is required.' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user: caller }, error: callerError } = await supabase.auth.getUser(token);

  if (callerError || !caller) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired session.' });
  }

  const { data: staffProfile, error: staffError } = await supabase
    .from('profiles')
    .select('user_id, manage_settings')
    .eq('user_id', caller.id)
    .maybeSingle();

  if (staffError || !staffProfile) {
    return res.status(403).json({ ok: false, error: 'Only staff users can remove customers.' });
  }

  if (!staffProfile.manage_settings) {
    return res.status(403).json({ ok: false, error: 'You need settings-management permission to remove customers.' });
  }

  // Verify the target is actually a customer_contact (not a staff user).
  const { data: contact, error: contactError } = await supabase
    .from('customer_contacts')
    .select('user_id, email, full_name')
    .eq('user_id', customerUserId)
    .maybeSingle();

  if (contactError || !contact) {
    return res.status(404).json({ ok: false, error: 'Customer contact not found.' });
  }

  // 1. Delete junction table rows (cascade should handle this, but be explicit).
  const { error: deleteLocationAssignmentsError } = await supabase
    .from('customer_location_assignments')
    .delete()
    .eq('customer_user_id', customerUserId);

  if (deleteLocationAssignmentsError) {
    return res.status(500).json({ ok: false, error: `Failed to delete customer location assignments: ${deleteLocationAssignmentsError.message}` });
  }

  const { error: deleteClientAssignmentsError } = await supabase
    .from('customer_client_assignments')
    .delete()
    .eq('customer_user_id', customerUserId);

  if (deleteClientAssignmentsError) {
    return res.status(500).json({ ok: false, error: `Failed to delete customer company assignments: ${deleteClientAssignmentsError.message}` });
  }

  // 2. Delete the customer_contacts row.
  const { error: deleteContactError } = await supabase
    .from('customer_contacts')
    .delete()
    .eq('user_id', customerUserId);

  if (deleteContactError) {
    return res.status(500).json({ ok: false, error: `Failed to delete customer record: ${deleteContactError.message}` });
  }

  // 3. Delete the Supabase auth user entirely.
  const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(customerUserId);

  if (deleteAuthError) {
    // The contact record is already gone, warn about the auth orphan.
    return res.status(207).json({
      ok: true,
      warning: `Customer record deleted, but the auth account could not be removed: ${deleteAuthError.message}. The email ${contact.email} may need manual cleanup in the Supabase dashboard.`,
    });
  }

  return res.status(200).json({
    ok: true,
    deletedUserId: customerUserId,
    deletedEmail: contact.email,
  });
}
