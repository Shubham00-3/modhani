# ModhaniOS Phase 1

ModhaniOS is a multi-client, batch-tracked dairy order management dashboard. The current codebase supports two modes:

- `Demo mode`: runs entirely from the built-in Phase 1 seed dataset when Supabase env vars are not configured.
- `Supabase mode`: uses staff auth, persisted tables, and the same UI/workflows backed by a Supabase project.

## Environment

Copy `.env.example` to `.env.local` and fill in:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_SEED_PASSWORD=ChangeMe123!
QUICKBOOKS_CONNECTOR_USERNAME=modhanios-qbwc
QUICKBOOKS_CONNECTOR_PASSWORD=...
QUICKBOOKS_CONNECTOR_BASE_URL=https://your-vercel-domain.example
```

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are used by the Vite app.
- `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_SEED_PASSWORD` are only used by the seed script.
- QuickBooks connector variables are server-only and are used by Vercel API functions for QuickBooks Web Connector.

If `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are omitted, the app falls back to demo mode automatically.

## Supabase Setup

1. Create a Supabase project.
2. Run the schema in [supabase/migrations/20260417_phase1_schema.sql](./supabase/migrations/20260417_phase1_schema.sql).
3. Add the environment variables above.
4. Seed the database and auth users:

```bash
npm run supabase:seed
```

This creates:

- staff auth users + `profiles`
- clients and locations
- products and negotiated client pricing
- batches
- orders, order items, and batch assignments
- audit events
- QuickBooks settings

The seed script also remaps the built-in user references to real Supabase auth user IDs so locks, audit entries, and user attribution stay consistent.

## Development

```bash
npm install
npm run dev
```

## QuickBooks Desktop Connector

Run all Supabase migrations through `20260422_quickbooks_desktop_queue.sql` before testing QuickBooks sync.

For Vercel, configure these server-side environment variables:

```bash
SUPABASE_SERVICE_ROLE_KEY=...
QUICKBOOKS_CONNECTOR_USERNAME=modhanios-qbwc
QUICKBOOKS_CONNECTOR_PASSWORD=...
QUICKBOOKS_CONNECTOR_BASE_URL=https://your-vercel-domain.example
```

The QuickBooks Web Connector file is available from:

```text
/api/quickbooks/qwc
```

The Web Connector SOAP endpoint used inside that file is:

```text
/api/quickbooks/qbwc
```

## Verification

```bash
npm run lint
npm run build
```
