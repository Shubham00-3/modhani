-- Universal admin-managed username/password credentials.

alter table public.profiles
  add column if not exists username text unique,
  add column if not exists contact_email text;

alter table public.customer_contacts
  add column if not exists username text unique,
  add column if not exists contact_email text;

update public.profiles
set contact_email = email
where contact_email is null
  and email is not null
  and email not like '%@auth.modhanios.local';

update public.customer_contacts
set contact_email = email
where contact_email is null
  and email is not null
  and email not like '%@auth.modhanios.local';

create table if not exists public.user_login_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('staff', 'driver', 'customer')),
  username text not null unique,
  auth_email text not null unique,
  password_plaintext text not null,
  contact_email text,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_login_credentials_username_format
    check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$')
);

create index if not exists user_login_credentials_contact_email_idx
  on public.user_login_credentials (contact_email)
  where contact_email is not null;

drop trigger if exists set_user_login_credentials_updated_at on public.user_login_credentials;
create trigger set_user_login_credentials_updated_at
before update on public.user_login_credentials
for each row execute function public.set_updated_at();

alter table public.user_login_credentials enable row level security;

-- No direct authenticated-user policy is intentionally created. Credentials
-- are read/written only through service-role API routes after manage_settings
-- checks, because password_plaintext must not appear in normal app state.

comment on table public.user_login_credentials is
  'Admin-managed username/password display records. Service-role API access only.';
