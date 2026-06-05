-- Driverless shipment confirmation + Packed status flow.
--
-- Before: confirming a shipment required a driver and jumped the order straight
-- to "shipped". Now:
--   * Confirm shipment works with NO driver assigned -> order becomes "packed"
--     (packing slip still generated). If a driver is already assigned at confirm
--     time, it goes straight to "shipped" (out for delivery).
--   * Assigning a driver to a "packed" order advances it to "shipped".
--   * Clearing the driver on an un-delivered "shipped" order returns it to
--     "packed".
-- POD capture (shipped -> delivered) is unchanged, so a packed order (which has
-- no driver) is never out for delivery until a driver is assigned.

-- ---------------------------------------------------------------------------
-- modhanios_confirm_shipment — no driver required; status = packed | shipped.
-- ---------------------------------------------------------------------------
create or replace function public.modhanios_confirm_shipment(
  p_order_id text,
  p_user_id uuid,
  p_packing_slip_number text,
  p_packing_slip_sent_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_profile public.profiles%rowtype;
  v_has_driver boolean;
begin
  select * into v_profile
  from public.profiles
  where user_id = p_user_id;

  if not found then
    raise exception 'User profile not found.';
  end if;

  if p_packing_slip_number is null or btrim(p_packing_slip_number) = '' then
    raise exception 'Packing slip number is required.';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status <> 'invoiced' then
    raise exception 'Only invoiced orders can be shipped.';
  end if;

  v_has_driver := v_order.driver_user_id is not null;

  update public.orders
  set status = case when v_has_driver then 'shipped' else 'packed' end,
      shipped_at = case when v_has_driver then timezone('utc', now()) else shipped_at end,
      packing_slip_number = btrim(p_packing_slip_number),
      packing_slip_sent_at = p_packing_slip_sent_at
  where id = p_order_id;

  perform public.modhanios_insert_audit(
    'packing_slip_created',
    v_order.id,
    v_order.client_id,
    p_user_id,
    v_profile.full_name,
    format('Packing slip %s generated for Order #%s (%s)',
      btrim(p_packing_slip_number),
      v_order.order_number,
      case when v_has_driver then 'out for delivery' else 'packed, awaiting driver' end
    ),
    null,
    btrim(p_packing_slip_number)
  );

  if p_packing_slip_sent_at is not null then
    perform public.modhanios_insert_audit(
      'packing_slip_sent',
      v_order.id,
      v_order.client_id,
      p_user_id,
      v_profile.full_name,
      format('Packing slip %s emailed after shipment confirmation', btrim(p_packing_slip_number)),
      null,
      btrim(p_packing_slip_number)
    );
  end if;
end;
$$;

revoke all on function public.modhanios_confirm_shipment(text, uuid, text, timestamptz) from public;
grant execute on function public.modhanios_confirm_shipment(text, uuid, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- modhanios_assign_driver — advance packed -> shipped (revert on clear).
-- ---------------------------------------------------------------------------
create or replace function public.modhanios_assign_driver(
  p_order_id text,
  p_user_id uuid,
  p_driver_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller public.profiles%rowtype;
  v_driver public.profiles%rowtype;
  v_order public.orders%rowtype;
  v_previous_label text;
  v_next_label text;
begin
  select * into v_caller from public.profiles where user_id = p_user_id;
  if not found or (not v_caller.fulfil_orders and not v_caller.manage_settings) then
    raise exception 'This user cannot assign drivers.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status = 'delivered' then
    raise exception 'Delivered orders cannot have their driver changed.';
  end if;

  if p_driver_user_id is null then
    v_next_label := 'Unassigned';
  else
    select * into v_driver from public.profiles where user_id = p_driver_user_id;
    if not found then
      raise exception 'Driver profile not found.';
    end if;
    if v_driver.role <> 'driver' then
      raise exception 'Selected user is not a driver.';
    end if;
    if v_driver.disabled_at is not null then
      raise exception 'Selected driver is disabled. Re-enable them or pick a different driver.';
    end if;
    v_next_label := v_driver.full_name;
  end if;

  if v_order.driver_user_id is null then
    v_previous_label := 'Unassigned';
  else
    select full_name into v_previous_label
    from public.profiles
    where user_id = v_order.driver_user_id;
    v_previous_label := coalesce(v_previous_label, 'Unknown');
  end if;

  update public.orders
  set
    driver_user_id     = p_driver_user_id,
    driver_assigned_at = case when p_driver_user_id is null then null else now() end,
    driver_assigned_by = case when p_driver_user_id is null then null else p_user_id end
  where id = p_order_id;

  -- Status flow: assigning a driver to a packed order dispatches it (out for
  -- delivery); clearing the driver on an un-delivered shipped order returns it
  -- to packed.
  if p_driver_user_id is not null and v_order.status = 'packed' then
    update public.orders
    set status = 'shipped',
        shipped_at = timezone('utc', now())
    where id = p_order_id;

    perform public.modhanios_insert_audit(
      'order_shipped',
      v_order.id,
      v_order.client_id,
      p_user_id,
      v_caller.full_name,
      format('Order #%s out for delivery with %s', coalesce(v_order.order_number::text, p_order_id), v_next_label),
      'packed',
      'shipped'
    );
  elsif p_driver_user_id is null and v_order.status = 'shipped' and v_order.pod_signed_at is null then
    update public.orders
    set status = 'packed',
        shipped_at = null
    where id = p_order_id;
  end if;

  perform public.modhanios_insert_audit(
    case when p_driver_user_id is null then 'driver_unassigned' else 'driver_assigned' end,
    p_order_id,
    v_order.client_id,
    p_user_id,
    v_caller.full_name,
    format('Order #%s driver: %s -> %s',
      coalesce(v_order.order_number::text, p_order_id),
      v_previous_label,
      v_next_label
    ),
    v_previous_label,
    v_next_label
  );
end;
$$;

revoke all on function public.modhanios_assign_driver(text, uuid, uuid) from public;
grant execute on function public.modhanios_assign_driver(text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- modhanios_require_qb_invoice_ready — allow "packed" orders to sync to QB.
-- (Re-create of the guard from 20260515 with 'packed' added.)
-- ---------------------------------------------------------------------------
create or replace function public.modhanios_require_qb_invoice_ready(
  p_order_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_location public.locations%rowtype;
  v_missing_product text;
begin
  select * into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status not in ('fulfilled', 'invoiced', 'packed', 'shipped', 'delivered') then
    raise exception 'Only fulfilled, invoiced, packed, shipped, or delivered orders can be queued for QuickBooks.';
  end if;

  if nullif(btrim(coalesce(v_order.invoice_number, '')), '') is null then
    raise exception 'Create the ModhaniOS invoice before QuickBooks sync.';
  end if;

  select * into v_location
  from public.locations
  where id = v_order.location_id;

  if not found then
    raise exception 'Location not found.';
  end if;

  if nullif(btrim(coalesce(v_location.qb_ship_to_name, v_location.name)), '') is null then
    raise exception 'Location is missing a QuickBooks customer/store name.';
  end if;

  select public.products.name into v_missing_product
  from public.order_items
  join public.products on products.id = order_items.product_id
  where order_items.order_id = p_order_id
    and coalesce(order_items.invoice_qty, order_items.fulfilled_qty, 0) > 0
    and nullif(btrim(coalesce(public.products.qb_item_name, concat_ws(' ', public.products.name, public.products.unit_size))), '') is null
  limit 1;

  if v_missing_product is not null then
    raise exception 'Product % is missing a QuickBooks item name.', v_missing_product;
  end if;
end;
$$;
