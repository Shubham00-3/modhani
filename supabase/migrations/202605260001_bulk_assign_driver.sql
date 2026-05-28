-- Bulk driver assignment.
--
-- Lets an admin / fulfilment user assign (or reassign) a single driver to
-- many shipped orders in one click. Each order still gets its own audit row
-- via the existing single-order logic, so the trail stays per-order.

create or replace function public.modhanios_bulk_assign_driver(
  p_order_ids text[],
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
  v_order_id text;
begin
  select * into v_caller from public.profiles where user_id = p_user_id;
  if not found or (not v_caller.fulfil_orders and not v_caller.manage_settings) then
    raise exception 'This user cannot assign drivers.';
  end if;

  if p_order_ids is null or array_length(p_order_ids, 1) is null then
    raise exception 'At least one order id is required.';
  end if;

  -- Defer to the single-order RPC for each id. It re-checks permissions,
  -- locks the row, validates the driver, and emits the audit event — so we
  -- inherit all of that consistently for every order in the batch.
  foreach v_order_id in array p_order_ids loop
    perform public.modhanios_assign_driver(v_order_id, p_user_id, p_driver_user_id);
  end loop;
end;
$$;

revoke all on function public.modhanios_bulk_assign_driver(text[], uuid, uuid) from public;
grant execute on function public.modhanios_bulk_assign_driver(text[], uuid, uuid) to authenticated;
