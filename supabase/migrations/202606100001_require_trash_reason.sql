-- Require a reason when moving a production lot to trash.
--
-- Background:
--   modhanios_soft_delete_batch previously accepted a null/blank reason
--   (p_reason default null). Per the manager's request, trashing a lot must
--   always be justified for the audit trail, mirroring the mandatory reason on
--   modhanios_edit_production_batch. This migration replaces the function so a
--   non-empty reason is REQUIRED; everything else (permission check, in-use
--   guard, audit row) is unchanged.

create or replace function public.modhanios_soft_delete_batch(
  p_batch_id text,
  p_user_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_batch public.batches%rowtype;
  v_product public.products%rowtype;
  v_in_use_count integer;
  v_reason text;
begin
  select * into v_profile from public.profiles where user_id = p_user_id;
  if not found or (not v_profile.fulfil_orders and not v_profile.manage_settings) then
    raise exception 'This user cannot trash production lots.';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'A reason is required when moving a lot to trash.';
  end if;

  select * into v_batch from public.batches where id = p_batch_id for update;
  if not found then
    raise exception 'Production lot not found.';
  end if;

  if v_batch.deleted_at is not null then
    -- Already trashed; nothing to do but don't error so retries are safe.
    return;
  end if;

  -- Refuse to trash a lot that's currently assigned to active orders.
  -- (Cleared/Delivered orders don't matter - the assignments are historical.)
  select count(*)
  into v_in_use_count
  from public.batch_assignments ba
  join public.order_items oi on oi.id = ba.order_item_id
  join public.orders o on o.id = oi.order_id
  where ba.batch_id = p_batch_id
    and o.status in ('pending', 'partial', 'fulfilled', 'invoiced', 'shipped');

  if v_in_use_count > 0 then
    raise exception 'This lot is assigned to % active order(s). Resolve or decline those orders before trashing the lot.', v_in_use_count;
  end if;

  update public.batches
  set
    deleted_at     = now(),
    deleted_by     = p_user_id,
    deleted_reason = v_reason,
    status         = 'cleared',
    updated_at     = now()
  where id = p_batch_id;

  select * into v_product from public.products where id = v_batch.product_id;

  perform public.modhanios_insert_audit(
    'production_trashed',
    null,
    null,
    p_user_id,
    v_profile.full_name,
    format(
      'Moved lot %s (%s %s, %s units) to trash - %s',
      v_batch.batch_number,
      coalesce(v_product.name, '?'),
      coalesce(v_product.unit_size, ''),
      trim(to_char(v_batch.qty_produced, 'FM999999990.##')),
      v_reason
    ),
    'active',
    'trashed'
  );
end;
$$;

revoke all on function public.modhanios_soft_delete_batch(text, uuid, text) from public;
grant execute on function public.modhanios_soft_delete_batch(text, uuid, text) to authenticated;
