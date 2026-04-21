create or replace function public.modhanios_insert_audit(
  p_action text,
  p_order_id text,
  p_client_id text,
  p_user_id uuid,
  p_user_name text,
  p_details text,
  p_previous_value text default null,
  p_new_value text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_events (
    id,
    timestamp,
    action,
    order_id,
    client_id,
    user_id,
    user_name,
    details,
    previous_value,
    new_value
  )
  values (
    concat('audit-', gen_random_uuid()::text),
    timezone('utc', now()),
    p_action,
    p_order_id,
    p_client_id,
    p_user_id,
    p_user_name,
    p_details,
    p_previous_value,
    p_new_value
  );
end;
$$;

create or replace function public.modhanios_lock_order(
  p_order_id text,
  p_user_id uuid
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

  if not found or not v_profile.fulfil_orders then
    raise exception 'This user cannot fulfil orders.';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.locked_by is not null and v_order.locked_by <> p_user_id then
    raise exception 'Order is already locked by another user.';
  end if;

  if v_order.locked_by = p_user_id then
    return;
  end if;

  update public.orders
  set locked_by = p_user_id,
      locked_at = timezone('utc', now())
  where id = p_order_id;

  perform public.modhanios_insert_audit(
    'order_locked',
    v_order.id,
    v_order.client_id,
    p_user_id,
    v_profile.full_name,
    format('Order #%s locked for fulfilment', v_order.order_number),
    null,
    v_profile.full_name
  );
end;
$$;

create or replace function public.modhanios_unlock_order(
  p_order_id text,
  p_user_id uuid
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

  if v_order.locked_by is null then
    return;
  end if;

  if v_order.locked_by <> p_user_id and not v_profile.manage_settings then
    raise exception 'Only the locking user can unlock this order.';
  end if;

  update public.orders
  set locked_by = null,
      locked_at = null
  where id = p_order_id;
end;
$$;

create or replace function public.modhanios_apply_fulfilment(
  p_order_id text,
  p_user_id uuid,
  p_assignments jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_profile public.profiles%rowtype;
  v_total_assigned numeric(12, 2);
  v_remaining_after numeric(12, 2);
  v_batch_summary text;
  v_next_status text;
begin
  select * into v_profile
  from public.profiles
  where user_id = p_user_id;

  if not found or not v_profile.fulfil_orders then
    raise exception 'This user cannot fulfil orders.';
  end if;

  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array' or jsonb_array_length(p_assignments) = 0 then
    raise exception 'At least one batch assignment is required.';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.locked_by is distinct from p_user_id then
    raise exception 'Order must be locked by the current user before fulfilment.';
  end if;

  if exists (
    with assignments as (
      select
        x."orderItemId" as order_item_id,
        x."batchId" as batch_id,
        x.qty
      from jsonb_to_recordset(p_assignments) as x("orderItemId" text, "batchId" text, qty numeric)
    )
    select 1
    from assignments
    where order_item_id is null
      or batch_id is null
      or qty is null
      or qty <= 0
  ) then
    raise exception 'Assignments must contain valid order item ids, batch ids, and positive quantities.';
  end if;

  if exists (
    with assignments as (
      select
        x."orderItemId" as order_item_id,
        x."batchId" as batch_id,
        x.qty
      from jsonb_to_recordset(p_assignments) as x("orderItemId" text, "batchId" text, qty numeric)
    )
    select 1
    from assignments a
    left join public.order_items oi
      on oi.id = a.order_item_id
     and oi.order_id = p_order_id
    where oi.id is null
  ) then
    raise exception 'Assignment contains an invalid order item.';
  end if;

  if exists (
    with assignments as (
      select
        x."orderItemId" as order_item_id,
        x."batchId" as batch_id,
        x.qty
      from jsonb_to_recordset(p_assignments) as x("orderItemId" text, "batchId" text, qty numeric)
    )
    select 1
    from assignments a
    left join public.batches b
      on b.id = a.batch_id
    where b.id is null
  ) then
    raise exception 'Assignment references a missing batch.';
  end if;

  if exists (
    with assignments as (
      select
        x."orderItemId" as order_item_id,
        x."batchId" as batch_id,
        x.qty
      from jsonb_to_recordset(p_assignments) as x("orderItemId" text, "batchId" text, qty numeric)
    )
    select 1
    from assignments a
    join public.order_items oi
      on oi.id = a.order_item_id
    join public.batches b
      on b.id = a.batch_id
    where oi.order_id = p_order_id
      and oi.product_id <> b.product_id
  ) then
    raise exception 'One or more batches do not match the requested product.';
  end if;

  if exists (
    with assignments as (
      select
        x."orderItemId" as order_item_id,
        x.qty
      from jsonb_to_recordset(p_assignments) as x("orderItemId" text, "batchId" text, qty numeric)
    ),
    assignment_totals as (
      select order_item_id, sum(qty) as requested_qty
      from assignments
      group by order_item_id
    )
    select 1
    from assignment_totals at
    join public.order_items oi
      on oi.id = at.order_item_id
    where oi.order_id = p_order_id
      and at.requested_qty > greatest(oi.quantity - oi.fulfilled_qty, 0)
  ) then
    raise exception 'Assigned quantity exceeds the remaining quantity on the order.';
  end if;

  if exists (
    with assignments as (
      select
        x."batchId" as batch_id,
        x.qty
      from jsonb_to_recordset(p_assignments) as x("orderItemId" text, "batchId" text, qty numeric)
    ),
    batch_totals as (
      select batch_id, sum(qty) as requested_qty
      from assignments
      group by batch_id
    )
    select 1
    from batch_totals bt
    join public.batches b
      on b.id = bt.batch_id
    where bt.requested_qty > b.qty_remaining
  ) then
    raise exception 'Assigned quantity exceeds available batch inventory.';
  end if;

  with assignments as (
    select
      x."orderItemId" as order_item_id,
      x."batchId" as batch_id,
      x.qty
    from jsonb_to_recordset(p_assignments) as x("orderItemId" text, "batchId" text, qty numeric)
  ),
  item_totals as (
    select order_item_id, sum(qty) as assigned_qty
    from assignments
    group by order_item_id
  )
  update public.order_items oi
  set fulfilled_qty = oi.fulfilled_qty + it.assigned_qty
  from item_totals it
  where oi.id = it.order_item_id;

  with assignments as (
    select
      x."batchId" as batch_id,
      x.qty
    from jsonb_to_recordset(p_assignments) as x("orderItemId" text, "batchId" text, qty numeric)
  ),
  batch_totals as (
    select batch_id, sum(qty) as assigned_qty
    from assignments
    group by batch_id
  )
  update public.batches b
  set qty_remaining = b.qty_remaining - bt.assigned_qty,
      status = case when b.qty_remaining - bt.assigned_qty <= 0 then 'cleared' else 'active' end
  from batch_totals bt
  where b.id = bt.batch_id;

  insert into public.batch_assignments (
    id,
    order_item_id,
    batch_id,
    qty,
    created_at
  )
  select
    concat('assign-', gen_random_uuid()::text),
    x."orderItemId",
    x."batchId",
    x.qty,
    timezone('utc', now())
  from jsonb_to_recordset(p_assignments) as x("orderItemId" text, "batchId" text, qty numeric);

  with assignments as (
    select
      x."batchId" as batch_id,
      x.qty
    from jsonb_to_recordset(p_assignments) as x("orderItemId" text, "batchId" text, qty numeric)
  )
  select
    coalesce(sum(qty), 0),
    string_agg(distinct b.batch_number, ', ' order by b.batch_number)
  into v_total_assigned, v_batch_summary
  from assignments a
  join public.batches b
    on b.id = a.batch_id;

  select coalesce(sum(greatest(quantity - fulfilled_qty, 0)), 0)
  into v_remaining_after
  from public.order_items
  where order_id = p_order_id;

  v_next_status := case when v_remaining_after > 0 then 'partial' else 'fulfilled' end;

  update public.orders
  set status = v_next_status,
      fulfilled_at = timezone('utc', now()),
      locked_by = null,
      locked_at = null
  where id = p_order_id;

  perform public.modhanios_insert_audit(
    'batch_assigned',
    v_order.id,
    v_order.client_id,
    p_user_id,
    v_profile.full_name,
    format('Assigned batches %s to Order #%s', coalesce(v_batch_summary, 'selected batches'), v_order.order_number),
    format('%s outstanding', coalesce((select sum(greatest(quantity - fulfilled_qty - v_total_assigned, 0)) from public.order_items where order_id = p_order_id), 0)),
    format('%s outstanding', v_remaining_after)
  );

  perform public.modhanios_insert_audit(
    case when v_remaining_after > 0 then 'order_partial' else 'order_fulfilled' end,
    v_order.id,
    v_order.client_id,
    p_user_id,
    v_profile.full_name,
    case
      when v_remaining_after > 0 then format('Order #%s partially fulfilled. %s units remain outstanding.', v_order.order_number, v_remaining_after)
      else format('Order #%s fully fulfilled and ready for invoicing.', v_order.order_number)
    end,
    v_order.status,
    v_next_status
  );
end;
$$;

create or replace function public.modhanios_decline_order(
  p_order_id text,
  p_user_id uuid,
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
begin
  select * into v_profile
  from public.profiles
  where user_id = p_user_id;

  if not found or not v_profile.fulfil_orders then
    raise exception 'This user cannot decline orders.';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A decline reason is required.';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if exists (
    select 1
    from public.order_items
    where order_id = p_order_id
      and fulfilled_qty > 0
  ) then
    raise exception 'A partially fulfilled order cannot be declined.';
  end if;

  update public.orders
  set status = 'declined',
      decline_reason = btrim(p_reason),
      declined_at = timezone('utc', now()),
      locked_by = null,
      locked_at = null
  where id = p_order_id;

  perform public.modhanios_insert_audit(
    'order_declined',
    v_order.id,
    v_order.client_id,
    p_user_id,
    v_profile.full_name,
    format('Order #%s declined. Reason: %s', v_order.order_number, btrim(p_reason)),
    v_order.status,
    'declined'
  );
end;
$$;

create or replace function public.modhanios_create_invoice(
  p_order_id text,
  p_user_id uuid,
  p_invoice_number text,
  p_overrides jsonb,
  p_invoice_email_sent_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_profile public.profiles%rowtype;
  v_invoice_total numeric(12, 2);
  v_override_count integer;
begin
  select * into v_profile
  from public.profiles
  where user_id = p_user_id;

  if not found then
    raise exception 'User profile not found.';
  end if;

  if p_invoice_number is null or btrim(p_invoice_number) = '' then
    raise exception 'Invoice number is required.';
  end if;

  if p_overrides is null then
    p_overrides := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_overrides) <> 'array' then
    raise exception 'Overrides payload must be an array.';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.invoice_number is not null then
    raise exception 'Invoice already exists for this order.';
  end if;

  if v_order.status not in ('fulfilled', 'partial') then
    raise exception 'Only fulfilled or partial orders can be invoiced.';
  end if;

  if not exists (
    select 1
    from public.order_items
    where order_id = p_order_id
      and fulfilled_qty > 0
  ) then
    raise exception 'There is no fulfilled quantity to invoice.';
  end if;

  if exists (
    with overrides as (
      select
        x."orderItemId" as order_item_id
      from jsonb_to_recordset(p_overrides) as x("orderItemId" text, "overridePrice" numeric, "overrideReason" text)
    )
    select 1
    from overrides o
    left join public.order_items oi
      on oi.id = o.order_item_id
     and oi.order_id = p_order_id
    where oi.id is null
  ) then
    raise exception 'Override contains an invalid order item.';
  end if;

  select count(*)
  into v_override_count
  from jsonb_to_recordset(p_overrides) as x("orderItemId" text, "overridePrice" numeric, "overrideReason" text)
  where x."overridePrice" is not null;

  if v_override_count > 0 and not v_profile.override_prices then
    raise exception 'This user cannot override prices.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_overrides) as x("orderItemId" text, "overridePrice" numeric, "overrideReason" text)
    where x."overridePrice" is not null
      and coalesce(nullif(btrim(x."overrideReason"), ''), '') = ''
  ) then
    raise exception 'Override reason is required whenever the invoice price differs from the client rate.';
  end if;

  with overrides as (
    select
      x."orderItemId" as order_item_id,
      x."overridePrice" as override_price,
      nullif(btrim(x."overrideReason"), '') as override_reason
    from jsonb_to_recordset(p_overrides) as x("orderItemId" text, "overridePrice" numeric, "overrideReason" text)
  )
  update public.order_items oi
  set override_price = o.override_price,
      override_reason = o.override_reason
  from overrides o
  where oi.id = o.order_item_id
    and oi.order_id = p_order_id;

  select coalesce(sum(fulfilled_qty * coalesce(override_price, client_price, base_price)), 0)
  into v_invoice_total
  from public.order_items
  where order_id = p_order_id
    and fulfilled_qty > 0;

  update public.orders
  set status = 'invoiced',
      invoice_number = btrim(p_invoice_number),
      invoice_total = v_invoice_total,
      invoiced_at = timezone('utc', now()),
      invoice_email_sent_at = p_invoice_email_sent_at
  where id = p_order_id;

  insert into public.audit_events (
    id,
    timestamp,
    action,
    order_id,
    client_id,
    user_id,
    user_name,
    details,
    previous_value,
    new_value
  )
  select
    concat('audit-', gen_random_uuid()::text),
    timezone('utc', now()),
    'price_override',
    v_order.id,
    v_order.client_id,
    p_user_id,
    v_profile.full_name,
    format(
      '%s %s override set to $%s. Reason: %s',
      p.name,
      p.unit_size,
      to_char(o.override_price, 'FM999999990.00'),
      o.override_reason
    ),
    concat('$', to_char(oi.client_price, 'FM999999990.00')),
    concat('$', to_char(o.override_price, 'FM999999990.00'))
  from (
    select
      x."orderItemId" as order_item_id,
      x."overridePrice" as override_price,
      nullif(btrim(x."overrideReason"), '') as override_reason
    from jsonb_to_recordset(p_overrides) as x("orderItemId" text, "overridePrice" numeric, "overrideReason" text)
    where x."overridePrice" is not null
  ) o
  join public.order_items oi
    on oi.id = o.order_item_id
  join public.products p
    on p.id = oi.product_id;

  perform public.modhanios_insert_audit(
    'invoice_created',
    v_order.id,
    v_order.client_id,
    p_user_id,
    v_profile.full_name,
    format('Invoice %s created for Order #%s', btrim(p_invoice_number), v_order.order_number),
    null,
    btrim(p_invoice_number)
  );

  if p_invoice_email_sent_at is not null then
    perform public.modhanios_insert_audit(
      'invoice_sent',
      v_order.id,
      v_order.client_id,
      p_user_id,
      v_profile.full_name,
      format('Invoice email sent for %s', btrim(p_invoice_number)),
      null,
      btrim(p_invoice_number)
    );
  end if;
end;
$$;

create or replace function public.modhanios_push_qb_invoice(
  p_order_id text,
  p_user_id uuid,
  p_qb_invoice_number text
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

  if p_qb_invoice_number is null or btrim(p_qb_invoice_number) = '' then
    raise exception 'QuickBooks invoice number is required.';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.invoice_number is null then
    raise exception 'Invoice must exist before pushing to QuickBooks.';
  end if;

  update public.orders
  set qb_invoice_number = btrim(p_qb_invoice_number),
      qb_sync_status = 'pushed',
      qb_synced_at = timezone('utc', now())
  where id = p_order_id;

  update public.quickbooks_settings
  set last_sync_at = timezone('utc', now()),
      next_invoice_sequence = next_invoice_sequence + 1,
      status = 'connected'
  where id = 'singleton';

  perform public.modhanios_insert_audit(
    'qb_sync',
    v_order.id,
    v_order.client_id,
    p_user_id,
    v_profile.full_name,
    format('Invoice %s pushed to QuickBooks Desktop', v_order.invoice_number),
    'Pending',
    btrim(p_qb_invoice_number)
  );
end;
$$;

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

  update public.orders
  set status = 'shipped',
      shipped_at = timezone('utc', now()),
      packing_slip_number = btrim(p_packing_slip_number),
      packing_slip_sent_at = p_packing_slip_sent_at
  where id = p_order_id;

  perform public.modhanios_insert_audit(
    'packing_slip_created',
    v_order.id,
    v_order.client_id,
    p_user_id,
    v_profile.full_name,
    format('Packing slip %s generated for Order #%s', btrim(p_packing_slip_number), v_order.order_number),
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
begin
  select * into v_profile
  from public.profiles
  where user_id = p_user_id;

  if not found or (not v_profile.fulfil_orders and not v_profile.manage_settings) then
    raise exception 'This user cannot log production batches.';
  end if;

  if p_batch_id is null or btrim(p_batch_id) = '' then
    raise exception 'Batch id is required.';
  end if;

  if p_batch_number is null or btrim(p_batch_number) = '' then
    raise exception 'Batch number is required.';
  end if;

  if p_qty_produced is null or p_qty_produced <= 0 then
    raise exception 'Quantity produced must be greater than zero.';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id;

  if not found then
    raise exception 'Product not found.';
  end if;

  insert into public.batches (
    id,
    batch_number,
    product_id,
    production_date,
    qty_produced,
    qty_remaining,
    status
  )
  values (
    p_batch_id,
    btrim(p_batch_number),
    p_product_id,
    p_production_date,
    p_qty_produced,
    p_qty_produced,
    'active'
  );

  perform public.modhanios_insert_audit(
    'production_logged',
    null,
    null,
    p_user_id,
    v_profile.full_name,
    format(
      'Produced %s %s %s - Batch %s',
      trim(to_char(p_qty_produced, 'FM999999990.##')),
      v_product.name,
      v_product.unit_size,
      btrim(p_batch_number)
    ),
    null,
    format('%s: %s units', btrim(p_batch_number), trim(to_char(p_qty_produced, 'FM999999990.##')))
  );
end;
$$;

drop policy if exists "batches_all_authenticated" on public.batches;
drop policy if exists "orders_all_authenticated" on public.orders;
drop policy if exists "order_items_all_authenticated" on public.order_items;
drop policy if exists "batch_assignments_all_authenticated" on public.batch_assignments;

drop policy if exists "batches_select_authenticated" on public.batches;
create policy "batches_select_authenticated" on public.batches
for select to authenticated using (true);

drop policy if exists "batches_insert_authenticated" on public.batches;
create policy "batches_insert_authenticated" on public.batches
for insert to authenticated with check (true);

drop policy if exists "orders_select_authenticated" on public.orders;
create policy "orders_select_authenticated" on public.orders
for select to authenticated using (true);

drop policy if exists "orders_insert_authenticated" on public.orders;
create policy "orders_insert_authenticated" on public.orders
for insert to authenticated with check (true);

drop policy if exists "order_items_select_authenticated" on public.order_items;
create policy "order_items_select_authenticated" on public.order_items
for select to authenticated using (true);

drop policy if exists "order_items_insert_authenticated" on public.order_items;
create policy "order_items_insert_authenticated" on public.order_items
for insert to authenticated with check (true);

drop policy if exists "batch_assignments_select_authenticated" on public.batch_assignments;
create policy "batch_assignments_select_authenticated" on public.batch_assignments
for select to authenticated using (true);

revoke all on function public.modhanios_insert_audit(text, text, text, uuid, text, text, text, text) from public;
revoke all on function public.modhanios_lock_order(text, uuid) from public;
revoke all on function public.modhanios_unlock_order(text, uuid) from public;
revoke all on function public.modhanios_apply_fulfilment(text, uuid, jsonb) from public;
revoke all on function public.modhanios_decline_order(text, uuid, text) from public;
revoke all on function public.modhanios_create_invoice(text, uuid, text, jsonb, timestamptz) from public;
revoke all on function public.modhanios_push_qb_invoice(text, uuid, text) from public;
revoke all on function public.modhanios_confirm_shipment(text, uuid, text, timestamptz) from public;
revoke all on function public.modhanios_log_production_batch(text, text, text, date, numeric, uuid) from public;

grant execute on function public.modhanios_lock_order(text, uuid) to authenticated;
grant execute on function public.modhanios_unlock_order(text, uuid) to authenticated;
grant execute on function public.modhanios_apply_fulfilment(text, uuid, jsonb) to authenticated;
grant execute on function public.modhanios_decline_order(text, uuid, text) to authenticated;
grant execute on function public.modhanios_create_invoice(text, uuid, text, jsonb, timestamptz) to authenticated;
grant execute on function public.modhanios_push_qb_invoice(text, uuid, text) to authenticated;
grant execute on function public.modhanios_confirm_shipment(text, uuid, text, timestamptz) to authenticated;
grant execute on function public.modhanios_log_production_batch(text, text, text, date, numeric, uuid) to authenticated;
