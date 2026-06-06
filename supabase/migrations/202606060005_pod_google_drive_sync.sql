-- Google Drive POD sync tracking.
--
-- The actual Drive upload is handled by /api/sync-pod-drive using a Google
-- service account. These nullable columns store the Drive reference after a
-- POD has been uploaded.

alter table public.orders
  add column if not exists pod_drive_file_id text,
  add column if not exists pod_drive_web_view_link text,
  add column if not exists pod_drive_synced_at timestamptz;
