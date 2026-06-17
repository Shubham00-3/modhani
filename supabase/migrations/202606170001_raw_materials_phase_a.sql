-- Raw materials & packaging — Phase A: catalog + receiving + stock-on-hand.
--
-- Materials are BOUGHT (not produced): a "receiving" logs an incoming supplier
-- delivery as a material_lot carrying the SUPPLIER'S lot code, qty, date, and
-- expiry. This is the materials analog of `batches`/production. Per-facility
-- (Brampton/Tillsonburg) via facility_id, consistent with the location work.
-- Phase B (recipes) and Phase C (consumption linking at production for
-- traceability/recall) build on this. Standard 3-layer rollout; apply to
-- Supabase before the frontend ships.

-- 1. Materials catalog (distinct from `products` — no price/QB/case sizes).
create table if not exists public.materials (
  id                  text primary key,
  name                text not null,
  type                text not null check (type in ('raw', 'packaging')),
  unit                text not null,                 -- 'kg' | 'L' | 'each'
  supplier            text,
  low_stock_threshold numeric,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 2. Received lots (materials' analog of production batches).
create table if not exists public.material_lots (
  id                text primary key,
  material_id       text not null references public.materials (id),
  supplier_lot_code text not null,
  facility_id       text not null references public.facilities (id),
  qty_received      numeric not null check (qty_received >= 0),
  qty_remaining     numeric not null check (qty_remaining >= 0),
  received_date     date not null,
  expiry_date       date,
  unit_cost         numeric,
  status            text not null default 'active' check (status in ('active', 'cleared')),
  deleted_at        timestamptz,
  deleted_by        uuid,
  deleted_reason    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Re-receiving the same supplier lot at the same factory accumulates.
  unique (material_id, supplier_lot_code, facility_id)
);

create index if not exists material_lots_material_idx on public.material_lots (material_id);
create index if not exists material_lots_facility_idx on public.material_lots (facility_id);

-- 3. updated_at triggers (reuse the existing helper from phase-1 schema).
drop trigger if exists set_materials_updated_at on public.materials;
create trigger set_materials_updated_at
before update on public.materials
for each row execute function public.set_updated_at();

drop trigger if exists set_material_lots_updated_at on public.material_lots;
create trigger set_material_lots_updated_at
before update on public.material_lots
for each row execute function public.set_updated_at();

-- 4. RLS — reads for any authenticated user; writes go through the RPCs below.
alter table public.materials enable row level security;
alter table public.material_lots enable row level security;

drop policy if exists "materials_all_authenticated" on public.materials;
create policy "materials_all_authenticated" on public.materials
for all to authenticated using (true) with check (true);

drop policy if exists "material_lots_all_authenticated" on public.material_lots;
create policy "material_lots_all_authenticated" on public.material_lots
for all to authenticated using (true) with check (true);

-- 5. RPCs.

-- Create or update a material in the catalog (admin only).
create or replace function public.modhanios_upsert_material(
  p_id                  text,
  p_name                text,
  p_type                text,
  p_unit                text,
  p_supplier            text,
  p_low_stock_threshold numeric,
  p_is_active           boolean,
  p_user_id             uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  select * into v_profile from public.profiles where user_id = p_user_id;
  if not found or not v_profile.manage_settings then
    raise exception 'Only admins can manage the materials catalog.';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'Material name is required.';
  end if;
  if p_type not in ('raw', 'packaging') then
    raise exception 'Material type must be raw or packaging.';
  end if;
  if p_unit is null or btrim(p_unit) = '' then
    raise exception 'Material unit is required.';
  end if;

  insert into public.materials (id, name, type, unit, supplier, low_stock_threshold, is_active)
  values (p_id, btrim(p_name), p_type, btrim(p_unit), nullif(btrim(coalesce(p_supplier, '')), ''),
          p_low_stock_threshold, coalesce(p_is_active, true))
  on conflict (id) do update
    set name = excluded.name,
        type = excluded.type,
        unit = excluded.unit,
        supplier = excluded.supplier,
        low_stock_threshold = excluded.low_stock_threshold,
        is_active = excluded.is_active,
        updated_at = now();

  perform public.modhanios_insert_audit(
    'material_saved', null, null, p_user_id, v_profile.full_name,
    format('Saved material %s (%s, per %s)', btrim(p_name), p_type, btrim(p_unit)),
    null, null
  );
end;
$$;

-- Log an incoming delivery (stock-in). Accumulates onto an existing lot for the
-- same material + supplier lot code + factory.
create or replace function public.modhanios_receive_material(
  p_lot_id            text,
  p_material_id       text,
  p_supplier_lot_code text,
  p_facility_id       text,
  p_qty               numeric,
  p_received_date     date,
  p_expiry_date       date,
  p_unit_cost         numeric,
  p_user_id           uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile  public.profiles%rowtype;
  v_material public.materials%rowtype;
  v_facility public.facilities%rowtype;
  v_code     text;
begin
  select * into v_profile from public.profiles where user_id = p_user_id;
  if not found or (not v_profile.fulfil_orders and not v_profile.manage_settings) then
    raise exception 'This user cannot receive materials.';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'Received quantity must be greater than zero.';
  end if;

  select * into v_material from public.materials where id = p_material_id;
  if not found then
    raise exception 'Material not found.';
  end if;

  v_code := nullif(btrim(coalesce(p_supplier_lot_code, '')), '');
  if v_code is null then
    raise exception 'Supplier lot code is required.';
  end if;

  select * into v_facility from public.facilities where id = p_facility_id and is_active;
  if not found then
    raise exception 'Unknown or inactive facility: %', p_facility_id;
  end if;

  insert into public.material_lots (
    id, material_id, supplier_lot_code, facility_id, qty_received, qty_remaining,
    received_date, expiry_date, unit_cost, status
  )
  values (
    p_lot_id, p_material_id, v_code, p_facility_id, p_qty, p_qty,
    coalesce(p_received_date, current_date), p_expiry_date, p_unit_cost, 'active'
  )
  on conflict (material_id, supplier_lot_code, facility_id) do update
    set qty_received  = public.material_lots.qty_received + excluded.qty_received,
        qty_remaining = public.material_lots.qty_remaining + excluded.qty_received,
        status        = 'active',
        expiry_date   = coalesce(excluded.expiry_date, public.material_lots.expiry_date),
        unit_cost     = coalesce(excluded.unit_cost, public.material_lots.unit_cost),
        received_date = least(public.material_lots.received_date, excluded.received_date),
        deleted_at    = null,
        deleted_by    = null,
        deleted_reason = null,
        updated_at    = now();

  perform public.modhanios_insert_audit(
    'material_received', null, null, p_user_id, v_profile.full_name,
    format('Received %s %s of %s (Lot %s) at %s',
           trim(to_char(p_qty, 'FM999999990.##')), v_material.unit, v_material.name, v_code, v_facility.name),
    null,
    format('%s: %s %s @ %s', v_code, trim(to_char(p_qty, 'FM999999990.##')), v_material.unit, v_facility.code)
  );
end;
$$;

-- Trash a received lot (soft-delete with mandatory reason), mirroring batches.
create or replace function public.modhanios_soft_delete_material_lot(
  p_lot_id  text,
  p_user_id uuid,
  p_reason  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_lot     public.material_lots%rowtype;
  v_material public.materials%rowtype;
  v_reason  text;
begin
  select * into v_profile from public.profiles where user_id = p_user_id;
  if not found or (not v_profile.fulfil_orders and not v_profile.manage_settings) then
    raise exception 'This user cannot trash material lots.';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'A reason is required when trashing a material lot.';
  end if;

  select * into v_lot from public.material_lots where id = p_lot_id for update;
  if not found then
    raise exception 'Material lot not found.';
  end if;
  if v_lot.deleted_at is not null then
    return;
  end if;

  update public.material_lots
     set deleted_at = now(), deleted_by = p_user_id, deleted_reason = v_reason,
         status = 'cleared', updated_at = now()
   where id = p_lot_id;

  select * into v_material from public.materials where id = v_lot.material_id;

  perform public.modhanios_insert_audit(
    'material_lot_trashed', null, null, p_user_id, v_profile.full_name,
    format('Trashed material lot %s (%s) - %s', v_lot.supplier_lot_code, coalesce(v_material.name, '?'), v_reason),
    'active', 'trashed'
  );
end;
$$;

revoke all on function public.modhanios_upsert_material(text, text, text, text, text, numeric, boolean, uuid) from public;
grant execute on function public.modhanios_upsert_material(text, text, text, text, text, numeric, boolean, uuid) to authenticated;

revoke all on function public.modhanios_receive_material(text, text, text, text, numeric, date, date, numeric, uuid) from public;
grant execute on function public.modhanios_receive_material(text, text, text, text, numeric, date, date, numeric, uuid) to authenticated;

revoke all on function public.modhanios_soft_delete_material_lot(text, uuid, text) from public;
grant execute on function public.modhanios_soft_delete_material_lot(text, uuid, text) to authenticated;
