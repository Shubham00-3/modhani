create or replace function public.modhanios_assign_driver(
  p_order_id text,
  p_user_id uuid,
  p_driver_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller public.profiles%rowtype;
  v_driver public.profiles%rowtype;
  v_order public.orders%rowtype;
  v_previous_label text;
  v_next_label text;
begin
  select * into v_caller from public.profiles where user_id = p_user_id;
  if not found or (not v_caller.fulfil_orders and not v_caller.manage_settings) then
    raise exception 'This user cannot assign drivers.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status = 'delivered' then
    raise exception 'Delivered orders cannot have their driver changed.';
  end if;

  if p_driver_user_id is null then
    v_next_label := 'Unassigned';
  else
    select * into v_driver from public.profiles where user_id = p_driver_user_id;
    if not found then
      raise exception 'Driver profile not found.';
    end if;
    if v_driver.role <> 'driver' then
      raise exception 'Selected user is not a driver.';
    end if;
    if v_driver.disabled_at is not null then
      raise exception 'Selected driver is disabled. Re-enable them or pick a different driver.';
    end if;
    v_next_label := v_driver.full_name;
  end if;

  if v_order.driver_user_id is null then
    v_previous_label := 'Unassigned';
  else
    select full_name into v_previous_label
    from public.profiles
    where user_id = v_order.driver_user_id;
    v_previous_label := coalesce(v_previous_label, 'Unknown');
  end if;

  update public.orders
  set
    driver_user_id     = p_driver_user_id,
    driver_assigned_at = case when p_driver_user_id is null then null else now() end,
    driver_assigned_by = case when p_driver_user_id is null then null else p_user_id end
  where id = p_order_id;

  perform public.modhanios_insert_audit(
    case when p_driver_user_id is null then 'driver_unassigned' else 'driver_assigned' end,
    p_order_id,
    v_order.client_id,
    p_user_id,
    v_caller.full_name,
    format('Order #%s driver: %s -> %s',
      coalesce(v_order.order_number::text, p_order_id),
      v_previous_label,
      v_next_label
    ),
    v_previous_label,
    v_next_label
  );
end;
$$;

revoke all on function public.modhanios_assign_driver(text, uuid, uuid) from public;
grant execute on function public.modhanios_assign_driver(text, uuid, uuid) to authenticated;
