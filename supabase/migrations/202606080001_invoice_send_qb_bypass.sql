-- Safeguard: warn + audit when sending an invoice that has not synced with QuickBooks.
--
-- Until an invoice syncs to QuickBooks Desktop it only carries a temporary DRAFT
-- number (orders.invoice_number, e.g. "DRAFT-1042"). The real QuickBooks document
-- number is assigned during sync and stored in qb_invoice_number. Emailing a draft
-- to the client therefore puts a throwaway number in front of them, which is hard
-- to reconcile once the real number lands.
--
-- The single-invoice "Send Invoice" action now refuses to send an unsynced invoice
-- unless the caller explicitly passes p_allow_unsynced => true. The UI sets that
-- flag only after the user acknowledges a warning dialog and clicks the bypass
-- button. Whenever an unsynced/draft invoice is sent, a dedicated
-- 'invoice_sent_qb_bypass' audit row is written in addition to the normal
-- 'invoice_sent' row, recording who bypassed the QuickBooks sync requirement and
-- which draft number went out.
--
-- Bulk send opts into the bypass (p_allow_unsynced => true) so its existing
-- behaviour is unchanged; any unsynced invoices it sends are audited the same way.

-- Drop the old 2-arg signature so the name resolves to the new 3-arg version
-- everywhere (including from the bulk function below).
drop function if exists public.modhanios_send_invoice_email(text, uuid);

create or replace function public.modhanios_send_invoice_email(
  p_order_id text,
  p_user_id uuid,
  p_allow_unsynced boolean default false
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
  v_is_synced boolean;
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

  -- An invoice is "synced" once it has been pushed to QuickBooks and carries its
  -- real document number; any other status means it still has only a draft number.
  v_is_synced := coalesce(v_order.qb_sync_status, '') = 'pushed';

  if not v_is_synced and not p_allow_unsynced then
    raise exception
      'Invoice % has not synced with QuickBooks yet, so it still has a draft number. Confirm the warning to send the draft.',
      v_order.invoice_number;
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

  -- Record the bypass as its own audit event so it is easy to find: a specific
  -- user knowingly sent a draft invoice without waiting for the QuickBooks sync.
  if not v_is_synced then
    perform public.modhanios_insert_audit(
      'invoice_sent_qb_bypass',
      v_order.id,
      v_order.client_id,
      p_user_id,
      v_profile.full_name,
      format(
        '%s bypassed the QuickBooks sync requirement and sent draft invoice %s for Order #%s directly to the client (QuickBooks status: %s).',
        v_profile.full_name,
        v_order.invoice_number,
        v_order.order_number,
        coalesce(nullif(v_order.qb_sync_status, ''), 'not synced')
      ),
      coalesce(nullif(v_order.qb_sync_status, ''), 'not synced'),
      v_order.invoice_number
    );
  end if;
end;
$$;

revoke all on function public.modhanios_send_invoice_email(text, uuid, boolean) from public;
grant execute on function public.modhanios_send_invoice_email(text, uuid, boolean) to authenticated;

-- Bulk send delegates per id. Opt into the bypass so already-supported unsynced
-- invoices keep sending (and each gets its own bypass audit row) exactly as
-- before, rather than being silently skipped by the new gate.
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
      perform public.modhanios_send_invoice_email(v_order_id, p_user_id, true);
    exception when others then
      -- Skip invoices that are missing or already sent; keep the batch going.
      continue;
    end;
  end loop;
end;
$$;

revoke all on function public.modhanios_bulk_send_invoice_email(text[], uuid) from public;
grant execute on function public.modhanios_bulk_send_invoice_email(text[], uuid) to authenticated;
