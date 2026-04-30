# ModhaniOS

ModhaniOS is an operations platform for Modhani's wholesale dairy and food business. It connects customer ordering, staff order management, batch-based fulfilment, invoicing, packing slips, reporting, and QuickBooks Desktop sync in one workflow.

## What It Does

- Staff dashboard for operations, orders, production, reporting, audit trail, clients, products, and settings.
- Customer portal where approved customers can sign in and place orders.
- Client and location management for companies such as A1 Cash & Carry, Chalo FreshCo, Fortinos, Loblaws, and other buyers.
- Product catalogue with product images, default/base prices, and optional client-specific pricing.
- Order workflow from pending order through fulfilment, invoice creation, shipment confirmation, and QuickBooks sync.
- Batch/lot assignment for fulfilment and packing slip traceability.
- QuickBooks Desktop Web Connector integration for customer, item, and invoice sync.

## Modes

The app supports two runtime modes:

- `Demo mode`: runs from built-in local seed data when Supabase frontend env vars are missing.
- `Supabase mode`: uses Supabase Auth, persisted database tables, storage, migrations, and RPC-backed workflows.

## Tech Stack

- React 19 + Vite
- Supabase Auth, Postgres, Storage, RLS, and RPC functions
- React Router
- lucide-react icons
- Recharts
- Vercel deployment
- QuickBooks Desktop Web Connector API under `api/`

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
- `SUPABASE_SERVICE_ROLE_KEY` is server-side only and must not be exposed publicly.
- `SUPABASE_SEED_PASSWORD` is used by the seed script.
- QuickBooks connector variables are server-side and used by the Vercel API functions.

If the frontend Supabase variables are omitted, the app falls back to demo mode.

## Supabase Setup

Run the migrations in order from `supabase/migrations/`.

Important recent migrations include:

- `20260421_notification_center.sql`
- `20260422_quickbooks_desktop_queue.sql`
- `20260423_fix_quickbooks_admin_helpers.sql`
- `20260424_quickbooks_pilot_sample_data.sql`
- `20260425_quickbooks_pilot_master_sync_jobs.sql`
- `20260430_product_images_catalog.sql`
- `20260430_remove_pilot_seed_products.sql`
- `20260430_customer_portal_orders.sql`
- `20260430_customer_portal_all_products.sql`

After base schema setup, seed staff/demo data when needed:

```bash
npm run supabase:seed
```

## Customer Portal Flow

1. Customer selects `Customer Login` on the login page.
2. Customer signs up or signs in.
3. New customer accounts enter `Pending Staff Approval`.
4. Staff logs in and opens `Clients & Locations`.
5. Staff links the customer contact to a client/company and marks it active.
6. Customer signs in again and sees the order form.
7. Customer selects a location, enters quantities, and submits.
8. The order appears in `Orders & Invoicing` as a pending portal order.

Approved customers can see all products. Pricing uses client-specific pricing when present; otherwise it uses the product base catalogue price.

## Product Images

Product images live under:

```text
public/product-images/
```

The product image migration adds image fields to products and seeds ZIP-derived product records/images. Staff can also add or update a product image from the product edit modal.

## QuickBooks Desktop Connector

Configure these server-side environment variables on Vercel:

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

The SOAP endpoint used by the Web Connector is:

```text
/api/quickbooks/qbwc
```

Current QuickBooks scope is invoice sync, with master customer/item sync support for the pilot QuickBooks company file.

## Development

```bash
npm install
npm run dev
```

## Verification

Use targeted ESLint because local temporary Chrome profile folders may cause plain `npm run lint` to scan generated files:

```bash
npm run build
npx eslint src api scripts --ext .js,.jsx,.mjs
```
