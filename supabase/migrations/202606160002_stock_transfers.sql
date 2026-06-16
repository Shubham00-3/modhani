-- Internal stock transfers between the two factories (Brampton <-> Tillsonburg).
--
-- A transfer is NOT an order: it relocates on-hand units of a production lot
-- from one factory to the other while PRESERVING the lot code (which encodes
-- the *origin* factory via its -BR/-TB suffix). For food-safety recall the
-- printed lot code must keep identifying where the product was made; the new
-- `facility_id` simply records where it now physically sits. The same lot code
-- can therefore exist at both factories at once.
--
-- To allow that, lot uniqueness moves from (product_id, batch_number) to
-- (product_id, batch_number, facility_id). The production-log RPC's upsert
-- conflict target is updated to match (otherwise it would error on the next
-- production log once the old constraint is gone).
--
-- Admin-only (manage_settings). Partial quantities allowed. Mandatory reason +
-- audit row, matching the edit/trash house rule.

-- All existing rows were backfilled to 'brampton'; enforce NOT NULL so the
-- compound uniqueness and per-factory aggregation behave deterministically.
alter table public.batches
  alter column facility_id set not null;

-- Swap the uniqueness to include facility.
alter table public.batches
  drop constraint if exists batches_product_batch_unique;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'batches_product_batch_facility_unique'
       and conrelid = 'public.batches'::regclass
  ) then
    alter table public.batches
      add constraint batches_product_batch_facility_unique
      unique (product_id, batch_number, facility_id);
  end if;
end$$;

-- Re-create the production-log RPC with the 3-column conflict target. Body is
-- otherwise identical to 202606160001 (facility required, accumulate on repeat).
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
  on conflict (product_id, batch_number, facility_id) do update
    set qty_produced   = public.batches.qty_produced + excluded.qty_produced,
        qty_remaining  = public.batches.qty_remaining + excluded.qty_produced,
        status         = 'active',
        production_date = least(public.batches.production_date, excluded.production_date),
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

-- Transfer on-hand units of a lot from its current factory to another one.
create or replace function public.modhanios_transfer_stock(
  p_batch_id text,
  p_to_facility text,
  p_qty numeric,
  p_reason text,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_src public.batches%rowtype;
  v_from public.facilities%rowtype;
  v_to public.facilities%rowtype;
  v_product public.products%rowtype;
  v_reason text;
begin
  -- Admin only.
  select * into v_profile from public.profiles where user_id = p_user_id;
  if not found or not v_profile.manage_settings then
    raise exception 'Only admins can transfer stock between locations.';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'A reason is required for every stock transfer.';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'Transfer quantity must be greater than zero.';
  end if;

  select * into v_src from public.batches where id = p_batch_id for update;
  if not found then
    raise exception 'Source lot not found.';
  end if;
  if v_src.deleted_at is not null then
    raise exception 'Cannot transfer a trashed lot.';
  end if;
  if v_src.qty_remaining < p_qty then
    raise exception 'Only % units are available to transfer from this lot.',
      trim(to_char(v_src.qty_remaining, 'FM999999990.##'));
  end if;

  if p_to_facility = v_src.facility_id then
    raise exception 'Source and destination factories are the same.';
  end if;
  select * into v_to from public.facilities where id = p_to_facility and is_active;
  if not found then
    raise exception 'Unknown or inactive destination factory: %', p_to_facility;
  end if;
  select * into v_from from public.facilities where id = v_src.facility_id;
  select * into v_product from public.products where id = v_src.product_id;

  -- Source: move produced AND remaining together so company totals stay exact
  -- and the per-row remaining<=produced invariant holds. Clear it if drained.
  update public.batches
     set qty_produced  = qty_produced - p_qty,
         qty_remaining = qty_remaining - p_qty,
         status        = case when qty_remaining - p_qty <= 0 then 'cleared' else 'active' end,
         updated_at    = now()
   where id = v_src.id;

  -- Destination: same lot code, destination factory. Merge if a row for this
  -- (product, lot, factory) already exists, else create one.
  insert into public.batches (id, batch_number, product_id, production_date, qty_produced, qty_remaining, status, facility_id)
  values (
    'batch-' || replace(gen_random_uuid()::text, '-', ''),
    v_src.batch_number, v_src.product_id, v_src.production_date,
    p_qty, p_qty, 'active', p_to_facility
  )
  on conflict (product_id, batch_number, facility_id) do update
    set qty_produced   = public.batches.qty_produced + excluded.qty_produced,
        qty_remaining  = public.batches.qty_remaining + excluded.qty_remaining,
        status         = 'active',
        production_date = least(public.batches.production_date, excluded.production_date),
        deleted_at     = null,
        deleted_by     = null,
        deleted_reason = null,
        updated_at     = now();

  perform public.modhanios_insert_audit(
    'stock_transferred',
    null,
    null,
    p_user_id,
    v_profile.full_name,
    format(
      'Transferred %s %s %s (Lot %s) from %s to %s - %s',
      trim(to_char(p_qty, 'FM999999990.##')),
      coalesce(v_product.name, '?'),
      coalesce(v_product.unit_size, ''),
      v_src.batch_number,
      v_from.name,
      v_to.name,
      v_reason
    ),
    v_from.code,
    v_to.code
  );
end;
$$;

revoke all on function public.modhanios_transfer_stock(text, text, numeric, text, uuid) from public;
grant execute on function public.modhanios_transfer_stock(text, text, numeric, text, uuid) to authenticated;
