alter table public.orders
  add column if not exists pod_signature_data_url text,
  add column if not exists pod_signed_by text,
  add column if not exists pod_signed_at timestamptz,
  add column if not exists pod_notes text,
  add column if not exists pod_captured_by uuid references public.profiles (user_id) on delete set null;

drop function if exists public.modhanios_complete_delivery_pod(text, uuid, text, text, text);

create or replace function public.modhanios_complete_delivery_pod(
  p_order_id text,
  p_user_id uuid,
  p_signed_by text,
  p_signature_data_url text,
  p_notes text default null
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

  if v_order.status <> 'shipped' then
    raise exception 'Proof of delivery can only be captured for shipped orders.';
  end if;

  if nullif(btrim(p_signed_by), '') is null then
    raise exception 'Receiver name is required.';
  end if;

  if nullif(btrim(p_signature_data_url), '') is null then
    raise exception 'Receiver signature is required.';
  end if;

  update public.orders
  set
    pod_signature_data_url = p_signature_data_url,
    pod_signed_by = btrim(p_signed_by),
    pod_signed_at = now(),
    pod_notes = nullif(btrim(coalesce(p_notes, '')), ''),
    pod_captured_by = p_user_id
  where id = p_order_id;

  perform public.modhanios_insert_audit(
    'pod_captured',
    v_order.id,
    v_order.client_id,
    p_user_id,
    v_profile.full_name,
    format('Proof of delivery captured for Order #%s by %s', v_order.order_number, btrim(p_signed_by)),
    null,
    btrim(p_signed_by)
  );
end;
$$;

revoke all on function public.modhanios_complete_delivery_pod(text, uuid, text, text, text) from public;
grant execute on function public.modhanios_complete_delivery_pod(text, uuid, text, text, text) to authenticated;
