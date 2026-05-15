create or replace function public.modhanios_complete_delivery_pod(
  p_order_id text,
  p_user_id uuid,
  p_signed_by text,
  p_signature_data_url text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_profile public.profiles%rowtype;
begin
  select * into v_profile
  from public.profiles
  where user_id = p_user_id;

  if not found then
    raise exception 'User profile not found.';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status <> 'shipped' then
    raise exception 'Proof of delivery can only be captured for shipped orders.';
  end if;

  if nullif(btrim(p_signed_by), '') is null then
    raise exception 'Receiver name is required.';
  end if;

  if nullif(btrim(p_signature_data_url), '') is null then
    raise exception 'Receiver signature is required.';
  end if;

  update public.orders
  set
    status = 'delivered',
    pod_signature_data_url = p_signature_data_url,
    pod_signed_by = btrim(p_signed_by),
    pod_signed_at = timezone('utc', now()),
    pod_notes = nullif(btrim(coalesce(p_notes, '')), ''),
    pod_captured_by = p_user_id
  where id = p_order_id;

  perform public.modhanios_insert_audit(
    'pod_captured',
    v_order.id,
    v_order.client_id,
    p_user_id,
    v_profile.full_name,
    format('Proof of delivery captured for Order #%s by %s', v_order.order_number, btrim(p_signed_by)),
    null,
    btrim(p_signed_by)
  );
end;
$$;

update public.orders
set status = 'delivered'
where status = 'shipped'
  and pod_signature_data_url is not null
  and pod_signed_at is not null;

revoke all on function public.modhanios_complete_delivery_pod(text, uuid, text, text, text) from public;
grant execute on function public.modhanios_complete_delivery_pod(text, uuid, text, text, text) to authenticated;

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

  if v_order.status not in ('fulfilled', 'invoiced', 'shipped', 'delivered') then
    raise exception 'Only fulfilled, invoiced, shipped, or delivered orders can be queued for QuickBooks.';
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
