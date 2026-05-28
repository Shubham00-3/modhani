drop function if exists public.modhanios_update_invoice(text, uuid, jsonb, text, jsonb);

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
