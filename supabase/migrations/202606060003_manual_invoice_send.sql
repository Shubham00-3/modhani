-- Manual, delayed invoice sending.
--
-- Invoices are no longer emailed automatically when created. Admins review each
-- invoice first (accounting for transit damage such as broken egg trays via the
-- existing invoice-edit flow), then dispatch it manually. This RPC stamps the
-- send time and writes an audit row; the app fires the customer email after it
-- succeeds (the same 'invoice_ready' notification path as before).

create or replace function public.modhanios_send_invoice_email(
  p_order_id text,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_profile public.profiles%rowtype;
  v_sent_at timestamptz := timezone('utc', now());
begin
  select * into v_profile from public.profiles where user_id = p_user_id;
  if not found then
    raise exception 'User profile not found.';
  end if;

  if not v_profile.fulfil_orders and not v_profile.edit_invoices and not v_profile.manage_settings then
    raise exception 'This user cannot send invoices.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;

  if nullif(btrim(coalesce(v_order.invoice_number, '')), '') is null then
    raise exception 'Create the invoice before sending it.';
  end if;

  if v_order.invoice_email_sent_at is not null then
    raise exception 'This invoice has already been sent.';
  end if;

  update public.orders
  set invoice_email_sent_at = v_sent_at
  where id = p_order_id;

  perform public.modhanios_insert_audit(
    'invoice_sent',
    v_order.id,
    v_order.client_id,
    p_user_id,
    v_profile.full_name,
    format('Invoice %s sent for Order #%s', v_order.invoice_number, v_order.order_number),
    null,
    v_order.invoice_number
  );
end;
$$;

revoke all on function public.modhanios_send_invoice_email(text, uuid) from public;
grant execute on function public.modhanios_send_invoice_email(text, uuid) to authenticated;
