-- Bulk invoice sending.
--
-- Lets an admin select several invoices (e.g. all of yesterday's) and stamp
-- them sent in one call. Delegates to the single-invoice RPC per id so each
-- gets the same validation (invoice exists, not already sent) and its own
-- audit row — mirroring how modhanios_bulk_assign_driver delegates to
-- modhanios_assign_driver. Customer emails are fired per order by the app
-- after this succeeds (the 'invoice_ready' notification path).
--
-- Already-sent or invalid invoices are skipped rather than aborting the whole
-- batch, so one bad row doesn't block the rest.

create or replace function public.modhanios_bulk_send_invoice_email(
  p_order_ids text[],
  p_user_id uuid
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
  if not found or (not v_caller.fulfil_orders and not v_caller.edit_invoices and not v_caller.manage_settings) then
    raise exception 'This user cannot send invoices.';
  end if;

  if p_order_ids is null or array_length(p_order_ids, 1) is null then
    raise exception 'At least one invoice is required.';
  end if;

  foreach v_order_id in array p_order_ids loop
    begin
      perform public.modhanios_send_invoice_email(v_order_id, p_user_id);
    exception when others then
      -- Skip invoices that are missing or already sent; keep the batch going.
      continue;
    end;
  end loop;
end;
$$;

revoke all on function public.modhanios_bulk_send_invoice_email(text[], uuid) from public;
grant execute on function public.modhanios_bulk_send_invoice_email(text[], uuid) to authenticated;
