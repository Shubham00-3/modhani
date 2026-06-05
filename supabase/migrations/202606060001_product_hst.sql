-- Harmonized Sales Tax (HST) for products and invoices.
--
-- Products can be flagged HST-applicable. When an invoice is created/edited,
-- each billed line snapshots whether HST applies and the 13% tax on its
-- (post-discount) line total. `orders.invoice_total` stays the pre-tax subtotal
-- (unchanged for QuickBooks/reporting); the tax is stored separately in
-- `orders.invoice_hst_total`. The grand total = invoice_total + invoice_hst_total.

alter table public.products
  add column if not exists hst_applicable boolean not null default false;

alter table public.order_items
  add column if not exists hst_applicable boolean not null default false,
  add column if not exists hst_amount numeric(12, 2) not null default 0;

alter table public.orders
  add column if not exists invoice_hst_total numeric(12, 2) not null default 0;

-- ---------------------------------------------------------------------------
-- Replace modhanios_upsert_product with the p_hst_applicable parameter.
-- ---------------------------------------------------------------------------
drop function if exists public.modhanios_upsert_product(uuid, text, text, text, text, numeric, text, text, text, numeric, integer, integer, text, text, text, text);

create or replace function public.modhanios_upsert_product(
  p_user_id uuid,
  p_id text,
  p_name text,
  p_unit_size text,
  p_category text,
  p_base_catalogue_price numeric,
  p_item_number text default null,
  p_upc text default null,
  p_packaging_details text default null,
  p_units_per_case numeric default null,
  p_shelf_life_days integer default null,
  p_lead_time_days integer default null,
  p_order_unit_label text default null,
  p_qb_item_name text default null,
  p_image_url text default null,
  p_image_path text default null,
  p_hst_applicable boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id text := btrim(coalesce(p_id, ''));
  v_base_price numeric := round(greatest(coalesce(p_base_catalogue_price, 0), 0), 2);
begin
  perform public.modhanios_assert_manage_settings(p_user_id);

  if v_product_id = '' then
    raise exception 'Product id is required.';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'Product name is required.';
  end if;

  if p_unit_size is null or btrim(p_unit_size) = '' then
    raise exception 'Unit size is required.';
  end if;

  insert into public.products (
    id,
    name,
    unit_size,
    category,
    base_catalogue_price,
    item_number,
    upc,
    packaging_details,
    units_per_case,
    shelf_life_days,
    lead_time_days,
    order_unit_label,
    qb_item_name,
    qb_mapping_status,
    image_url,
    image_path,
    hst_applicable
  )
  values (
    v_product_id,
    btrim(p_name),
    btrim(p_unit_size),
    nullif(btrim(coalesce(p_category, '')), ''),
    v_base_price,
    nullif(btrim(coalesce(p_item_number, '')), ''),
    nullif(btrim(coalesce(p_upc, '')), ''),
    nullif(btrim(coalesce(p_packaging_details, '')), ''),
    case when p_units_per_case is null then null else greatest(p_units_per_case, 0) end,
    case when p_shelf_life_days is null then null else greatest(p_shelf_life_days, 0) end,
    case when p_lead_time_days is null then null else greatest(p_lead_time_days, 0) end,
    nullif(btrim(coalesce(p_order_unit_label, '')), ''),
    nullif(btrim(coalesce(p_qb_item_name, concat_ws(' ', p_name, p_unit_size))), ''),
    'ready',
    nullif(btrim(coalesce(p_image_url, '')), ''),
    nullif(btrim(coalesce(p_image_path, '')), ''),
    coalesce(p_hst_applicable, false)
  )
  on conflict (id) do update set
    name = excluded.name,
    unit_size = excluded.unit_size,
    category = excluded.category,
    base_catalogue_price = excluded.base_catalogue_price,
    item_number = excluded.item_number,
    upc = excluded.upc,
    packaging_details = excluded.packaging_details,
    units_per_case = excluded.units_per_case,
    shelf_life_days = excluded.shelf_life_days,
    lead_time_days = excluded.lead_time_days,
    order_unit_label = excluded.order_unit_label,
    qb_item_name = excluded.qb_item_name,
    qb_mapping_status = excluded.qb_mapping_status,
    image_url = excluded.image_url,
    image_path = excluded.image_path,
    hst_applicable = excluded.hst_applicable,
    updated_at = timezone('utc', now());
end;
$$;

revoke all on function public.modhanios_upsert_product(uuid, text, text, text, text, numeric, text, text, text, numeric, integer, integer, text, text, text, text, boolean) from public;
grant execute on function public.modhanios_upsert_product(uuid, text, text, text, text, numeric, text, text, text, numeric, integer, integer, text, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- modhanios_create_invoice — snapshot HST per line and total it.
-- (Full re-create of the function from 202605280001 with HST added.)
-- ---------------------------------------------------------------------------
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
  v_invoice_hst_total numeric(12, 2);
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
      from jsonb_to_recordset(p_overrides) as x("orderItemId" text, "overridePrice" numeric, "overrideReason" text, "discount" numeric, "discountReason" text)
    )
    select 1
    from overrides o
    left join public.order_items oi on oi.id = o.order_item_id and oi.order_id = p_order_id
    where oi.id is null
  ) then
    raise exception 'Override contains an invalid order item.';
  end if;

  select count(*) into v_override_count
  from jsonb_to_recordset(p_overrides) as x("orderItemId" text, "overridePrice" numeric, "overrideReason" text, "discount" numeric, "discountReason" text)
  where x."overridePrice" is not null;

  if v_override_count > 0 and not v_profile.override_prices then
    raise exception 'This user cannot override prices.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_overrides) as x("orderItemId" text, "overridePrice" numeric, "overrideReason" text, "discount" numeric, "discountReason" text)
    where x."overridePrice" is not null
      and coalesce(nullif(btrim(x."overrideReason"), ''), '') = ''
  ) then
    raise exception 'Override reason is required whenever the invoice price differs from the client rate.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_overrides) as x("orderItemId" text, "overridePrice" numeric, "overrideReason" text, "discount" numeric, "discountReason" text)
    where x."discount" is not null and x."discount" < 0
  ) then
    raise exception 'Discount cannot be negative.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_overrides) as x("orderItemId" text, "overridePrice" numeric, "overrideReason" text, "discount" numeric, "discountReason" text)
    where coalesce(x."discount", 0) > 0
      and coalesce(nullif(btrim(x."discountReason"), ''), '') = ''
  ) then
    raise exception 'Discount reason is required whenever a line discount is applied.';
  end if;

  if exists (
    with overrides as (
      select
        x."orderItemId" as order_item_id,
        x."overridePrice" as override_price,
        coalesce(x."discount", 0) as discount
      from jsonb_to_recordset(p_overrides) as x("orderItemId" text, "overridePrice" numeric, "overrideReason" text, "discount" numeric, "discountReason" text)
    )
    select 1
    from overrides o
    join public.order_items oi on oi.id = o.order_item_id and oi.order_id = p_order_id
    where o.discount > (oi.fulfilled_qty * coalesce(o.override_price, oi.client_price, oi.base_price))
  ) then
    raise exception 'Discount cannot exceed the line subtotal.';
  end if;

  update public.order_items
  set invoice_qty = fulfilled_qty
  where order_id = p_order_id
    and fulfilled_qty > 0;

  with overrides as (
    select
      x."orderItemId" as order_item_id,
      x."overridePrice" as override_price,
      nullif(btrim(x."overrideReason"), '') as override_reason,
      coalesce(x."discount", 0) as discount,
      nullif(btrim(x."discountReason"), '') as discount_reason
    from jsonb_to_recordset(p_overrides) as x("orderItemId" text, "overridePrice" numeric, "overrideReason" text, "discount" numeric, "discountReason" text)
  )
  update public.order_items oi
  set override_price = o.override_price,
      override_reason = o.override_reason,
      discount_amount = o.discount,
      discount_reason = case when o.discount > 0 then o.discount_reason else null end
  from overrides o
  where oi.id = o.order_item_id
    and oi.order_id = p_order_id;

  -- Snapshot HST per billed line from the product flag.
  update public.order_items oi
  set hst_applicable = coalesce(p.hst_applicable, false),
      hst_amount = case
        when coalesce(p.hst_applicable, false)
        then round(greatest(
          coalesce(oi.invoice_qty, oi.fulfilled_qty) * coalesce(oi.override_price, oi.client_price, oi.base_price)
            - coalesce(oi.discount_amount, 0),
          0
        ) * 0.13, 2)
        else 0
      end
  from public.products p
  where oi.product_id = p.id
    and oi.order_id = p_order_id;

  select coalesce(sum(greatest(
    coalesce(invoice_qty, fulfilled_qty) * coalesce(override_price, client_price, base_price)
      - coalesce(discount_amount, 0),
    0
  )), 0)
  into v_invoice_total
  from public.order_items
  where order_id = p_order_id
    and coalesce(invoice_qty, fulfilled_qty) > 0;

  select coalesce(sum(hst_amount), 0)
  into v_invoice_hst_total
  from public.order_items
  where order_id = p_order_id
    and coalesce(invoice_qty, fulfilled_qty) > 0;

  update public.orders
  set status = 'invoiced',
      invoice_number = btrim(p_invoice_number),
      invoice_total = v_invoice_total,
      invoice_hst_total = v_invoice_hst_total,
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

revoke all on function public.modhanios_create_invoice(text, uuid, text, jsonb, timestamptz, text, text, text, text, text, text, text) from public;
grant execute on function public.modhanios_create_invoice(text, uuid, text, jsonb, timestamptz, text, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- modhanios_update_invoice — recompute HST snapshot after edits.
-- (Full re-create of the function from 202605280001 with HST added.)
-- ---------------------------------------------------------------------------
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
  v_new_hst_total numeric(12, 2);
  v_line jsonb;
  v_order_item public.order_items%rowtype;
  v_order_item_id text;
  v_next_qty numeric(12, 2);
  v_next_override_price numeric(12, 2);
  v_next_override_reason text;
  v_next_discount numeric(12, 2);
  v_next_discount_reason text;
  v_next_subtotal numeric(12, 2);
  v_requires_qb_update boolean;
  v_removed_qty numeric(12, 2);
  v_return_qty numeric(12, 2);
  v_trim_qty numeric(12, 2);
  v_assignment record;
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

  if v_order.status not in ('invoiced', 'packed', 'shipped') or v_order.invoice_number is null then
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
    v_next_discount := coalesce(nullif(v_line ->> 'discount', '')::numeric, 0);
    v_next_discount_reason := nullif(btrim(coalesce(v_line ->> 'discountReason', '')), '');

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

    if v_next_discount < 0 then
      raise exception 'Discount cannot be negative for line %.', v_order_item_id;
    end if;

    if v_next_discount > 0 and v_next_discount_reason is null then
      raise exception 'Discount reason is required for line %.', v_order_item_id;
    end if;

    v_next_subtotal := v_next_qty * coalesce(v_next_override_price, v_order_item.client_price, v_order_item.base_price);
    if v_next_discount > v_next_subtotal then
      raise exception 'Discount cannot exceed the line subtotal for line %.', v_order_item_id;
    end if;

    v_removed_qty := greatest(v_order_item.fulfilled_qty - v_next_qty, 0);
    v_return_qty := v_removed_qty;

    if v_return_qty > 0 then
      for v_assignment in
        select *
        from public.batch_assignments
        where order_item_id = v_order_item_id
        order by id desc
      loop
        exit when v_return_qty <= 0;

        v_trim_qty := least(v_assignment.qty, v_return_qty);

        update public.batches
        set qty_remaining = least(qty_produced, qty_remaining + v_trim_qty),
            status = case when least(qty_produced, qty_remaining + v_trim_qty) > 0 then 'active' else 'cleared' end,
            updated_at = timezone('utc', now())
        where id = v_assignment.batch_id;

        if v_assignment.qty <= v_trim_qty then
          delete from public.batch_assignments where id = v_assignment.id;
        else
          update public.batch_assignments
          set qty = qty - v_trim_qty
          where id = v_assignment.id;
        end if;

        v_return_qty := v_return_qty - v_trim_qty;
      end loop;

      if v_return_qty > 0 then
        raise exception 'Could not return all removed lot quantity for line %.', v_order_item_id;
      end if;
    end if;

    update public.order_items
    set fulfilled_qty = v_next_qty,
        invoice_qty = v_next_qty,
        declined_qty = coalesce(declined_qty, 0) + v_removed_qty,
        override_price = v_next_override_price,
        override_reason = v_next_override_reason,
        discount_amount = v_next_discount,
        discount_reason = case when v_next_discount > 0 then v_next_discount_reason else null end
    where id = v_order_item_id;
  end loop;

  if not exists (
    select 1 from public.order_items
    where order_id = p_order_id
      and coalesce(invoice_qty, fulfilled_qty) > 0
  ) then
    raise exception 'Invoice must keep at least one billed line.';
  end if;

  -- Re-snapshot HST per billed line from the product flag.
  update public.order_items oi
  set hst_applicable = coalesce(p.hst_applicable, false),
      hst_amount = case
        when coalesce(p.hst_applicable, false)
        then round(greatest(
          coalesce(oi.invoice_qty, oi.fulfilled_qty) * coalesce(oi.override_price, oi.client_price, oi.base_price)
            - coalesce(oi.discount_amount, 0),
          0
        ) * 0.13, 2)
        else 0
      end
  from public.products p
  where oi.product_id = p.id
    and oi.order_id = p_order_id;

  select coalesce(sum(greatest(
    coalesce(invoice_qty, fulfilled_qty) * coalesce(override_price, client_price, base_price)
      - coalesce(discount_amount, 0),
    0
  )), 0)
  into v_new_total
  from public.order_items
  where order_id = p_order_id
    and coalesce(invoice_qty, fulfilled_qty) > 0;

  select coalesce(sum(hst_amount), 0)
  into v_new_hst_total
  from public.order_items
  where order_id = p_order_id
    and coalesce(invoice_qty, fulfilled_qty) > 0;

  update public.orders
  set invoice_total = v_new_total,
      invoice_hst_total = v_new_hst_total,
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
    jsonb_build_object('lines', p_lines, 'shipTo', coalesce(p_ship_to, '{}'::jsonb), 'fulfillmentAdjusted', true),
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
    format('Invoice %s updated and fulfilment adjusted: %s', v_order.invoice_number, btrim(p_reason)),
    coalesce(v_previous_total::text, ''),
    v_new_total::text
  );
end;
$$;

revoke all on function public.modhanios_update_invoice(text, uuid, jsonb, text, jsonb) from public;
grant execute on function public.modhanios_update_invoice(text, uuid, jsonb, text, jsonb) to authenticated;
