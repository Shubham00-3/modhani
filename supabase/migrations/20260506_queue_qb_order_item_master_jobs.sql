-- Queue QuickBooks master-data dependencies before invoice sync.
-- The real Modhani catalogue/customer import means invoices can reference
-- customers and items that do not exist yet in a fresh QuickBooks company file.
-- This queues the exact order location as the QuickBooks customer, then every
-- invoiced product item, then the invoice.

alter table public.quickbooks_sync_jobs
  alter column order_id drop not null,
  add column if not exists entity_type text,
  add column if not exists entity_id text;

alter table public.quickbooks_sync_jobs
  drop constraint if exists quickbooks_sync_jobs_job_type_check;

alter table public.quickbooks_sync_jobs
  add constraint quickbooks_sync_jobs_job_type_check
  check (job_type in ('invoice', 'customer', 'item'));

create unique index if not exists idx_qb_jobs_one_open_master_per_entity
on public.quickbooks_sync_jobs (job_type, entity_id)
where status in ('pending', 'syncing', 'failed')
  and job_type in ('customer', 'item');

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

  if v_order.status not in ('fulfilled', 'invoiced', 'shipped') then
    raise exception 'Only fulfilled, invoiced, or shipped orders can be queued for QuickBooks.';
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
begin
  select * into v_profile
  from public.profiles
  where user_id = p_user_id;

  if not found then
    raise exception 'User profile not found.';
  end if;

  perform public.modhanios_require_qb_invoice_ready(p_order_id);

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  insert into public.quickbooks_sync_jobs (
    order_id,
    job_type,
    status,
    entity_type,
    entity_id,
    created_by,
    error_message,
    locked_by_ticket,
    locked_at
  )
  select
    null::text,
    'customer'::text,
    'pending'::text,
    'location'::text,
    v_order.location_id,
    p_user_id,
    null::text,
    null::text,
    null::timestamptz
  where not exists (
    select 1
    from public.quickbooks_sync_jobs existing
    where existing.job_type = 'customer'
      and existing.entity_id = v_order.location_id
      and existing.status = 'pushed'
  )
  on conflict (job_type, entity_id) where status in ('pending', 'syncing', 'failed') and job_type in ('customer', 'item')
  do update set
    status = 'pending',
    error_message = null,
    locked_by_ticket = null,
    locked_at = null::timestamptz,
    updated_at = timezone('utc', now());

  insert into public.quickbooks_sync_jobs (
    order_id,
    job_type,
    status,
    entity_type,
    entity_id,
    created_by,
    error_message,
    locked_by_ticket,
    locked_at
  )
  select distinct
    null::text,
    'item'::text,
    'pending'::text,
    'product'::text,
    oi.product_id,
    p_user_id,
    null::text,
    null::text,
    null::timestamptz
  from public.order_items oi
  join public.products p
    on p.id = oi.product_id
  where oi.order_id = p_order_id
    and coalesce(oi.invoice_qty, oi.fulfilled_qty, 0) > 0
    and nullif(btrim(coalesce(p.qb_item_name, concat_ws(' ', p.name, p.unit_size))), '') is not null
    and not exists (
      select 1
      from public.quickbooks_sync_jobs existing
      where existing.job_type = 'item'
        and existing.entity_id = oi.product_id
        and existing.status = 'pushed'
    )
  on conflict (job_type, entity_id) where status in ('pending', 'syncing', 'failed') and job_type in ('customer', 'item')
  do update set
    status = 'pending',
    error_message = null,
    locked_by_ticket = null,
    locked_at = null::timestamptz,
    updated_at = timezone('utc', now());

  insert into public.quickbooks_sync_jobs (order_id, job_type, status, created_by)
  values (p_order_id, 'invoice', 'pending', p_user_id)
  on conflict (order_id, job_type) where status in ('pending', 'syncing', 'failed')
  do update set
    status = 'pending',
    error_message = null,
    locked_by_ticket = null,
    locked_at = null::timestamptz,
    updated_at = timezone('utc', now())
  returning id into v_job_id;

  update public.orders
  set qb_sync_status = 'pending'
  where id = p_order_id;

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

revoke all on function public.modhanios_require_qb_invoice_ready(text) from public;
revoke all on function public.modhanios_require_qb_invoice_ready(text) from anon;
revoke all on function public.modhanios_queue_qb_invoice(text, uuid) from public;
revoke all on function public.modhanios_queue_qb_invoice(text, uuid) from anon;
grant execute on function public.modhanios_queue_qb_invoice(text, uuid) to authenticated;
