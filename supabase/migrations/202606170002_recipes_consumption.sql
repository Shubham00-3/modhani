-- Raw materials — Phase B (recipes/BOM) + Phase C (consumption + recall trace).
--
-- Phase B: each product (a QuickBooks "Inventory Assembly") gets a recipe — a
-- list of material lines with a quantity consumed PER FINISHED UNIT produced.
-- Phase C: when production is logged, those materials are auto-deducted from the
-- SAME factory's on-hand stock, oldest lot first (FIFO), and every draw is
-- written to a consumption ledger linking the production batch to the exact
-- material lot. That ledger is what makes recall traceable in both directions:
--   - supplier lot recalled  -> which production batches used it (forward)
--   - product batch suspect   -> which supplier lots it contains (backward)
--
-- Business rules (confirmed with the client 2026-06-17):
--   - Shortfall: production is NEVER blocked. Consume what's on hand, floor stock
--     at zero, and flag the shortfall (audit row + returned summary).
--   - FIFO auto-consume at the production facility; no manual lot picking.
-- Standard 3-layer rollout; apply to Supabase before the frontend ships.

-- 0. Materials carry cleaning chemicals + PPE too, which are neither a product
--    ingredient ("raw") nor product packaging. Allow a third 'consumable' type
--    so the seeded catalog categorizes them honestly (they never enter recipes).
alter table public.materials drop constraint if exists materials_type_check;
alter table public.materials
  add constraint materials_type_check check (type in ('raw', 'packaging', 'consumable'));

-- 1. Recipe / bill of materials. One row per (product, material); qty_per_unit is
--    how much of that material one produced unit of the product consumes.
create table if not exists public.product_recipe_lines (
  id            text primary key,
  product_id    text not null references public.products (id) on delete cascade,
  material_id   text not null references public.materials (id),
  qty_per_unit  numeric not null check (qty_per_unit > 0),
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (product_id, material_id)
);
create index if not exists product_recipe_lines_product_idx on public.product_recipe_lines (product_id);
create index if not exists product_recipe_lines_material_idx on public.product_recipe_lines (material_id);

-- 2. Consumption ledger (the recall spine). One row per FIFO draw.
create table if not exists public.material_consumptions (
  id              text primary key,
  batch_id        text not null references public.batches (id) on delete cascade,
  material_id     text not null references public.materials (id),
  material_lot_id text not null references public.material_lots (id),
  facility_id     text not null references public.facilities (id),
  qty             numeric not null check (qty > 0),
  created_at      timestamptz not null default now()
);
create index if not exists material_consumptions_batch_idx on public.material_consumptions (batch_id);
create index if not exists material_consumptions_lot_idx on public.material_consumptions (material_lot_id);
create index if not exists material_consumptions_material_idx on public.material_consumptions (material_id);

-- 3. updated_at trigger for recipe lines (reuse existing helper).
drop trigger if exists set_product_recipe_lines_updated_at on public.product_recipe_lines;
create trigger set_product_recipe_lines_updated_at
before update on public.product_recipe_lines
for each row execute function public.set_updated_at();

-- 4. RLS — reads for any authenticated user; writes go through the RPCs below.
alter table public.product_recipe_lines enable row level security;
alter table public.material_consumptions enable row level security;

drop policy if exists "product_recipe_lines_all_authenticated" on public.product_recipe_lines;
create policy "product_recipe_lines_all_authenticated" on public.product_recipe_lines
for all to authenticated using (true) with check (true);

drop policy if exists "material_consumptions_all_authenticated" on public.material_consumptions;
create policy "material_consumptions_all_authenticated" on public.material_consumptions
for all to authenticated using (true) with check (true);

-- 5. RPC: replace a product's whole recipe in one shot (admin only).
--    p_lines is a JSON array of { material_id, qty_per_unit, note }.
create or replace function public.modhanios_save_product_recipe(
  p_product_id text,
  p_lines      jsonb,
  p_user_id    uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_product public.products%rowtype;
  v_count   integer;
begin
  select * into v_profile from public.profiles where user_id = p_user_id;
  if not found or not v_profile.manage_settings then
    raise exception 'Only admins can edit product recipes.';
  end if;

  select * into v_product from public.products where id = p_product_id;
  if not found then
    raise exception 'Product not found.';
  end if;

  delete from public.product_recipe_lines where product_id = p_product_id;

  insert into public.product_recipe_lines (id, product_id, material_id, qty_per_unit, note)
  select
    'recipe-' || replace(gen_random_uuid()::text, '-', ''),
    p_product_id,
    line.material_id,
    line.qty_per_unit,
    nullif(btrim(coalesce(line.note, '')), '')
  from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb))
       as line(material_id text, qty_per_unit numeric, note text)
  where line.material_id is not null
    and line.qty_per_unit is not null
    and line.qty_per_unit > 0;

  get diagnostics v_count = row_count;

  perform public.modhanios_insert_audit(
    'recipe_saved', null, null, p_user_id, v_profile.full_name,
    format('Saved recipe for %s %s (%s material line%s)',
           v_product.name, coalesce(v_product.unit_size, ''), v_count,
           case when v_count = 1 then '' else 's' end),
    null, null
  );
end;
$$;

-- 6. Re-create the production-log RPC. Identical batch-logging behaviour as
--    202606160002, but now returns jsonb and auto-consumes recipe materials.
--    Return type changes (void -> jsonb), so the old function must be dropped
--    first; create-or-replace cannot change a function's return type.
drop function if exists public.modhanios_log_production_batch(text, text, text, date, numeric, uuid, text);
create or replace function public.modhanios_log_production_batch(
  p_batch_id text,
  p_batch_number text,
  p_product_id text,
  p_production_date date,
  p_qty_produced numeric,
  p_user_id uuid,
  p_facility_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_product public.products%rowtype;
  v_facility public.facilities%rowtype;
  v_lot text;
  v_line record;
  v_mlot record;
  v_material public.materials%rowtype;
  v_needed numeric;
  v_take numeric;
  v_shortfalls jsonb := '[]'::jsonb;
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
    'production_logged', null, null, p_user_id, v_profile.full_name,
    format('Produced %s %s %s - Lot Code %s (%s)', trim(to_char(p_qty_produced, 'FM999999990.##')), v_product.name, v_product.unit_size, v_lot, v_facility.name),
    null,
    format('%s: %s units @ %s', v_lot, trim(to_char(p_qty_produced, 'FM999999990.##')), v_facility.name)
  );

  -- Phase C: auto-consume the recipe from this facility's stock, FIFO. The
  -- conflict-target row above may have accumulated; consumption always reflects
  -- the qty produced in THIS call (p_qty_produced).
  for v_line in
    select material_id, qty_per_unit
      from public.product_recipe_lines
     where product_id = p_product_id
  loop
    v_needed := v_line.qty_per_unit * p_qty_produced;

    for v_mlot in
      select id, qty_remaining
        from public.material_lots
       where material_id = v_line.material_id
         and facility_id = p_facility_id
         and deleted_at is null
         and status = 'active'
         and qty_remaining > 0
       order by received_date asc, created_at asc
       for update
    loop
      exit when v_needed <= 0;
      v_take := least(v_mlot.qty_remaining, v_needed);

      update public.material_lots
         set qty_remaining = qty_remaining - v_take,
             status        = case when qty_remaining - v_take <= 0 then 'cleared' else 'active' end,
             updated_at    = now()
       where id = v_mlot.id;

      insert into public.material_consumptions (id, batch_id, material_id, material_lot_id, facility_id, qty)
      values ('mcons-' || replace(gen_random_uuid()::text, '-', ''),
              p_batch_id, v_line.material_id, v_mlot.id, p_facility_id, v_take);

      v_needed := v_needed - v_take;
    end loop;

    -- Anything still needed after draining on-hand lots is a shortfall: flag it,
    -- don't block (stock simply floored at zero for those lots).
    if v_needed > 0 then
      select * into v_material from public.materials where id = v_line.material_id;
      v_shortfalls := v_shortfalls || jsonb_build_object(
        'material_id', v_line.material_id,
        'material_name', coalesce(v_material.name, v_line.material_id),
        'short_qty', v_needed,
        'unit', coalesce(v_material.unit, '')
      );
      perform public.modhanios_insert_audit(
        'material_shortfall', null, null, p_user_id, v_profile.full_name,
        format('Short %s %s of %s when producing Lot %s at %s',
               trim(to_char(v_needed, 'FM999999990.##')), coalesce(v_material.unit, ''),
               coalesce(v_material.name, v_line.material_id), v_lot, v_facility.name),
        null, null
      );
    end if;
  end loop;

  return jsonb_build_object('shortfalls', v_shortfalls);
end;
$$;

revoke all on function public.modhanios_save_product_recipe(text, jsonb, uuid) from public;
grant execute on function public.modhanios_save_product_recipe(text, jsonb, uuid) to authenticated;

revoke all on function public.modhanios_log_production_batch(text, text, text, date, numeric, uuid, text) from public;
grant execute on function public.modhanios_log_production_batch(text, text, text, date, numeric, uuid, text) to authenticated;
