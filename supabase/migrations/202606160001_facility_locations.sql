-- Multi-location (two factories: Brampton + Tillsonburg).
--
-- Phase 1 of the inventory expansion plan: give every production lot a
-- `facility_id` so inventory and production can be filtered per factory and
-- rolled up to a company total. Lot codes additionally carry a factory suffix
-- (e.g. "26166-BR" / "26166-TB") for self-identifying physical labels (recall
-- traceability) -- that suffix is produced on the client; this migration only
-- persists the structured `facility_id` that the UI filters/aggregates on.
--
-- Standard ModhaniOS rollout: this SQL is the source of truth; the data-store
-- dispatch + reducer are updated separately. Apply this to Supabase before the
-- frontend ships, otherwise the new RPC parameter 404s.

-- 1. Facilities catalog. Distinct from `locations` (customer delivery
--    addresses); these are our own production sites.
create table if not exists public.facilities (
  id         text primary key,            -- 'brampton' | 'tillsonburg'
  name       text not null,
  code       text not null,               -- short label burned into lot codes: 'BR' | 'TB'
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.facilities (id, name, code, sort_order) values
  ('brampton',     'Brampton',     'BR', 1),
  ('tillsonburg',  'Tillsonburg',  'TB', 2)
on conflict (id) do update
  set name = excluded.name,
      code = excluded.code,
      sort_order = excluded.sort_order;

-- 2. Tag production lots with the factory that made them.
alter table public.batches
  add column if not exists facility_id text references public.facilities(id);

create index if not exists batches_facility_id_idx
  on public.batches (facility_id);

-- 3. Backfill legacy lots. Existing inventory predates the location split and
--    came from a single pool, so we attribute it to Brampton (the primary
--    site). Staff can re-tag any lot via the production Edit flow afterward.
update public.batches
  set facility_id = 'brampton'
where facility_id is null;

-- 4. Re-create the production-log RPC with the new `p_facility_id` parameter.
--    Drop the old 6-arg signature first so there is no overload ambiguity when
--    supabase-js resolves the call by argument names.
drop function if exists public.modhanios_log_production_batch(text, text, text, date, numeric, uuid);

create or replace function public.modhanios_log_production_batch(
  p_batch_id text,
  p_batch_number text,
  p_product_id text,
  p_production_date date,
  p_qty_produced numeric,
  p_user_id uuid,
  p_facility_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_product public.products%rowtype;
  v_facility public.facilities%rowtype;
  v_lot text;
begin
  select * into v_profile from public.profiles where user_id = p_user_id;
  if not found or (not v_profile.fulfil_orders and not v_profile.manage_settings) then
    raise exception 'This user cannot log production lots.';
  end if;

  if p_batch_id is null or btrim(p_batch_id) = '' then
    raise exception 'Lot id is required.';
  end if;

  if p_batch_number is null or btrim(p_batch_number) = '' then
    raise exception 'Lot code is required.';
  end if;

  if p_qty_produced is null or p_qty_produced <= 0 then
    raise exception 'Quantity produced must be greater than zero.';
  end if;

  select * into v_product from public.products where id = p_product_id;
  if not found then
    raise exception 'Product not found.';
  end if;

  -- Facility is required going forward; validate it exists and is active.
  if p_facility_id is null or btrim(p_facility_id) = '' then
    raise exception 'A production facility is required.';
  end if;
  select * into v_facility from public.facilities where id = p_facility_id and is_active;
  if not found then
    raise exception 'Unknown or inactive facility: %', p_facility_id;
  end if;

  v_lot := btrim(p_batch_number);

  insert into public.batches (id, batch_number, product_id, production_date, qty_produced, qty_remaining, status, facility_id)
  values (p_batch_id, v_lot, p_product_id, p_production_date, p_qty_produced, p_qty_produced, 'active', p_facility_id)
  on conflict (product_id, batch_number) do update
    set qty_produced   = public.batches.qty_produced + excluded.qty_produced,
        qty_remaining  = public.batches.qty_remaining + excluded.qty_produced,
        status         = 'active',
        production_date = least(public.batches.production_date, excluded.production_date),
        facility_id    = excluded.facility_id,
        deleted_at     = null,
        deleted_by     = null,
        deleted_reason = null,
        updated_at     = now();

  perform public.modhanios_insert_audit(
    'production_logged',
    null,
    null,
    p_user_id,
    v_profile.full_name,
    format('Produced %s %s %s - Lot Code %s (%s)', trim(to_char(p_qty_produced, 'FM999999990.##')), v_product.name, v_product.unit_size, v_lot, v_facility.name),
    null,
    format('%s: %s units @ %s', v_lot, trim(to_char(p_qty_produced, 'FM999999990.##')), v_facility.name)
  );
end;
$$;

revoke all on function public.modhanios_log_production_batch(text, text, text, date, numeric, uuid, text) from public;
grant execute on function public.modhanios_log_production_batch(text, text, text, date, numeric, uuid, text) to authenticated;
