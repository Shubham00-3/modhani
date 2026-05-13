alter table public.orders
  add column if not exists invoice_ship_to_name text,
  add column if not exists invoice_address_line1 text,
  add column if not exists invoice_address_line2 text,
  add column if not exists invoice_city text,
  add column if not exists invoice_province text,
  add column if not exists invoice_postal_code text,
  add column if not exists invoice_country text,
  add column if not exists qb_txn_id text,
  add column if not exists qb_edit_sequence text;

alter table public.order_items
  add column if not exists qb_txn_line_id text;

alter table public.quickbooks_sync_jobs
  add column if not exists qb_edit_sequence text;

alter table public.quickbooks_sync_jobs
  drop constraint if exists quickbooks_sync_jobs_job_type_check;

alter table public.quickbooks_sync_jobs
  add constraint quickbooks_sync_jobs_job_type_check
  check (job_type in ('invoice', 'invoice_update', 'customer', 'item'));

drop function if exists public.modhanios_create_invoice(text, uuid, text, jsonb, timestamptz);
create or replace function public.modhanios_create_invoice(
  p_order_id text,
  p_user_id uuid,
  p_invoice_number text,
  p_overrides jsonb,
  p_invoice_email_sent_at timestamptz default null,
  p_ship_to_name text default null,
  p_ship_to_address_line1 text default null,
  p_ship_to_address_line2 text default null,
  p_ship_to_city text default null,
  p_ship_to_province text default null,
  p_ship_to_postal_code text default null,
  p_ship_to_country text default 'Canada'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_profile public.profiles%rowtype;
  v_location public.locations%rowtype;
  v_invoice_total numeric(12, 2);
  v_override_count integer;
begin
  select * into v_profile from public.profiles where user_id = p_user_id;
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

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;

  select * into v_location from public.locations where id = v_order.location_id;

  if v_order.invoice_number is not null then
    raise exception 'Invoice already exists for this order.';
  end if;

  if v_order.status not in ('fulfilled', 'partial') then
    raise exception 'Only fulfilled or partial orders can be invoiced.';
  end if;

  if not exists (select 1 from public.order_items where order_id = p_order_id and fulfilled_qty > 0) then
    raise exception 'There is no fulfilled quantity to invoice.';
  end if;

  if exists (
    with overrides as (
      select x."orderItemId" as order_item_id
      from jsonb_to_recordset(p_overrides) as x("orderItemId" text, "overridePrice" numeric, "overrideReason" text)
    )
    select 1
    from overrides o
    left join public.order_items oi on oi.id = o.order_item_id and oi.order_id = p_order_id
    where oi.id is null
  ) then
    raise exception 'Override contains an invalid order item.';
  end if;

  select count(*) into v_override_count
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

  update public.order_items
  set invoice_qty = fulfilled_qty
  where order_id = p_order_id
    and fulfilled_qty > 0;

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

  select coalesce(sum(coalesce(invoice_qty, fulfilled_qty) * coalesce(override_price, client_price, base_price)), 0)
  into v_invoice_total
  from public.order_items
  where order_id = p_order_id
    and coalesce(invoice_qty, fulfilled_qty) > 0;

  update public.orders
  set status = 'invoiced',
      invoice_number = btrim(p_invoice_number),
      invoice_total = v_invoice_total,
      invoiced_at = timezone('utc', now()),
      invoice_email_sent_at = p_invoice_email_sent_at,
      invoice_ship_to_name = coalesce(nullif(btrim(p_ship_to_name), ''), v_location.name),
      invoice_address_line1 = coalesce(nullif(btrim(p_ship_to_address_line1), ''), v_location.address_line1),
      invoice_address_line2 = nullif(btrim(coalesce(p_ship_to_address_line2, v_location.address_line2)), ''),
      invoice_city = coalesce(nullif(btrim(p_ship_to_city), ''), v_location.city),
      invoice_province = coalesce(nullif(btrim(p_ship_to_province), ''), v_location.province),
      invoice_postal_code = coalesce(nullif(btrim(p_ship_to_postal_code), ''), v_location.postal_code),
      invoice_country = coalesce(nullif(btrim(p_ship_to_country), ''), v_location.country, 'Canada')
  where id = p_order_id;

  perform public.modhanios_insert_audit(
    'invoice_created',
    v_order.id,
    v_order.client_id,
    p_user_id,
    v_profile.full_name,
    format('Draft invoice %s created for Order #%s', btrim(p_invoice_number), v_order.order_number),
    null,
    btrim(p_invoice_number)
  );
end;
$$;

drop function if exists public.modhanios_update_invoice(text, uuid, jsonb, text);
create or replace function public.modhanios_update_invoice(
  p_order_id text,
  p_user_id uuid,
  p_lines jsonb,
  p_reason text,
  p_ship_to jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_order public.orders%rowtype;
  v_previous_total numeric(12, 2);
  v_new_total numeric(12, 2);
  v_line jsonb;
  v_order_item public.order_items%rowtype;
  v_order_item_id text;
  v_next_qty numeric(12, 2);
  v_next_override_price numeric(12, 2);
  v_next_override_reason text;
  v_requires_qb_update boolean;
begin
  select * into v_profile from public.profiles where user_id = p_user_id;
  if not found then
    raise exception 'User profile not found.';
  end if;

  if not v_profile.fulfil_orders and not v_profile.override_prices then
    raise exception 'This user cannot edit invoices.';
  end if;

  if auth.uid() is distinct from p_user_id then
    raise exception 'Authenticated user mismatch.';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Invoice edit reason is required.';
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one invoice line is required.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status not in ('invoiced', 'shipped') or v_order.invoice_number is null then
    raise exception 'Only created invoices can be edited.';
  end if;

  if v_order.qb_sync_status = 'syncing' then
    raise exception 'Wait for the current QuickBooks sync to finish before editing this invoice.';
  end if;

  if exists (
    select 1
    from public.quickbooks_sync_jobs
    where order_id = p_order_id
      and job_type in ('invoice', 'invoice_update')
      and status in ('pending', 'syncing')
  ) then
    raise exception 'Finish the existing QuickBooks sync job before editing this invoice.';
  end if;

  v_previous_total := v_order.invoice_total;
  v_requires_qb_update := v_order.qb_txn_id is not null or v_order.qb_sync_status = 'pushed';

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_order_item_id := v_line ->> 'orderItemId';
    v_next_qty := nullif(v_line ->> 'invoiceQty', '')::numeric;
    v_next_override_price := nullif(v_line ->> 'overridePrice', '')::numeric;
    v_next_override_reason := nullif(btrim(coalesce(v_line ->> 'overrideReason', '')), '');

    select * into v_order_item
    from public.order_items
    where id = v_order_item_id
      and order_id = p_order_id
    for update;

    if not found then
      raise exception 'Invoice line % does not belong to this order.', v_order_item_id;
    end if;

    if v_next_qty is null or v_next_qty < 0 or v_next_qty > greatest(v_order_item.fulfilled_qty, 0) then
      raise exception 'Invoice quantity is invalid for line %.', v_order_item_id;
    end if;

    if v_next_override_price is not null and v_next_override_price < 0 then
      raise exception 'Invoice price is invalid for line %.', v_order_item_id;
    end if;

    if v_next_override_price is not null and not v_profile.override_prices then
      raise exception 'This user cannot override prices.';
    end if;

    if v_next_override_price is not null and v_next_override_reason is null then
      raise exception 'Price override reason is required for line %.', v_order_item_id;
    end if;

    update public.order_items
    set invoice_qty = v_next_qty,
        override_price = v_next_override_price,
        override_reason = v_next_override_reason
    where id = v_order_item_id;
  end loop;

  if not exists (
    select 1 from public.order_items
    where order_id = p_order_id
      and coalesce(invoice_qty, fulfilled_qty) > 0
  ) then
    raise exception 'Invoice must keep at least one billed line.';
  end if;

  select coalesce(sum(coalesce(invoice_qty, fulfilled_qty) * coalesce(override_price, client_price, base_price)), 0)
  into v_new_total
  from public.order_items
  where order_id = p_order_id
    and coalesce(invoice_qty, fulfilled_qty) > 0;

  update public.orders
  set invoice_total = v_new_total,
      invoice_ship_to_name = coalesce(nullif(btrim(p_ship_to ->> 'name'), ''), invoice_ship_to_name),
      invoice_address_line1 = coalesce(nullif(btrim(p_ship_to ->> 'addressLine1'), ''), invoice_address_line1),
      invoice_address_line2 = case when p_ship_to is null then invoice_address_line2 else nullif(btrim(coalesce(p_ship_to ->> 'addressLine2', '')), '') end,
      invoice_city = coalesce(nullif(btrim(p_ship_to ->> 'city'), ''), invoice_city),
      invoice_province = coalesce(nullif(btrim(p_ship_to ->> 'province'), ''), invoice_province),
      invoice_postal_code = coalesce(nullif(btrim(p_ship_to ->> 'postalCode'), ''), invoice_postal_code),
      invoice_country = coalesce(nullif(btrim(p_ship_to ->> 'country'), ''), invoice_country, 'Canada'),
      qb_sync_status = case when v_requires_qb_update then 'pending' when qb_sync_status = 'failed' then null else qb_sync_status end
  where id = p_order_id;

  insert into public.invoice_revisions (
    order_id,
    revised_by,
    reason,
    previous_total,
    new_total,
    next_total,
    lines,
    edited_by_name
  )
  values (
    p_order_id,
    p_user_id,
    btrim(p_reason),
    v_previous_total,
    v_new_total,
    v_new_total,
    jsonb_build_object('lines', p_lines, 'shipTo', coalesce(p_ship_to, '{}'::jsonb)),
    v_profile.full_name
  );

  if v_requires_qb_update then
    insert into public.quickbooks_sync_jobs (order_id, job_type, status, created_by)
    values (p_order_id, 'invoice_update', 'pending', p_user_id)
    on conflict (order_id, job_type) where status in ('pending', 'syncing', 'failed')
    do update set
      status = 'pending',
      error_message = null,
      locked_by_ticket = null,
      locked_at = null::timestamptz,
      updated_at = timezone('utc', now());
  end if;

  perform public.modhanios_insert_audit(
    'invoice_updated',
    p_order_id,
    v_order.client_id,
    p_user_id,
    v_profile.full_name,
    format('Invoice %s updated: %s', v_order.invoice_number, btrim(p_reason)),
    coalesce(v_previous_total::text, ''),
    v_new_total::text
  );
end;
$$;

create or replace function public.modhanios_queue_qb_invoice(
  p_order_id text,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_order public.orders%rowtype;
  v_job_id uuid;
  v_invoice_job_type text;
begin
  select * into v_profile from public.profiles where user_id = p_user_id;
  if not found then
    raise exception 'User profile not found.';
  end if;

  perform public.modhanios_require_qb_invoice_ready(p_order_id);

  select * into v_order from public.orders where id = p_order_id for update;
  v_invoice_job_type := case when v_order.qb_txn_id is not null then 'invoice_update' else 'invoice' end;

  insert into public.quickbooks_sync_jobs (
    order_id, job_type, status, entity_type, entity_id, created_by, error_message, locked_by_ticket, locked_at
  )
  select null::text, 'customer', 'pending', 'location', v_order.location_id, p_user_id, null::text, null::text, null::timestamptz
  where not exists (
    select 1 from public.quickbooks_sync_jobs existing
    where existing.job_type = 'customer'
      and existing.entity_id = v_order.location_id
      and existing.status = 'pushed'
  )
  on conflict (job_type, entity_id) where status in ('pending', 'syncing', 'failed') and job_type in ('customer', 'item')
  do update set status = 'pending', error_message = null, locked_by_ticket = null, locked_at = null::timestamptz, updated_at = timezone('utc', now());

  insert into public.quickbooks_sync_jobs (
    order_id, job_type, status, entity_type, entity_id, created_by, error_message, locked_by_ticket, locked_at
  )
  select distinct null::text, 'item', 'pending', 'product', oi.product_id, p_user_id, null::text, null::text, null::timestamptz
  from public.order_items oi
  join public.products p on p.id = oi.product_id
  where oi.order_id = p_order_id
    and coalesce(oi.invoice_qty, oi.fulfilled_qty, 0) > 0
    and nullif(btrim(coalesce(p.qb_item_name, concat_ws(' ', p.name, p.unit_size))), '') is not null
    and not exists (
      select 1 from public.quickbooks_sync_jobs existing
      where existing.job_type = 'item'
        and existing.entity_id = oi.product_id
        and existing.status = 'pushed'
    )
  on conflict (job_type, entity_id) where status in ('pending', 'syncing', 'failed') and job_type in ('customer', 'item')
  do update set status = 'pending', error_message = null, locked_by_ticket = null, locked_at = null::timestamptz, updated_at = timezone('utc', now());

  insert into public.quickbooks_sync_jobs (order_id, job_type, status, created_by)
  values (p_order_id, v_invoice_job_type, 'pending', p_user_id)
  on conflict (order_id, job_type) where status in ('pending', 'syncing', 'failed')
  do update set
    status = 'pending',
    error_message = null,
    locked_by_ticket = null,
    locked_at = null::timestamptz,
    updated_at = timezone('utc', now())
  returning id into v_job_id;

  update public.orders set qb_sync_status = 'pending' where id = p_order_id;

  perform public.modhanios_insert_audit(
    'qb_sync_queued',
    v_order.id,
    v_order.client_id,
    p_user_id,
    v_profile.full_name,
    format('Invoice %s queued for QuickBooks Desktop sync', v_order.invoice_number),
    coalesce(v_order.qb_sync_status, 'not queued'),
    'pending'
  );

  return v_job_id;
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

  insert into public.batches (id, batch_number, product_id, production_date, qty_produced, qty_remaining, status)
  values (p_batch_id, btrim(p_batch_number), p_product_id, p_production_date, p_qty_produced, p_qty_produced, 'active');

  perform public.modhanios_insert_audit(
    'production_logged',
    null,
    null,
    p_user_id,
    v_profile.full_name,
    format('Produced %s %s %s - Lot Code %s', trim(to_char(p_qty_produced, 'FM999999990.##')), v_product.name, v_product.unit_size, btrim(p_batch_number)),
    null,
    format('%s: %s units', btrim(p_batch_number), trim(to_char(p_qty_produced, 'FM999999990.##')))
  );
end;
$$;

revoke all on function public.modhanios_create_invoice(text, uuid, text, jsonb, timestamptz, text, text, text, text, text, text, text) from public;
revoke all on function public.modhanios_update_invoice(text, uuid, jsonb, text, jsonb) from public;
revoke all on function public.modhanios_queue_qb_invoice(text, uuid) from public;
revoke all on function public.modhanios_log_production_batch(text, text, text, date, numeric, uuid) from public;
grant execute on function public.modhanios_create_invoice(text, uuid, text, jsonb, timestamptz, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.modhanios_update_invoice(text, uuid, jsonb, text, jsonb) to authenticated;
grant execute on function public.modhanios_queue_qb_invoice(text, uuid) to authenticated;
grant execute on function public.modhanios_log_production_batch(text, text, text, date, numeric, uuid) to authenticated;
