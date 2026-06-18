-- Raw materials client-demo upgrade:
-- - richer receiving-log fields from the client's receiving forms
-- - raw milk QA receiving details
-- - persistent material shortfall records
-- - production consumption links to the actual persisted batch row

-- 1. Extend received material lots with the general Receiving Log fields.
alter table public.material_lots
  add column if not exists supplier text,
  add column if not exists description text,
  add column if not exists bill_of_lading_no text,
  add column if not exists invoice_no text,
  add column if not exists temperature text,
  add column if not exists coa_received boolean,
  add column if not exists receiver_initials text;

-- 2. Raw milk receiving QA record. One row per material lot when the material is
--    raw milk or the receiver enters milk-specific QA fields.
create table if not exists public.raw_milk_receiving_records (
  material_lot_id    text primary key references public.material_lots (id) on delete cascade,
  received_time      text,
  volume_ltr         numeric,
  silo_no            text,
  appearance_odour   text,
  milk_temperature   text,
  ph                 numeric,
  antibiotic_result  text,
  fat_percent        numeric,
  seal_no            text,
  tanker_no          text,
  driver_signature   text,
  setup_prepared_by  text,
  receiver_initials  text,
  verified_by        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists set_raw_milk_receiving_records_updated_at on public.raw_milk_receiving_records;
create trigger set_raw_milk_receiving_records_updated_at
before update on public.raw_milk_receiving_records
for each row execute function public.set_updated_at();

alter table public.raw_milk_receiving_records enable row level security;
drop policy if exists "raw_milk_receiving_records_all_authenticated" on public.raw_milk_receiving_records;
create policy "raw_milk_receiving_records_all_authenticated" on public.raw_milk_receiving_records
for all to authenticated using (true) with check (true);

-- 3. Persistent material shortages. Audit text is still useful, but this table
--    makes shortages visible in Materials/Traceability without parsing strings.
create table if not exists public.material_shortfalls (
  id            text primary key,
  batch_id      text not null references public.batches (id) on delete cascade,
  product_id    text not null references public.products (id),
  material_id   text not null references public.materials (id),
  facility_id   text not null references public.facilities (id),
  required_qty  numeric not null check (required_qty >= 0),
  consumed_qty  numeric not null check (consumed_qty >= 0),
  short_qty     numeric not null check (short_qty > 0),
  unit          text,
  created_at    timestamptz not null default now()
);

create index if not exists material_shortfalls_batch_idx on public.material_shortfalls (batch_id);
create index if not exists material_shortfalls_material_idx on public.material_shortfalls (material_id);
create index if not exists material_shortfalls_facility_idx on public.material_shortfalls (facility_id);

alter table public.material_shortfalls enable row level security;
drop policy if exists "material_shortfalls_all_authenticated" on public.material_shortfalls;
create policy "material_shortfalls_all_authenticated" on public.material_shortfalls
for all to authenticated using (true) with check (true);

-- 4. Replace material receiving RPC with a backward-compatible richer version.
drop function if exists public.modhanios_receive_material(text, text, text, text, numeric, date, date, numeric, uuid);
create or replace function public.modhanios_receive_material(
  p_lot_id              text,
  p_material_id         text,
  p_supplier_lot_code   text,
  p_facility_id         text,
  p_qty                 numeric,
  p_received_date       date,
  p_expiry_date         date,
  p_unit_cost           numeric,
  p_user_id             uuid,
  p_supplier            text default null,
  p_description         text default null,
  p_bill_of_lading_no   text default null,
  p_invoice_no          text default null,
  p_temperature         text default null,
  p_coa_received        boolean default null,
  p_receiver_initials   text default null,
  p_raw_milk_time       text default null,
  p_raw_milk_volume_ltr numeric default null,
  p_silo_no             text default null,
  p_appearance_odour    text default null,
  p_milk_temperature    text default null,
  p_ph                  numeric default null,
  p_antibiotic_result   text default null,
  p_fat_percent         numeric default null,
  p_seal_no             text default null,
  p_tanker_no           text default null,
  p_driver_signature    text default null,
  p_setup_prepared_by   text default null,
  p_verified_by         text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_material public.materials%rowtype;
  v_facility public.facilities%rowtype;
  v_code text;
  v_lot public.material_lots%rowtype;
  v_has_raw_milk_fields boolean;
  v_is_raw_milk boolean;
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
  if not v_material.is_active then
    raise exception 'Cannot receive an inactive material.';
  end if;

  select * into v_facility from public.facilities where id = p_facility_id and is_active;
  if not found then
    raise exception 'Unknown or inactive facility: %', p_facility_id;
  end if;

  v_code := nullif(btrim(coalesce(p_supplier_lot_code, '')), '');
  if v_code is null then
    raise exception 'Supplier lot code is required.';
  end if;

  insert into public.material_lots (
    id, material_id, supplier_lot_code, facility_id, qty_received, qty_remaining,
    received_date, expiry_date, unit_cost, status,
    supplier, description, bill_of_lading_no, invoice_no, temperature, coa_received, receiver_initials
  )
  values (
    p_lot_id, p_material_id, v_code, p_facility_id, p_qty, p_qty,
    coalesce(p_received_date, current_date), p_expiry_date, p_unit_cost, 'active',
    nullif(btrim(coalesce(p_supplier, '')), ''),
    nullif(btrim(coalesce(p_description, '')), ''),
    nullif(btrim(coalesce(p_bill_of_lading_no, '')), ''),
    nullif(btrim(coalesce(p_invoice_no, '')), ''),
    nullif(btrim(coalesce(p_temperature, '')), ''),
    p_coa_received,
    nullif(btrim(coalesce(p_receiver_initials, '')), '')
  )
  on conflict (material_id, supplier_lot_code, facility_id) do update
    set qty_received      = public.material_lots.qty_received + excluded.qty_received,
        qty_remaining     = public.material_lots.qty_remaining + excluded.qty_received,
        status            = 'active',
        expiry_date       = coalesce(excluded.expiry_date, public.material_lots.expiry_date),
        unit_cost         = coalesce(excluded.unit_cost, public.material_lots.unit_cost),
        received_date     = least(public.material_lots.received_date, excluded.received_date),
        supplier          = coalesce(excluded.supplier, public.material_lots.supplier),
        description       = coalesce(excluded.description, public.material_lots.description),
        bill_of_lading_no = coalesce(excluded.bill_of_lading_no, public.material_lots.bill_of_lading_no),
        invoice_no        = coalesce(excluded.invoice_no, public.material_lots.invoice_no),
        temperature       = coalesce(excluded.temperature, public.material_lots.temperature),
        coa_received      = coalesce(excluded.coa_received, public.material_lots.coa_received),
        receiver_initials = coalesce(excluded.receiver_initials, public.material_lots.receiver_initials),
        deleted_at        = null,
        deleted_by        = null,
        deleted_reason    = null,
        updated_at        = now()
  returning * into v_lot;

  v_has_raw_milk_fields :=
    p_raw_milk_time is not null or p_raw_milk_volume_ltr is not null or p_silo_no is not null
    or p_appearance_odour is not null or p_milk_temperature is not null or p_ph is not null
    or p_antibiotic_result is not null or p_fat_percent is not null or p_seal_no is not null
    or p_tanker_no is not null or p_driver_signature is not null or p_setup_prepared_by is not null
    or p_verified_by is not null;
  v_is_raw_milk := v_material.type = 'raw' and (
    v_material.id ilike 'MILK-%' or v_material.name ilike '%raw milk%' or v_material.name ilike '%milk%'
  );

  if v_has_raw_milk_fields or v_is_raw_milk then
    insert into public.raw_milk_receiving_records (
      material_lot_id, received_time, volume_ltr, silo_no, appearance_odour,
      milk_temperature, ph, antibiotic_result, fat_percent, seal_no, tanker_no,
      driver_signature, setup_prepared_by, receiver_initials, verified_by
    )
    values (
      v_lot.id,
      nullif(btrim(coalesce(p_raw_milk_time, '')), ''),
      coalesce(p_raw_milk_volume_ltr, case when v_is_raw_milk then p_qty else null end),
      nullif(btrim(coalesce(p_silo_no, '')), ''),
      nullif(btrim(coalesce(p_appearance_odour, '')), ''),
      coalesce(nullif(btrim(coalesce(p_milk_temperature, '')), ''), nullif(btrim(coalesce(p_temperature, '')), '')),
      p_ph,
      nullif(btrim(coalesce(p_antibiotic_result, '')), ''),
      p_fat_percent,
      nullif(btrim(coalesce(p_seal_no, '')), ''),
      nullif(btrim(coalesce(p_tanker_no, '')), ''),
      nullif(btrim(coalesce(p_driver_signature, '')), ''),
      nullif(btrim(coalesce(p_setup_prepared_by, '')), ''),
      nullif(btrim(coalesce(p_receiver_initials, '')), ''),
      nullif(btrim(coalesce(p_verified_by, '')), '')
    )
    on conflict (material_lot_id) do update
      set received_time     = coalesce(excluded.received_time, public.raw_milk_receiving_records.received_time),
          volume_ltr        = coalesce(public.raw_milk_receiving_records.volume_ltr, 0) + coalesce(excluded.volume_ltr, 0),
          silo_no           = coalesce(excluded.silo_no, public.raw_milk_receiving_records.silo_no),
          appearance_odour  = coalesce(excluded.appearance_odour, public.raw_milk_receiving_records.appearance_odour),
          milk_temperature  = coalesce(excluded.milk_temperature, public.raw_milk_receiving_records.milk_temperature),
          ph                = coalesce(excluded.ph, public.raw_milk_receiving_records.ph),
          antibiotic_result = coalesce(excluded.antibiotic_result, public.raw_milk_receiving_records.antibiotic_result),
          fat_percent       = coalesce(excluded.fat_percent, public.raw_milk_receiving_records.fat_percent),
          seal_no           = coalesce(excluded.seal_no, public.raw_milk_receiving_records.seal_no),
          tanker_no         = coalesce(excluded.tanker_no, public.raw_milk_receiving_records.tanker_no),
          driver_signature  = coalesce(excluded.driver_signature, public.raw_milk_receiving_records.driver_signature),
          setup_prepared_by = coalesce(excluded.setup_prepared_by, public.raw_milk_receiving_records.setup_prepared_by),
          receiver_initials = coalesce(excluded.receiver_initials, public.raw_milk_receiving_records.receiver_initials),
          verified_by       = coalesce(excluded.verified_by, public.raw_milk_receiving_records.verified_by),
          updated_at        = now();
  end if;

  perform public.modhanios_insert_audit(
    'material_received', null, null, p_user_id, v_profile.full_name,
    format('Received %s %s of %s - Supplier Lot %s (%s)',
           trim(to_char(p_qty, 'FM999999990.##')), v_material.unit, v_material.name, v_code, v_facility.name),
    null,
    format('%s: %s %s @ %s', v_code, trim(to_char(p_qty, 'FM999999990.##')), v_material.unit, v_facility.code)
  );
end;
$$;

-- 5. Replace production-log RPC so material consumption references the actual
--    persisted batch id, including on (product, lot, facility) conflicts.
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
  v_batch_id text;
  v_line record;
  v_mlot record;
  v_material public.materials%rowtype;
  v_required numeric;
  v_remaining numeric;
  v_take numeric;
  v_consumed_qty numeric;
  v_shortfalls jsonb := '[]'::jsonb;
  v_consumed jsonb := '[]'::jsonb;
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
        updated_at     = now()
  returning id into v_batch_id;

  perform public.modhanios_insert_audit(
    'production_logged', null, null, p_user_id, v_profile.full_name,
    format('Produced %s %s %s - Lot Code %s (%s)', trim(to_char(p_qty_produced, 'FM999999990.##')), v_product.name, v_product.unit_size, v_lot, v_facility.name),
    null,
    format('%s: %s units @ %s', v_lot, trim(to_char(p_qty_produced, 'FM999999990.##')), v_facility.name)
  );

  for v_line in
    select material_id, qty_per_unit
      from public.product_recipe_lines
     where product_id = p_product_id
  loop
    v_required := v_line.qty_per_unit * p_qty_produced;
    v_remaining := v_required;
    v_consumed_qty := 0;

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
      exit when v_remaining <= 0;
      v_take := least(v_mlot.qty_remaining, v_remaining);

      update public.material_lots
         set qty_remaining = qty_remaining - v_take,
             status        = case when qty_remaining - v_take <= 0 then 'cleared' else 'active' end,
             updated_at    = now()
       where id = v_mlot.id;

      insert into public.material_consumptions (id, batch_id, material_id, material_lot_id, facility_id, qty)
      values ('mcons-' || replace(gen_random_uuid()::text, '-', ''),
              v_batch_id, v_line.material_id, v_mlot.id, p_facility_id, v_take);

      v_consumed := v_consumed || jsonb_build_object(
        'material_id', v_line.material_id,
        'material_lot_id', v_mlot.id,
        'qty', v_take
      );
      v_consumed_qty := v_consumed_qty + v_take;
      v_remaining := v_remaining - v_take;
    end loop;

    if v_remaining > 0 then
      select * into v_material from public.materials where id = v_line.material_id;

      insert into public.material_shortfalls (
        id, batch_id, product_id, material_id, facility_id, required_qty, consumed_qty, short_qty, unit
      )
      values (
        'mshort-' || replace(gen_random_uuid()::text, '-', ''),
        v_batch_id, p_product_id, v_line.material_id, p_facility_id,
        v_required, v_consumed_qty, v_remaining, coalesce(v_material.unit, '')
      );

      v_shortfalls := v_shortfalls || jsonb_build_object(
        'material_id', v_line.material_id,
        'material_name', coalesce(v_material.name, v_line.material_id),
        'required_qty', v_required,
        'consumed_qty', v_consumed_qty,
        'short_qty', v_remaining,
        'unit', coalesce(v_material.unit, '')
      );
      perform public.modhanios_insert_audit(
        'material_shortfall', null, null, p_user_id, v_profile.full_name,
        format('Short %s %s of %s when producing Lot %s at %s',
               trim(to_char(v_remaining, 'FM999999990.##')), coalesce(v_material.unit, ''),
               coalesce(v_material.name, v_line.material_id), v_lot, v_facility.name),
        null, null
      );
    end if;
  end loop;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'batch_number', v_lot,
    'consumed', v_consumed,
    'shortfalls', v_shortfalls
  );
end;
$$;

revoke all on function public.modhanios_receive_material(
  text, text, text, text, numeric, date, date, numeric, uuid,
  text, text, text, text, text, boolean, text,
  text, numeric, text, text, text, numeric, text, numeric, text, text, text, text, text
) from public;
grant execute on function public.modhanios_receive_material(
  text, text, text, text, numeric, date, date, numeric, uuid,
  text, text, text, text, text, boolean, text,
  text, numeric, text, text, text, numeric, text, numeric, text, text, text, text, text
) to authenticated;

revoke all on function public.modhanios_log_production_batch(text, text, text, date, numeric, uuid, text) from public;
grant execute on function public.modhanios_log_production_batch(text, text, text, date, numeric, uuid, text) to authenticated;
