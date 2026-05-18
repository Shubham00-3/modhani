-- 1. Add "Operating As" / friendly name to clients.
--    Legal names like "1000927794 Ontario Inc" are unrecognizable in lists;
--    staff need a human-friendly alias (e.g. "Bharat Bazaar") to identify
--    clients quickly.
-- 2. Add rep contact fields to locations.
--    Each delivery location may have a different person to contact for
--    that site (delivery confirmations, access codes, etc.).

alter table public.clients
  add column if not exists operating_as text;

comment on column public.clients.operating_as is
  'Friendly / "Operating As" name shown in pickers and dashboards alongside the legal name.';

alter table public.locations
  add column if not exists rep_name  text,
  add column if not exists rep_email text,
  add column if not exists rep_phone text;

comment on column public.locations.rep_name  is 'Primary contact at this delivery location.';
comment on column public.locations.rep_email is 'Email for the location representative.';
comment on column public.locations.rep_phone is 'Phone for the location representative.';

-- ---------------------------------------------------------------------------
-- Replace the client upsert RPC to thread through operating_as.
-- ---------------------------------------------------------------------------
drop function if exists public.modhanios_upsert_client(uuid, text, text, integer, text, boolean, boolean, text, text, text);

create or replace function public.modhanios_upsert_client(
  p_user_id uuid,
  p_id text,
  p_name text,
  p_location_count integer,
  p_delivery_method text,
  p_email_packing_slip boolean,
  p_email_invoice boolean,
  p_packing_slip_email text,
  p_invoice_email text,
  p_qb_customer_name text default null,
  p_operating_as text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.modhanios_assert_manage_settings(p_user_id);

  insert into public.clients (
    id,
    name,
    location_count,
    delivery_method,
    email_packing_slip,
    email_invoice,
    packing_slip_email,
    invoice_email,
    qb_customer_name,
    qb_mapping_status,
    operating_as
  )
  values (
    p_id,
    btrim(p_name),
    greatest(coalesce(p_location_count, 0), 0),
    coalesce(nullif(btrim(p_delivery_method), ''), 'email'),
    coalesce(p_email_packing_slip, false),
    coalesce(p_email_invoice, false),
    nullif(btrim(coalesce(p_packing_slip_email, '')), ''),
    nullif(btrim(coalesce(p_invoice_email, '')), ''),
    nullif(btrim(coalesce(p_qb_customer_name, p_name)), ''),
    'ready',
    nullif(btrim(coalesce(p_operating_as, '')), '')
  )
  on conflict (id) do update set
    name               = excluded.name,
    location_count     = excluded.location_count,
    delivery_method    = excluded.delivery_method,
    email_packing_slip = excluded.email_packing_slip,
    email_invoice      = excluded.email_invoice,
    packing_slip_email = excluded.packing_slip_email,
    invoice_email      = excluded.invoice_email,
    qb_customer_name   = excluded.qb_customer_name,
    qb_mapping_status  = excluded.qb_mapping_status,
    operating_as       = excluded.operating_as;
end;
$$;

revoke all on function public.modhanios_upsert_client(uuid, text, text, integer, text, boolean, boolean, text, text, text, text) from public;
grant execute on function public.modhanios_upsert_client(uuid, text, text, integer, text, boolean, boolean, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Replace the location upsert RPC to thread through rep_name/email/phone.
-- ---------------------------------------------------------------------------
drop function if exists public.modhanios_upsert_location(uuid, text, text, text, text, text, text, text, text, text, text, text);

create or replace function public.modhanios_upsert_location(
  p_user_id uuid,
  p_id text,
  p_client_id text,
  p_code text,
  p_city text,
  p_name text,
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_province text default null,
  p_postal_code text default null,
  p_country text default 'Canada',
  p_qb_ship_to_name text default null,
  p_rep_name text default null,
  p_rep_email text default null,
  p_rep_phone text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  perform public.modhanios_assert_manage_settings(p_user_id);

  v_status := case
    when nullif(btrim(coalesce(p_address_line1, '')), '') is not null
      and nullif(btrim(coalesce(p_city, '')), '') is not null
      and nullif(btrim(coalesce(p_province, '')), '') is not null
      and nullif(btrim(coalesce(p_postal_code, '')), '') is not null
    then 'ready'
    else 'needs_address'
  end;

  insert into public.locations (
    id,
    client_id,
    code,
    city,
    name,
    address_line1,
    address_line2,
    province,
    postal_code,
    country,
    qb_ship_to_name,
    qb_mapping_status,
    rep_name,
    rep_email,
    rep_phone
  )
  values (
    p_id,
    p_client_id,
    nullif(btrim(coalesce(p_code, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    btrim(p_name),
    nullif(btrim(coalesce(p_address_line1, '')), ''),
    nullif(btrim(coalesce(p_address_line2, '')), ''),
    nullif(btrim(coalesce(p_province, '')), ''),
    nullif(btrim(coalesce(p_postal_code, '')), ''),
    coalesce(nullif(btrim(p_country), ''), 'Canada'),
    nullif(btrim(coalesce(p_qb_ship_to_name, p_name)), ''),
    v_status,
    nullif(btrim(coalesce(p_rep_name, '')), ''),
    nullif(btrim(coalesce(p_rep_email, '')), ''),
    nullif(btrim(coalesce(p_rep_phone, '')), '')
  )
  on conflict (id) do update set
    client_id         = excluded.client_id,
    code              = excluded.code,
    city              = excluded.city,
    name              = excluded.name,
    address_line1     = excluded.address_line1,
    address_line2     = excluded.address_line2,
    province          = excluded.province,
    postal_code       = excluded.postal_code,
    country           = excluded.country,
    qb_ship_to_name   = excluded.qb_ship_to_name,
    qb_mapping_status = excluded.qb_mapping_status,
    rep_name          = excluded.rep_name,
    rep_email         = excluded.rep_email,
    rep_phone         = excluded.rep_phone;
end;
$$;

revoke all on function public.modhanios_upsert_location(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.modhanios_upsert_location(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
