-- Queue controlled QuickBooks master-data creation jobs for the pilot test company file.
-- These jobs let QuickBooks Web Connector create the selected customers/items before invoices.

alter table public.quickbooks_sync_jobs
  alter column order_id drop not null,
  add column if not exists entity_type text,
  add column if not exists entity_id text;

alter table public.quickbooks_sync_jobs
  drop constraint if exists quickbooks_sync_jobs_job_type_check;

alter table public.quickbooks_sync_jobs
  add constraint quickbooks_sync_jobs_job_type_check
  check (job_type in ('invoice', 'customer', 'item'));

create unique index if not exists idx_qb_jobs_one_open_master_per_entity
on public.quickbooks_sync_jobs (job_type, entity_id)
where status in ('pending', 'syncing', 'failed')
  and job_type in ('customer', 'item');

with pilot_clients (id) as (
  values
    ('qb-pilot-client-a1-kennedy'),
    ('qb-pilot-client-a1-torbram'),
    ('qb-pilot-client-chalo-airport'),
    ('qb-pilot-client-chalo-cottrell'),
    ('qb-pilot-client-freshco-dixie'),
    ('qb-pilot-client-fortinos-mountainash'),
    ('qb-pilot-client-loblaws-ramans'),
    ('qb-pilot-client-loblaws-wholesale')
)
insert into public.quickbooks_sync_jobs (
  order_id,
  job_type,
  status,
  entity_type,
  entity_id,
  error_message,
  locked_by_ticket,
  locked_at
)
select
  null,
  'customer',
  'pending',
  'client',
  id,
  null,
  null,
  null
from pilot_clients
on conflict (job_type, entity_id) where status in ('pending', 'syncing', 'failed') and job_type in ('customer', 'item')
do update set
  status = 'pending',
  error_message = null,
  locked_by_ticket = null,
  locked_at = null,
  updated_at = timezone('utc', now());

with pilot_products (id) as (
  values
    ('qb-pilot-product-5154'),
    ('qb-pilot-product-5153'),
    ('qb-pilot-product-5183'),
    ('qb-pilot-product-5184'),
    ('qb-pilot-product-5117'),
    ('qb-pilot-product-5171'),
    ('qb-pilot-product-5175'),
    ('qb-pilot-product-5194')
)
insert into public.quickbooks_sync_jobs (
  order_id,
  job_type,
  status,
  entity_type,
  entity_id,
  error_message,
  locked_by_ticket,
  locked_at
)
select
  null,
  'item',
  'pending',
  'product',
  id,
  null,
  null,
  null
from pilot_products
on conflict (job_type, entity_id) where status in ('pending', 'syncing', 'failed') and job_type in ('customer', 'item')
do update set
  status = 'pending',
  error_message = null,
  locked_by_ticket = null,
  locked_at = null,
  updated_at = timezone('utc', now());

-- Correct earlier false positives from the first connector test. A real success has TxnID/ListID.
update public.quickbooks_sync_jobs
set
  status = 'failed',
  error_message = coalesce(error_message, 'QuickBooks rejected this job. Requeue after master data is available.'),
  qb_invoice_number = null,
  locked_by_ticket = null,
  locked_at = null,
  updated_at = timezone('utc', now())
where status = 'pushed'
  and qb_txn_id is null
  and coalesce(response_xml, '') ~ 'statusCode="[^0]';
