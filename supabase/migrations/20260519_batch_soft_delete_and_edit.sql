-- Production lot soft-delete + editable quantity.
--
-- Requirements:
--   1. Operators must not be able to permanently delete a production log;
--      the row must persist so the audit trail and historical FIFO state
--      remain reconstructible.
--   2. A "Trash" view should still show the deleted entries with a restore
--      option.
--   3. Editing a lot's quantity (e.g. correcting a typo) must be logged
--      with the previous and new values.
--   4. Every soft-delete / restore / edit must write an audit_events row.

-- ---------------------------------------------------------------------------
-- 1. Schema additions
-- ---------------------------------------------------------------------------
alter table public.batches
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users (id) on delete set null,
  add column if not exists deleted_reason text;

create index if not exists batches_deleted_at_idx
  on public.batches (deleted_at);

-- ---------------------------------------------------------------------------
-- 2. Edit lot quantity (with audit)
-- ---------------------------------------------------------------------------
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
  v_already_used numeric;
  v_qty_diff numeric;
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

  if p_new_qty is null or p_new_qty <= 0 then
    raise exception 'New quantity must be greater than zero.';
  end if;

  -- Already consumed = produced - remaining. The new produced amount must
  -- still cover what's already been assigned to orders.
  v_already_used := v_batch.qty_produced - v_batch.qty_remaining;
  if p_new_qty < v_already_used then
    raise exception 'Cannot reduce below already-fulfilled quantity (% units already shipped from this lot).',
      trim(to_char(v_already_used, 'FM999999990.##'));
  end if;

  v_qty_diff := p_new_qty - v_batch.qty_produced;

  update public.batches
  set
    qty_produced  = p_new_qty,
    qty_remaining = v_batch.qty_remaining + v_qty_diff,
    status        = case when (v_batch.qty_remaining + v_qty_diff) > 0 then 'active' else 'cleared' end,
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
      case when p_reason is not null and btrim(p_reason) <> '' then ' - ' || btrim(p_reason) else '' end
    ),
    format('%s: %s units', v_batch.batch_number, trim(to_char(v_batch.qty_produced, 'FM999999990.##'))),
    format('%s: %s units', v_batch.batch_number, trim(to_char(p_new_qty, 'FM999999990.##')))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Soft-delete (move to trash) - sets deleted_at, keeps the row
-- ---------------------------------------------------------------------------
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
begin
  select * into v_profile from public.profiles where user_id = p_user_id;
  if not found or (not v_profile.fulfil_orders and not v_profile.manage_settings) then
    raise exception 'This user cannot trash production lots.';
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
    deleted_reason = nullif(btrim(coalesce(p_reason, '')), ''),
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
      'Moved lot %s (%s %s, %s units) to trash%s',
      v_batch.batch_number,
      coalesce(v_product.name, '?'),
      coalesce(v_product.unit_size, ''),
      trim(to_char(v_batch.qty_produced, 'FM999999990.##')),
      case when p_reason is not null and btrim(p_reason) <> '' then ' - ' || btrim(p_reason) else '' end
    ),
    'active',
    'trashed'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Restore from trash
-- ---------------------------------------------------------------------------
create or replace function public.modhanios_restore_batch(
  p_batch_id text,
  p_user_id uuid
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
begin
  select * into v_profile from public.profiles where user_id = p_user_id;
  if not found or (not v_profile.fulfil_orders and not v_profile.manage_settings) then
    raise exception 'This user cannot restore production lots.';
  end if;

  select * into v_batch from public.batches where id = p_batch_id for update;
  if not found then
    raise exception 'Production lot not found.';
  end if;

  if v_batch.deleted_at is null then
    -- Not in trash; idempotent no-op.
    return;
  end if;

  update public.batches
  set
    deleted_at     = null,
    deleted_by     = null,
    deleted_reason = null,
    status         = case when v_batch.qty_remaining > 0 then 'active' else 'cleared' end,
    updated_at     = now()
  where id = p_batch_id;

  select * into v_product from public.products where id = v_batch.product_id;

  perform public.modhanios_insert_audit(
    'production_restored',
    null,
    null,
    p_user_id,
    v_profile.full_name,
    format(
      'Restored lot %s (%s %s) from trash',
      v_batch.batch_number,
      coalesce(v_product.name, '?'),
      coalesce(v_product.unit_size, '')
    ),
    'trashed',
    'active'
  );
end;
$$;

revoke all on function public.modhanios_edit_production_batch(text, uuid, numeric, text) from public;
revoke all on function public.modhanios_soft_delete_batch(text, uuid, text) from public;
revoke all on function public.modhanios_restore_batch(text, uuid) from public;

grant execute on function public.modhanios_edit_production_batch(text, uuid, numeric, text) to authenticated;
grant execute on function public.modhanios_soft_delete_batch(text, uuid, text) to authenticated;
grant execute on function public.modhanios_restore_batch(text, uuid) to authenticated;
