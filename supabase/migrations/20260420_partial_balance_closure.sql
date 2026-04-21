alter table public.order_items
add column if not exists declined_qty numeric(12, 2) not null default 0;

drop view if exists public.report_order_lines;

create view public.report_order_lines as
select
  o.id as order_id,
  o.order_number,
  o.client_id,
  c.name as client_name,
  o.location_id,
  l.name as location_name,
  oi.id as order_item_id,
  oi.product_id,
  p.name as product_name,
  p.unit_size,
  concat(p.name, ' ', p.unit_size) as product_display_name,
  p.category,
  o.source,
  o.status,
  o.created_at,
  o.fulfilled_at,
  o.invoiced_at,
  o.shipped_at,
  o.invoice_number,
  o.qb_invoice_number,
  o.packing_slip_number,
  coalesce(batch_rollup.batch_numbers, '') as batch_numbers,
  oi.quantity as ordered_qty,
  oi.fulfilled_qty,
  oi.declined_qty,
  greatest(oi.quantity - oi.fulfilled_qty - oi.declined_qty, 0) as outstanding_qty,
  oi.base_price,
  oi.client_price,
  oi.override_price,
  coalesce(oi.override_price, oi.client_price, oi.base_price) as effective_price,
  (oi.override_price is not null) as has_price_override,
  (oi.fulfilled_qty * coalesce(oi.override_price, oi.client_price, oi.base_price)) as fulfilled_value,
  (greatest(oi.quantity - oi.declined_qty, 0) * coalesce(oi.override_price, oi.client_price, oi.base_price)) as ordered_value
from public.orders o
join public.clients c
  on c.id = o.client_id
join public.locations l
  on l.id = o.location_id
join public.order_items oi
  on oi.order_id = o.id
join public.products p
  on p.id = oi.product_id
left join lateral (
  select string_agg(distinct b.batch_number, ', ' order by b.batch_number) as batch_numbers
  from public.batch_assignments ba
  join public.batches b
    on b.id = ba.batch_id
  where ba.order_item_id = oi.id
) batch_rollup
  on true;

grant select on public.report_order_lines to authenticated;

create or replace function public.modhanios_apply_fulfilment_close_remaining(
  p_order_id text,
  p_user_id uuid,
  p_assignments jsonb,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_profile public.profiles%rowtype;
  v_outstanding_before numeric(12, 2);
  v_outstanding_after numeric(12, 2);
  v_has_fulfilled_qty boolean;
begin
  select * into v_profile
  from public.profiles
  where user_id = p_user_id;

  if not found or not v_profile.fulfil_orders then
    raise exception 'This user cannot fulfil orders.';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to decline the remaining balance.';
  end if;

  if p_assignments is null then
    p_assignments := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'Assignments payload must be an array.';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.locked_by is distinct from p_user_id then
    raise exception 'Order must be locked by the current user before closing the remaining balance.';
  end if;

  select coalesce(sum(greatest(quantity - fulfilled_qty - declined_qty, 0)), 0)
  into v_outstanding_before
  from public.order_items
  where order_id = p_order_id;

  if jsonb_array_length(p_assignments) > 0 then
    perform public.modhanios_apply_fulfilment(
      p_order_id,
      p_user_id,
      p_assignments
    );
  end if;

  select exists (
    select 1
    from public.order_items
    where order_id = p_order_id
      and fulfilled_qty > 0
  )
  into v_has_fulfilled_qty;

  if not v_has_fulfilled_qty then
    raise exception 'Assign some quantity first, or use the full decline action instead.';
  end if;

  select coalesce(sum(greatest(quantity - fulfilled_qty - declined_qty, 0)), 0)
  into v_outstanding_after
  from public.order_items
  where order_id = p_order_id;

  if v_outstanding_after <= 0 then
    raise exception 'There is no remaining balance to decline.';
  end if;

  update public.order_items
  set declined_qty = declined_qty + greatest(quantity - fulfilled_qty - declined_qty, 0)
  where order_id = p_order_id
    and greatest(quantity - fulfilled_qty - declined_qty, 0) > 0;

  update public.orders
  set status = 'fulfilled',
      fulfilled_at = coalesce(fulfilled_at, timezone('utc', now())),
      decline_reason = btrim(p_reason),
      declined_at = timezone('utc', now()),
      locked_by = null,
      locked_at = null
  where id = p_order_id;

  perform public.modhanios_insert_audit(
    'order_balance_declined',
    v_order.id,
    v_order.client_id,
    p_user_id,
    v_profile.full_name,
    format(
      'Remaining balance on Order #%s declined after partial fulfilment. Reason: %s',
      v_order.order_number,
      btrim(p_reason)
    ),
    format('%s outstanding', v_outstanding_after),
    '0 outstanding'
  );
end;
$$;

revoke all on function public.modhanios_apply_fulfilment_close_remaining(text, uuid, jsonb, text) from public;
grant execute on function public.modhanios_apply_fulfilment_close_remaining(text, uuid, jsonb, text) to authenticated;
