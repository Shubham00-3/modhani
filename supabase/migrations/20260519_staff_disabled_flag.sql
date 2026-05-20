-- Staff/driver "disabled" flag so the Settings panel can deactivate logins
-- without losing the profile row (and the audit history attached to it).
--
-- Customers already use customer_contacts.status with values 'pending',
-- 'active', 'disabled'. Staff/drivers don't have a status column today;
-- we add one boolean here.

alter table public.profiles
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_by uuid references auth.users (id) on delete set null,
  add column if not exists disabled_reason text;

create index if not exists profiles_disabled_at_idx
  on public.profiles (disabled_at);

comment on column public.profiles.disabled_at is
  'When set, the user is blocked from signing in. The profile row persists for audit trail integrity.';
