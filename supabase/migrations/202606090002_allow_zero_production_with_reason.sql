-- Allow production lots to be edited to any non-negative quantity with a
-- mandatory reason.
--
-- Background:
--   Operators sometimes need to zero out a lot's quantity when the stock left
--   the building without a formal invoice - e.g. transferred between locations
--   or "sold" internally. Trashing the lot is the wrong tool: the lot should
--   stay on record (cleared, not deleted) so the audit trail and lot history
--   remain intact. The previous modhanios_edit_production_batch rejected any
--   quantity <= 0, so this was impossible.
--
-- This migration replaces modhanios_edit_production_batch so that:
--   1. A new quantity of 0 is allowed (negatives are still rejected).
--   2. A non-empty reason is REQUIRED for every quantity change and is
--      written into the audit trail.
--   3. Any lot can be edited to any non-negative quantity, including zero.
--   4. A zero quantity clears the lot (status = 'cleared'); the row persists.

create or replace function public.modhanios_edit_production_batch(
  p_batch_id text,
  p_user_id uuid,
  p_new_qty numeric,
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
  v_qty_diff numeric;
  v_reason text;
begin
  select * into v_profile from public.profiles where user_id = p_user_id;
  if not found or (not v_profile.fulfil_orders and not v_profile.manage_settings) then
    raise exception 'This user cannot edit production lots.';
  end if;

  select * into v_batch from public.batches where id = p_batch_id for update;
  if not found then
    raise exception 'Production lot not found.';
  end if;

  if v_batch.deleted_at is not null then
    raise exception 'Cannot edit a lot that has been moved to trash. Restore it first.';
  end if;

  -- Zero is now a valid quantity (e.g. internal transfer / internal use), but
  -- negatives never are.
  if p_new_qty is null or p_new_qty < 0 then
    raise exception 'New quantity cannot be negative.';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  if v_reason is null then
    raise exception 'A reason is required when changing production quantity.';
  end if;

  v_qty_diff := p_new_qty - v_batch.qty_produced;

  update public.batches
  set
    qty_produced  = p_new_qty,
    qty_remaining = greatest(v_batch.qty_remaining + v_qty_diff, 0),
    status        = case when greatest(v_batch.qty_remaining + v_qty_diff, 0) > 0 then 'active' else 'cleared' end,
    updated_at    = now()
  where id = p_batch_id;

  select * into v_product from public.products where id = v_batch.product_id;

  perform public.modhanios_insert_audit(
    'production_edited',
    null,
    null,
    p_user_id,
    v_profile.full_name,
    format(
      'Edited lot %s (%s %s): %s -> %s units%s',
      v_batch.batch_number,
      coalesce(v_product.name, '?'),
      coalesce(v_product.unit_size, ''),
      trim(to_char(v_batch.qty_produced, 'FM999999990.##')),
      trim(to_char(p_new_qty, 'FM999999990.##')),
      case when v_reason is not null then ' - ' || v_reason else '' end
    ),
    format('%s: %s units', v_batch.batch_number, trim(to_char(v_batch.qty_produced, 'FM999999990.##'))),
    format('%s: %s units', v_batch.batch_number, trim(to_char(p_new_qty, 'FM999999990.##')))
  );
end;
$$;

revoke all on function public.modhanios_edit_production_batch(text, uuid, numeric, text) from public;
grant execute on function public.modhanios_edit_production_batch(text, uuid, numeric, text) to authenticated;
