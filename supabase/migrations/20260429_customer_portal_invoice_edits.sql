create or replace function public.modhanios_is_staff(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = p_user_id
  );
$$;

create table if not exists public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users (id) on delete cascade,
  client_id text not null references public.clients (id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customer_contacts_status_check check (status in ('active', 'disabled'))
);

create table if not exists public.customer_contact_locations (
  contact_id uuid not null references public.customer_contacts (id) on delete cascade,
  location_id text not null references public.locations (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (contact_id, location_id)
);

alter table public.orders
  add column if not exists portal_contact_id uuid references public.customer_contacts (id) on delete set null,
  add column if not exists requested_delivery_date date,
  add column if not exists portal_notes text,
  add column if not exists qb_txn_id text,
  add column if not exists qb_edit_sequence text;

alter table public.order_items
  add column if not exists invoice_qty numeric(12, 2),
  add column if not exists qb_txn_line_id text;

update public.order_items
set invoice_qty = fulfilled_qty
where invoice_qty is null
  and fulfilled_qty > 0;

create table if not exists public.invoice_revisions (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders (id) on delete cascade,
  reason text not null,
  edited_by uuid references public.profiles (user_id) on delete set null,
  edited_by_name text not null,
  previous_total numeric(12, 2),
  next_total numeric(12, 2) not null,
  previous_lines jsonb not null default '[]'::jsonb,
  next_lines jsonb not null default '[]'::jsonb,
  qb_job_id uuid references public.quickbooks_sync_jobs (id) on delete set null,
  qb_update_status text not null default 'not_required',
  created_at timestamptz not null default timezone('utc', now()),
  constraint invoice_revisions_qb_status_check check (qb_update_status in ('not_required', 'pending', 'pushed', 'failed'))
);

alter table public.quickbooks_sync_jobs
  add column if not exists entity_type text,
  add column if not exists entity_id text;

alter table public.quickbooks_sync_jobs
  drop constraint if exists quickbooks_sync_jobs_job_type_check;

alter table public.quickbooks_sync_jobs
  add constraint quickbooks_sync_jobs_job_type_check
  check (job_type in ('invoice', 'invoice_mod', 'customer', 'item'));

create unique index if not exists idx_qb_jobs_one_open_invoice_mod_per_order
on public.quickbooks_sync_jobs (order_id, job_type)
where status in ('pending', 'syncing', 'failed')
  and job_type = 'invoice_mod';

create index if not exists idx_customer_contacts_user_id on public.customer_contacts (user_id);
create index if not exists idx_customer_contacts_client_id on public.customer_contacts (client_id);
create index if not exists idx_invoice_revisions_order_id on public.invoice_revisions (order_id);
create index if not exists idx_orders_portal_contact_id on public.orders (portal_contact_id);

drop trigger if exists set_customer_contacts_updated_at on public.customer_contacts;
create trigger set_customer_contacts_updated_at
before update on public.customer_contacts
for each row execute function public.set_updated_at();

alter table public.customer_contacts enable row level security;
alter table public.customer_contact_locations enable row level security;
alter table public.invoice_revisions enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_select_staff_or_self" on public.profiles;
create policy "profiles_select_staff_or_self" on public.profiles
for select to authenticated
using (public.modhanios_is_staff(auth.uid()) or user_id = auth.uid());

drop policy if exists "batches_all_authenticated" on public.batches;
drop policy if exists "batches_staff_all" on public.batches;
create policy "batches_staff_all" on public.batches
for all to authenticated
using (public.modhanios_is_staff(auth.uid()))
with check (public.modhanios_is_staff(auth.uid()));

drop policy if exists "batch_assignments_all_authenticated" on public.batch_assignments;
drop policy if exists "batch_assignments_staff_all" on public.batch_assignments;
create policy "batch_assignments_staff_all" on public.batch_assignments
for all to authenticated
using (public.modhanios_is_staff(auth.uid()))
with check (public.modhanios_is_staff(auth.uid()));

drop policy if exists "quickbooks_settings_select_authenticated" on public.quickbooks_settings;
drop policy if exists "quickbooks_settings_select_staff" on public.quickbooks_settings;
create policy "quickbooks_settings_select_staff" on public.quickbooks_settings
for select to authenticated
using (public.modhanios_is_staff(auth.uid()));

drop policy if exists "quickbooks_sync_jobs_select_authenticated" on public.quickbooks_sync_jobs;
drop policy if exists "quickbooks_sync_jobs_select_staff" on public.quickbooks_sync_jobs;
create policy "quickbooks_sync_jobs_select_staff" on public.quickbooks_sync_jobs
for select to authenticated
using (public.modhanios_is_staff(auth.uid()));

drop policy if exists "audit_events_select_authenticated" on public.audit_events;
drop policy if exists "audit_events_select_staff" on public.audit_events;
create policy "audit_events_select_staff" on public.audit_events
for select to authenticated
using (public.modhanios_is_staff(auth.uid()));

drop policy if exists "customer_contacts_select_staff_or_own" on public.customer_contacts;
create policy "customer_contacts_select_staff_or_own" on public.customer_contacts
for select to authenticated
using (public.modhanios_is_staff(auth.uid()) or user_id = auth.uid());

drop policy if exists "customer_contacts_staff_all" on public.customer_contacts;
create policy "customer_contacts_staff_all" on public.customer_contacts
for all to authenticated
using (public.modhanios_is_staff(auth.uid()))
with check (public.modhanios_is_staff(auth.uid()));

drop policy if exists "customer_contact_locations_select_staff_or_own" on public.customer_contact_locations;
create policy "customer_contact_locations_select_staff_or_own" on public.customer_contact_locations
for select to authenticated
using (
  public.modhanios_is_staff(auth.uid()) or exists (
    select 1
    from public.customer_contacts cc
    where cc.id = customer_contact_locations.contact_id
      and cc.user_id = auth.uid()
      and cc.status = 'active'
  )
);

drop policy if exists "customer_contact_locations_staff_all" on public.customer_contact_locations;
create policy "customer_contact_locations_staff_all" on public.customer_contact_locations
for all to authenticated
using (public.modhanios_is_staff(auth.uid()))
with check (public.modhanios_is_staff(auth.uid()));

drop policy if exists "clients_select_authenticated" on public.clients;
drop policy if exists "clients_all_authenticated" on public.clients;
drop policy if exists "clients_select_staff_or_customer" on public.clients;
drop policy if exists "clients_staff_all" on public.clients;
create policy "clients_select_staff_or_customer" on public.clients
for select to authenticated
using (
  public.modhanios_is_staff(auth.uid()) or exists (
    select 1
    from public.customer_contacts cc
    where cc.client_id = clients.id
      and cc.user_id = auth.uid()
      and cc.status = 'active'
  )
);
create policy "clients_staff_all" on public.clients
for all to authenticated
using (public.modhanios_is_staff(auth.uid()))
with check (public.modhanios_is_staff(auth.uid()));

drop policy if exists "locations_select_authenticated" on public.locations;
drop policy if exists "locations_all_authenticated" on public.locations;
drop policy if exists "locations_select_staff_or_customer" on public.locations;
drop policy if exists "locations_staff_all" on public.locations;
create policy "locations_select_staff_or_customer" on public.locations
for select to authenticated
using (
  public.modhanios_is_staff(auth.uid()) or exists (
    select 1
    from public.customer_contact_locations ccl
    join public.customer_contacts cc
      on cc.id = ccl.contact_id
    where ccl.location_id = locations.id
      and cc.user_id = auth.uid()
      and cc.status = 'active'
  )
);
create policy "locations_staff_all" on public.locations
for all to authenticated
using (public.modhanios_is_staff(auth.uid()))
with check (public.modhanios_is_staff(auth.uid()));

drop policy if exists "products_select_authenticated" on public.products;
drop policy if exists "products_all_authenticated" on public.products;
drop policy if exists "products_select_staff_or_customer" on public.products;
drop policy if exists "products_staff_all" on public.products;
create policy "products_select_staff_or_customer" on public.products
for select to authenticated
using (
  public.modhanios_is_staff(auth.uid()) or exists (
    select 1
    from public.client_product_prices cpp
    join public.customer_contacts cc
      on cc.client_id = cpp.client_id
    where cpp.product_id = products.id
      and cc.user_id = auth.uid()
      and cc.status = 'active'
  )
);
create policy "products_staff_all" on public.products
for all to authenticated
using (public.modhanios_is_staff(auth.uid()))
with check (public.modhanios_is_staff(auth.uid()));

drop policy if exists "client_product_prices_select_authenticated" on public.client_product_prices;
drop policy if exists "client_product_prices_all_authenticated" on public.client_product_prices;
drop policy if exists "client_product_prices_select_staff_or_customer" on public.client_product_prices;
drop policy if exists "client_product_prices_staff_all" on public.client_product_prices;
create policy "client_product_prices_select_staff_or_customer" on public.client_product_prices
for select to authenticated
using (
  public.modhanios_is_staff(auth.uid()) or exists (
    select 1
    from public.customer_contacts cc
    where cc.client_id = client_product_prices.client_id
      and cc.user_id = auth.uid()
      and cc.status = 'active'
  )
);
create policy "client_product_prices_staff_all" on public.client_product_prices
for all to authenticated
using (public.modhanios_is_staff(auth.uid()))
with check (public.modhanios_is_staff(auth.uid()));

drop policy if exists "orders_all_authenticated" on public.orders;
drop policy if exists "orders_select_staff_or_customer" on public.orders;
drop policy if exists "orders_staff_all" on public.orders;
create policy "orders_select_staff_or_customer" on public.orders
for select to authenticated
using (
  public.modhanios_is_staff(auth.uid()) or exists (
    select 1
    from public.customer_contacts cc
    where cc.client_id = orders.client_id
      and cc.user_id = auth.uid()
      and cc.status = 'active'
  )
);
create policy "orders_staff_all" on public.orders
for all to authenticated
using (public.modhanios_is_staff(auth.uid()))
with check (public.modhanios_is_staff(auth.uid()));

drop policy if exists "order_items_all_authenticated" on public.order_items;
drop policy if exists "order_items_select_staff_or_customer" on public.order_items;
drop policy if exists "order_items_staff_all" on public.order_items;
create policy "order_items_select_staff_or_customer" on public.order_items
for select to authenticated
using (
  public.modhanios_is_staff(auth.uid()) or exists (
    select 1
    from public.orders o
    join public.customer_contacts cc
      on cc.client_id = o.client_id
    where o.id = order_items.order_id
      and cc.user_id = auth.uid()
      and cc.status = 'active'
  )
);
create policy "order_items_staff_all" on public.order_items
for all to authenticated
using (public.modhanios_is_staff(auth.uid()))
with check (public.modhanios_is_staff(auth.uid()));

drop policy if exists "invoice_revisions_select_staff" on public.invoice_revisions;
create policy "invoice_revisions_select_staff" on public.invoice_revisions
for select to authenticated
using (public.modhanios_is_staff(auth.uid()));

create or replace function public.modhanios_create_portal_order(
  p_location_id text,
  p_requested_delivery_date date,
  p_notes text,
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
begin
  select * into v_contact
  from public.customer_contacts
  where user_id = auth.uid()
    and status = 'active';

  if not found then
    raise exception 'No active customer portal contact is configured for this login.';
  end if;

  select * into v_location
  from public.locations
  where id = p_location_id
    and client_id = v_contact.client_id;

  if not found then
    raise exception 'Selected location does not belong to this customer.';
  end if;

  if not exists (
    select 1
    from public.customer_contact_locations ccl
    where ccl.contact_id = v_contact.id
      and ccl.location_id = p_location_id
  ) then
    raise exception 'This contact cannot place orders for the selected location.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one order line is required.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x("productId" text, quantity numeric)
    where coalesce(x."productId", '') = ''
       or x.quantity <= 0
       or x.quantity <> trunc(x.quantity)
  ) then
    raise exception 'Portal order lines require a product and whole-number positive quantity.';
  end if;

  if exists (
    select 1
    from (
      select x."productId", count(*) as line_count
      from jsonb_to_recordset(p_items) as x("productId" text, quantity numeric)
      group by x."productId"
    ) duplicates
    where duplicates.line_count > 1
  ) then
    raise exception 'Combine duplicate products into one line.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x("productId" text, quantity numeric)
    left join public.client_product_prices cpp
      on cpp.client_id = v_contact.client_id
     and cpp.product_id = x."productId"
    where cpp.id is null
  ) then
    raise exception 'One or more products are not priced for this customer.';
  end if;

  perform pg_advisory_xact_lock(hashtext('modhanios_order_number'));

  select coalesce(max(order_number), 1049) + 1
  into v_order_number
  from public.orders;

  v_order_id := concat('order-portal-', gen_random_uuid()::text);

  insert into public.orders (
    id,
    order_number,
    client_id,
    location_id,
    source,
    status,
    portal_contact_id,
    requested_delivery_date,
    portal_notes,
    created_at
  )
  values (
    v_order_id,
    v_order_number,
    v_contact.client_id,
    p_location_id,
    'portal',
    'pending',
    v_contact.id,
    p_requested_delivery_date,
    nullif(btrim(p_notes), ''),
    timezone('utc', now())
  );

  insert into public.order_items (
    id,
    order_id,
    product_id,
    quantity,
    fulfilled_qty,
    invoice_qty,
    declined_qty,
    base_price,
    client_price
  )
  select
    concat('oi-', v_order_number::text, '-', row_number() over (order by x."productId")),
    v_order_id,
    x."productId",
    x.quantity,
    0,
    null,
    0,
    p.base_catalogue_price,
    cpp.price
  from jsonb_to_recordset(p_items) as x("productId" text, quantity numeric)
  join public.products p
    on p.id = x."productId"
  join public.client_product_prices cpp
    on cpp.client_id = v_contact.client_id
   and cpp.product_id = x."productId";

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
    'portal_order_received',
    v_order_id,
    v_contact.client_id,
    null,
    v_contact.full_name,
    format('Portal order #%s submitted for %s', v_order_number, v_location.name),
    null,
    concat('Order #', v_order_number)
  );

  return v_order_id;
end;
$$;

create or replace function public.modhanios_edit_invoice(
  p_order_id text,
  p_user_id uuid,
  p_lines jsonb,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_order public.orders%rowtype;
  v_previous_total numeric(12, 2);
  v_next_total numeric(12, 2);
  v_previous_lines jsonb;
  v_next_lines jsonb;
  v_revision_id uuid;
  v_job_id uuid;
  v_override_count integer;
begin
  select * into v_profile
  from public.profiles
  where user_id = p_user_id;

  if not found then
    raise exception 'User profile not found.';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'Invoice edit reason is required.';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Invoice edit lines are required.';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.invoice_number is null then
    raise exception 'Create an invoice before editing it.';
  end if;

  if v_order.shipped_at is not null or v_order.status = 'shipped' then
    raise exception 'Shipped invoices cannot be edited in this workflow.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as x("orderItemId" text, "invoiceQty" numeric, "overridePrice" numeric, "overrideReason" text)
    where coalesce(x."orderItemId", '') = ''
       or x."invoiceQty" <= 0
       or x."invoiceQty" <> trunc(x."invoiceQty")
  ) then
    raise exception 'Invoice lines require item IDs and whole-number positive quantities.';
  end if;

  if exists (
    select 1
    from (
      select x."orderItemId", count(*) as line_count
      from jsonb_to_recordset(p_lines) as x("orderItemId" text, "invoiceQty" numeric, "overridePrice" numeric, "overrideReason" text)
      group by x."orderItemId"
    ) duplicates
    where duplicates.line_count > 1
  ) then
    raise exception 'Duplicate invoice edit lines are not allowed.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as x("orderItemId" text, "invoiceQty" numeric, "overridePrice" numeric, "overrideReason" text)
    left join public.order_items oi
      on oi.id = x."orderItemId"
     and oi.order_id = p_order_id
    where oi.id is null
       or x."invoiceQty" > oi.fulfilled_qty
  ) then
    raise exception 'Invoice quantity cannot exceed fulfilled quantity.';
  end if;

  if (
    select count(*)
    from jsonb_to_recordset(p_lines) as x("orderItemId" text, "invoiceQty" numeric, "overridePrice" numeric, "overrideReason" text)
  ) <> (
    select count(*)
    from public.order_items
    where order_id = p_order_id
      and fulfilled_qty > 0
  ) then
    raise exception 'All invoice lines must be included in the edit.';
  end if;

  select count(*)
  into v_override_count
  from jsonb_to_recordset(p_lines) as x("orderItemId" text, "invoiceQty" numeric, "overridePrice" numeric, "overrideReason" text)
  where x."overridePrice" is not null;

  if v_override_count > 0 and not v_profile.override_prices then
    raise exception 'This user cannot override prices.';
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'orderItemId', oi.id,
          'productId', oi.product_id,
          'invoiceQty', coalesce(oi.invoice_qty, oi.fulfilled_qty),
          'price', coalesce(oi.override_price, oi.client_price, oi.base_price)
        )
        order by oi.id
      ),
      '[]'::jsonb
    )
  into v_previous_lines
  from public.order_items oi
  where oi.order_id = p_order_id
    and oi.fulfilled_qty > 0;

  v_previous_total := v_order.invoice_total;

  with edits as (
    select
      x."orderItemId" as order_item_id,
      x."invoiceQty" as invoice_qty,
      x."overridePrice" as override_price,
      nullif(btrim(x."overrideReason"), '') as override_reason
    from jsonb_to_recordset(p_lines) as x("orderItemId" text, "invoiceQty" numeric, "overridePrice" numeric, "overrideReason" text)
  )
  update public.order_items oi
  set invoice_qty = e.invoice_qty,
      override_price = e.override_price,
      override_reason = e.override_reason
  from edits e
  where oi.id = e.order_item_id
    and oi.order_id = p_order_id;

  select coalesce(sum(coalesce(invoice_qty, fulfilled_qty) * coalesce(override_price, client_price, base_price)), 0)
  into v_next_total
  from public.order_items
  where order_id = p_order_id
    and fulfilled_qty > 0;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'orderItemId', oi.id,
          'productId', oi.product_id,
          'invoiceQty', coalesce(oi.invoice_qty, oi.fulfilled_qty),
          'price', coalesce(oi.override_price, oi.client_price, oi.base_price)
        )
        order by oi.id
      ),
      '[]'::jsonb
    )
  into v_next_lines
  from public.order_items oi
  where oi.order_id = p_order_id
    and oi.fulfilled_qty > 0;

  update public.orders
  set invoice_total = v_next_total
  where id = p_order_id;

  insert into public.invoice_revisions (
    order_id,
    reason,
    edited_by,
    edited_by_name,
    previous_total,
    next_total,
    previous_lines,
    next_lines
  )
  values (
    p_order_id,
    btrim(p_reason),
    p_user_id,
    v_profile.full_name,
    v_previous_total,
    v_next_total,
    v_previous_lines,
    v_next_lines
  )
  returning id into v_revision_id;

  if v_order.qb_sync_status = 'pushed' then
    if nullif(v_order.qb_txn_id, '') is null or nullif(v_order.qb_edit_sequence, '') is null then
      raise exception 'QuickBooks transaction IDs are required before editing a pushed invoice.';
    end if;

    if exists (
      select 1
      from public.order_items
      where order_id = p_order_id
        and fulfilled_qty > 0
        and nullif(qb_txn_line_id, '') is null
    ) then
      raise exception 'QuickBooks line IDs are required before editing a pushed invoice.';
    end if;

    insert into public.quickbooks_sync_jobs (
      order_id,
      job_type,
      status,
      entity_type,
      entity_id,
      created_by
    )
    values (
      p_order_id,
      'invoice_mod',
      'pending',
      'invoice_revision',
      v_revision_id::text,
      p_user_id
    )
    on conflict (order_id, job_type) where status in ('pending', 'syncing', 'failed') and job_type = 'invoice_mod'
    do update set
      status = 'pending',
      entity_type = 'invoice_revision',
      entity_id = excluded.entity_id,
      error_message = null,
      locked_by_ticket = null,
      locked_at = null,
      updated_at = timezone('utc', now())
    returning id into v_job_id;

    update public.invoice_revisions
    set qb_job_id = v_job_id,
        qb_update_status = 'pending'
    where id = v_revision_id;

    update public.orders
    set qb_sync_status = 'pending_update'
    where id = p_order_id;
  end if;

  perform public.modhanios_insert_audit(
    'invoice_edited',
    v_order.id,
    v_order.client_id,
    p_user_id,
    v_profile.full_name,
    format('Invoice %s edited. Reason: %s', v_order.invoice_number, btrim(p_reason)),
    concat('$', to_char(coalesce(v_previous_total, 0), 'FM999999990.00')),
    concat('$', to_char(v_next_total, 'FM999999990.00'))
  );

  return v_revision_id;
end;
$$;

revoke all on function public.modhanios_create_portal_order(text, date, text, jsonb) from public;
revoke all on function public.modhanios_edit_invoice(text, uuid, jsonb, text) from public;
grant execute on function public.modhanios_create_portal_order(text, date, text, jsonb) to authenticated;
grant execute on function public.modhanios_edit_invoice(text, uuid, jsonb, text) to authenticated;
