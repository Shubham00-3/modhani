-- Admin-only customer management.
-- Customer self-signup is removed; admins invite customers via the API endpoint.
-- The API endpoint uses the service_role key to call auth.admin.inviteUserByEmail()
-- and then inserts directly into customer_contacts (bypassing RLS).
-- No schema changes are needed since the customer_contacts table already exists.

-- The invite endpoint uses the service_role key, so it does not need a broad
-- staff insert policy on customer_contacts. Drop it if an earlier draft was applied.
drop policy if exists "customer_contacts_insert_staff" on public.customer_contacts;

-- Keep the existing self-insert policy for backward compatibility,
-- in case any existing customers need to re-register.
-- The "customer_contacts_insert_own" policy already exists from the portal migration.
