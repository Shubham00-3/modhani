-- Editable invoices before QuickBooks sync.
-- This supports last-minute invoice quantity/rate corrections while blocking already-pushed/syncing QB invoices.

alter table public.order_items
  add column if not exists invoice_qty numeric(12, 2);

update public.order_items oi
set invoice_qty = oi.fulfilled_qty
from public.orders o
where o.id = oi.order_id
  and o.invoice_number is not null
  and oi.invoice_qty is null;

create table if not exists public.invoice_revisions (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders (id) on delete cascade,
  revised_by uuid references public.profiles (user_id) on delete set null,
  reason text not null,
  previous_total numeric(12, 2),
  new_total numeric(12, 2) not null,
  lines jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.invoice_revisions
  add column if not exists revised_by uuid references public.profiles (user_id) on delete set null,
  add column if not exists reason text,
  add column if not exists previous_total numeric(12, 2),
  add column if not exists new_total numeric(12, 2),
  add column if not exists next_total numeric(12, 2),
  add column if not exists lines jsonb,
  add column if not exists edited_by_name text,
  add column if not exists created_at timestamptz not null default timezone('utc', now());

update public.invoice_revisions
set edited_by_name = 'Unknown staff user'
where edited_by_name is null;

update public.invoice_revisions
set next_total = coalesce(next_total, new_total, previous_total, 0)
where next_total is null;

alter table public.invoice_revisions
  alter column edited_by_name drop not null,
  alter column next_total drop not null;

alter table public.invoice_revisions enable row level security;

drop policy if exists "invoice_revisions_select_staff" on public.invoice_revisions;
create policy "invoice_revisions_select_staff" on public.invoice_revisions
for select to authenticated
using (exists (select 1 from public.profiles where profiles.user_id = auth.uid()));

create index if not exists idx_invoice_revisions_order_created
on public.invoice_revisions (order_id, created_at desc);

create or replace function public.modhanios_update_invoice(
  p_order_id text,
  p_user_id uuid,
  p_lines jsonb,
  p_reason text
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
begin
  select * into v_profile
  from public.profiles
  where user_id = p_user_id;

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

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status <> 'invoiced' or v_order.invoice_number is null then
    raise exception 'Only created invoices can be edited.';
  end if;

  if v_order.shipped_at is not null then
    raise exception 'Shipped invoices cannot be edited in this workflow.';
  end if;

  if v_order.qb_invoice_number is not null or v_order.qb_sync_status in ('pushed', 'syncing') then
    raise exception 'This invoice has already been sent to QuickBooks.';
  end if;

  if exists (
    select 1
    from public.quickbooks_sync_jobs
    where order_id = p_order_id
      and job_type = 'invoice'
      and status in ('pending', 'syncing', 'pushed')
  ) then
    raise exception 'Remove or finish the existing QuickBooks sync job before editing this invoice.';
  end if;

  v_previous_total := v_order.invoice_total;

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
    set
      invoice_qty = v_next_qty,
      override_price = v_next_override_price,
      override_reason = v_next_override_reason
    where id = v_order_item_id;
  end loop;

  if not exists (
    select 1
    from public.order_items
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
  set
    invoice_total = v_new_total,
    qb_sync_status = case when qb_sync_status = 'failed' then null else qb_sync_status end
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
    p_lines,
    v_profile.full_name
  );

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

revoke all on function public.modhanios_update_invoice(text, uuid, jsonb, text) from public;
grant execute on function public.modhanios_update_invoice(text, uuid, jsonb, text) to authenticated;
