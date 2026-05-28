-- Make all products available to approved customer portal users.
-- Client-specific prices still override product base catalogue prices when present.

update public.client_product_prices
set is_active = true
where is_active = false;

drop policy if exists "products_select_staff_or_customer_catalogue" on public.products;
create policy "products_select_staff_or_customer_all" on public.products
for select to authenticated
using (
  public.modhanios_customer_portal_is_staff()
  or public.modhanios_active_customer_client_id() is not null
);

drop policy if exists "client_product_prices_select_staff_or_customer_catalogue" on public.client_product_prices;
create policy "client_product_prices_select_staff_or_customer_client" on public.client_product_prices
for select to authenticated
using (
  public.modhanios_customer_portal_is_staff()
  or client_id = public.modhanios_active_customer_client_id()
);

create or replace function public.modhanios_submit_customer_order(
  p_client_id text,
  p_location_id text,
  p_items jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.customer_contacts%rowtype;
  v_location public.locations%rowtype;
  v_order_id text;
  v_order_number integer;
  v_created_at timestamptz := timezone('utc', now());
  v_item jsonb;
  v_product public.products%rowtype;
  v_price numeric(12, 2);
  v_quantity numeric(12, 2);
  v_index integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select * into v_contact
  from public.customer_contacts
  where user_id = auth.uid()
    and status = 'active'
    and client_id = p_client_id;

  if not found then
    raise exception 'This customer account is not approved for that company.';
  end if;

  select * into v_location
  from public.locations
  where id = p_location_id
    and client_id = p_client_id;

  if not found then
    raise exception 'Select a valid company location.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one product is required.';
  end if;

  v_order_id := concat('portal-order-', extract(epoch from v_created_at)::bigint, '-', substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  select coalesce(max(order_number), 1000) + 1 into v_order_number from public.orders;

  insert into public.orders (
    id,
    order_number,
    client_id,
    location_id,
    source,
    status,
    created_at
  )
  values (
    v_order_id,
    v_order_number,
    p_client_id,
    p_location_id,
    'portal',
    'pending',
    v_created_at
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_index := v_index + 1;
    v_quantity := nullif(v_item->>'quantity', '')::numeric;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Product quantities must be greater than zero.';
    end if;

    select * into v_product
    from public.products
    where id = v_item->>'productId';

    if not found then
      raise exception 'One selected product no longer exists.';
    end if;

    select coalesce(
      (
        select price
        from public.client_product_prices
        where client_id = p_client_id
          and product_id = v_product.id
        limit 1
      ),
      v_product.base_catalogue_price
    )
    into v_price;

    insert into public.order_items (
      id,
      order_id,
      product_id,
      quantity,
      fulfilled_qty,
      base_price,
      client_price
    )
    values (
      concat(v_order_id, '-item-', v_index),
      v_order_id,
      v_product.id,
      v_quantity,
      0,
      v_product.base_catalogue_price,
      v_price
    );
  end loop;

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
    concat('audit-', replace(gen_random_uuid()::text, '-', '')),
    v_created_at,
    'order_received',
    v_order_id,
    p_client_id,
    null,
    v_contact.full_name,
    format('Portal order created by %s for %s', v_contact.full_name, v_location.name),
    null,
    format('Order #%s', v_order_number)
  );

  return v_order_id;
end;
$$;

revoke all on function public.modhanios_submit_customer_order(text, text, jsonb) from public;
grant execute on function public.modhanios_submit_customer_order(text, text, jsonb) to authenticated;
