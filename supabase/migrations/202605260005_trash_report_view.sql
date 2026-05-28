-- Trash report: surfaces production lots that have been soft-deleted via
-- the trash flow in 20260519_batch_soft_delete_and_edit.sql. Joins to the
-- product catalogue and profiles so the report can show product names and
-- the user who trashed the lot.

create or replace view public.report_trashed_lots as
select
  b.id as batch_id,
  b.batch_number as lot_code,
  b.product_id,
  p.name as product_name,
  p.unit_size,
  trim(both ' ' from coalesce(p.name, '') || ' ' || coalesce(p.unit_size, '')) as product_display_name,
  p.category,
  b.production_date,
  b.qty_produced,
  -- qty at trash time = remaining when the row was soft-deleted; trash
  -- guard rejects lots tied to active orders, so this is exactly the qty
  -- that left active inventory when the lot was discarded.
  b.qty_remaining as qty_trashed,
  b.deleted_at,
  b.deleted_by,
  pr.full_name as deleted_user_name,
  b.deleted_reason
from public.batches b
join public.products p on p.id = b.product_id
left join public.profiles pr on pr.user_id = b.deleted_by
where b.deleted_at is not null;

grant select on public.report_trashed_lots to authenticated;
