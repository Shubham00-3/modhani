-- Driver delivery photos.
--
-- Drivers can attach up to 5 photos when saving POD — proof, damage,
-- whatever the driver wants to record. Photos are optional; signature is
-- still mandatory.

-- ---------------------------------------------------------------------------
-- 1. Storage bucket + policies (mirror product-images setup)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('delivery-photos', 'delivery-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "Delivery photos are publicly readable" on storage.objects;
drop policy if exists "Authenticated users can upload delivery photos" on storage.objects;
drop policy if exists "Authenticated users can update delivery photos" on storage.objects;
drop policy if exists "Authenticated users can delete delivery photos" on storage.objects;

create policy "Delivery photos are publicly readable"
on storage.objects
for select
using (bucket_id = 'delivery-photos');

create policy "Authenticated users can upload delivery photos"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'delivery-photos');

create policy "Authenticated users can update delivery photos"
on storage.objects
for update
to authenticated
using (bucket_id = 'delivery-photos')
with check (bucket_id = 'delivery-photos');

create policy "Authenticated users can delete delivery photos"
on storage.objects
for delete
to authenticated
using (bucket_id = 'delivery-photos');

-- ---------------------------------------------------------------------------
-- 2. Order columns: arrays of URLs + storage paths
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists pod_photo_urls text[] not null default '{}',
  add column if not exists pod_photo_paths text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- 3. Updated POD RPC: accepts photo URL/path arrays, max 5 each.
-- ---------------------------------------------------------------------------
drop function if exists public.modhanios_complete_delivery_pod(text, uuid, text, text, text, timestamptz, bigint, text, text);

create or replace function public.modhanios_complete_delivery_pod(
  p_order_id text,
  p_user_id uuid,
  p_signed_by text,
  p_signature_data_url text,
  p_notes text default null,
  p_signed_at timestamptz default null,
  p_signed_at_unix_ms bigint default null,
  p_signed_at_local text default null,
  p_signed_timezone text default null,
  p_photo_urls text[] default '{}',
  p_photo_paths text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_profile public.profiles%rowtype;
  v_signed_at timestamptz := coalesce(p_signed_at, now());
  v_signed_unix_ms bigint := coalesce(p_signed_at_unix_ms, floor(extract(epoch from coalesce(p_signed_at, now())) * 1000)::bigint);
  v_signed_local text := nullif(btrim(coalesce(p_signed_at_local, '')), '');
  v_signed_timezone text := nullif(btrim(coalesce(p_signed_timezone, '')), '');
  v_photo_urls text[] := coalesce(p_photo_urls, '{}');
  v_photo_paths text[] := coalesce(p_photo_paths, '{}');
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

  if coalesce(array_length(v_photo_urls, 1), 0) > 5 then
    raise exception 'A maximum of 5 delivery photos may be attached.';
  end if;

  if coalesce(array_length(v_photo_paths, 1), 0) > 5 then
    raise exception 'A maximum of 5 delivery photos may be attached.';
  end if;

  update public.orders
  set
    status = 'delivered',
    pod_signature_data_url = p_signature_data_url,
    pod_signed_by = btrim(p_signed_by),
    pod_signed_at = v_signed_at,
    pod_signed_at_unix_ms = v_signed_unix_ms,
    pod_signed_at_local = coalesce(v_signed_local, to_char(v_signed_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS "UTC"')),
    pod_signed_timezone = coalesce(v_signed_timezone, 'UTC'),
    pod_notes = nullif(btrim(coalesce(p_notes, '')), ''),
    pod_captured_by = p_user_id,
    pod_photo_urls = v_photo_urls,
    pod_photo_paths = v_photo_paths
  where id = p_order_id;

  perform public.modhanios_insert_audit(
    'pod_captured',
    v_order.id,
    v_order.client_id,
    p_user_id,
    v_profile.full_name,
    format(
      'Proof of delivery captured for Order #%s by %s at %s%s',
      v_order.order_number,
      btrim(p_signed_by),
      coalesce(v_signed_local, v_signed_at::text),
      case when coalesce(array_length(v_photo_urls, 1), 0) > 0
        then format(' (%s photo%s attached)', array_length(v_photo_urls, 1), case when array_length(v_photo_urls, 1) = 1 then '' else 's' end)
        else ''
      end
    ),
    null,
    btrim(p_signed_by)
  );
end;
$$;

revoke all on function public.modhanios_complete_delivery_pod(text, uuid, text, text, text, timestamptz, bigint, text, text, text[], text[]) from public;
grant execute on function public.modhanios_complete_delivery_pod(text, uuid, text, text, text, timestamptz, bigint, text, text, text[], text[]) to authenticated;
