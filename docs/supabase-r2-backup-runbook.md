# Supabase External Backup To Cloudflare R2

This runbook sets up an external backup for the live ModhaniOS Supabase database.

The app still runs on Vercel. GitHub Actions only runs the scheduled backup job.

## Architecture

```text
Vercel app -> Supabase live database

GitHub Actions daily schedule
  -> pg_dump live Supabase database
  -> write metadata + checksums
  -> upload backup files to Cloudflare R2
```

## What Gets Backed Up

- Full PostgreSQL custom dump: `*-full.dump`
- Schema-only SQL dump: `*-schema.sql.gz`
- Backup metadata: `*-metadata.txt`
- SHA256 checksums: `*-SHA256SUMS.txt`

The full dump is the main restore artifact. The schema dump is included for quick inspection and debugging.

## Step 1: Create Cloudflare R2 Bucket

1. Open Cloudflare dashboard.
2. Switch to the company account.
3. Go to **Storage & databases**.
4. Open **R2 Object Storage**.
5. Create a bucket named:

```text
modhanios-live-backups
```

## Step 2: Create R2 API Credentials

1. In Cloudflare, go to **R2 Object Storage**.
2. Open **Manage R2 API tokens** or **API tokens**.
3. Create a token with object read/write access for the bucket.
4. Save these values:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET=modhanios-live-backups
R2_ENDPOINT
```

Use the exact jurisdiction-specific endpoint Cloudflare shows, for example:

```text
https://<account-id>.<jurisdiction>.r2.cloudflarestorage.com
```

## Step 3: Get Supabase Database URL

In Supabase live project:

1. Go to **Project Settings**.
2. Open **Database**.
3. Copy the PostgreSQL connection string in URI format.
4. Use the direct database connection string if available.

Store it as:

```text
SUPABASE_DB_URL=postgresql://...
```

Do not commit this value to the repository.

## Step 4: Add GitHub Secrets

In `Automantics-Canada/modhaniOS`:

1. Go to **Settings**.
2. Open **Secrets and variables**.
3. Open **Actions**.
4. Add these repository secrets:

```text
SUPABASE_DB_URL
R2_ACCOUNT_ID
R2_ENDPOINT
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
```

Optional repository variables:

```text
BACKUP_PREFIX=modhanios-live
R2_PREFIX=database
```

## Step 5: Run A Manual Test

1. Open GitHub Actions.
2. Select **Supabase External Backup**.
3. Click **Run workflow**.
4. Wait for the workflow to pass.
5. Open Cloudflare R2 bucket.
6. Confirm files exist under:

```text
database/<timestamp>/
```

Expected files:

```text
modhanios-live-<timestamp>-full.dump
modhanios-live-<timestamp>-schema.sql.gz
modhanios-live-<timestamp>-metadata.txt
modhanios-live-<timestamp>-SHA256SUMS.txt
```

## Restore Test Command

For a restore drill, restore into a disposable PostgreSQL/Supabase test database, never directly into production:

```bash
pg_restore \
  --dbname "$RESTORE_DB_URL" \
  --no-owner \
  --no-acl \
  modhanios-live-<timestamp>-full.dump
```

Run a restore test monthly.

## Retention Recommendation

- Daily backups: 30 days
- Weekly backups: 12 weeks
- Monthly backups: 12 months

Retention cleanup should be added after the first successful manual backup test.
