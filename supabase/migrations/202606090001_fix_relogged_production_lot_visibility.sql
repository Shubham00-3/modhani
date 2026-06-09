-- Re-logging an existing product + lot code should make that lot visible in
-- Production & Lots. The prior conflict path added quantity but did not clear
-- soft-delete flags, leaving some active inventory hidden from the production
-- page while audit/inventory still showed movement.

create or replace function public.modhanios_log_production_batch(
  p_batch_id text,
  p_batch_number text,
  p_product_id text,
  p_production_date date,
  p_qty_produced numeric,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_product public.products%rowtype;
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

  v_lot := btrim(p_batch_number);

  insert into public.batches (id, batch_number, product_id, production_date, qty_produced, qty_remaining, status)
  values (p_batch_id, v_lot, p_product_id, p_production_date, p_qty_produced, p_qty_produced, 'active')
  on conflict (product_id, batch_number) do update
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
    format('Produced %s %s %s - Lot Code %s', trim(to_char(p_qty_produced, 'FM999999990.##')), v_product.name, v_product.unit_size, v_lot),
    null,
    format('%s: %s units', v_lot, trim(to_char(p_qty_produced, 'FM999999990.##')))
  );
end;
$$;

revoke all on function public.modhanios_log_production_batch(text, text, text, date, numeric, uuid) from public;
grant execute on function public.modhanios_log_production_batch(text, text, text, date, numeric, uuid) to authenticated;

update public.batches
set deleted_at = null,
    deleted_by = null,
    deleted_reason = null,
    updated_at = now()
where deleted_at is not null
  and status = 'active'
  and qty_remaining > 0;
