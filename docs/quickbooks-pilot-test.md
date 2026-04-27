# QuickBooks Pilot Test Data

This pilot setup uses selected rows from the client-provided QuickBooks exports:

- `Customer List.xlsm`
- `Item List.xlsm`

It is not a full import. It adds a small set of real QuickBooks-style customers, Ship-To locations, products, prices, and inventory batches so the invoice sync can be tested with realistic names.

## Setup

1. In Supabase SQL Editor, run all existing migrations through `20260423_fix_quickbooks_admin_helpers.sql`.
2. Run `supabase/migrations/20260424_quickbooks_pilot_sample_data.sql`.
3. Run `supabase/migrations/20260425_quickbooks_pilot_master_sync_jobs.sql`.
4. Refresh ModhaniOS.
5. Confirm the pilot clients appear in `Clients & Locations`.
6. Confirm the pilot products appear in `Products`.
7. Confirm pilot batches appear in `Production & Batches`.
8. Run QuickBooks Web Connector once before invoice testing so it creates the pilot customers and items in the QuickBooks test company file.

## Recommended Test Orders

Create and fulfil 3-5 orders using these combinations:

- `A1 Cash & Carry - Kennedy Road` with `3% Mango Lassi 1 liters`
- `Chalo FreshCo - Airport Road` with `Malai Paneer 300 grams`
- `FreshCo - Dixie Road` with multiple products
- `Fortinos - Mountainash` with `Premium Desi Ghee 400 grams`
- `Loblaws - Raman's No Frills` with `Modhani 2% Pasteurized Milk 4 liters`

For each order:

1. Add incoming order.
2. Start fulfilment.
3. Assign full quantity from the matching `QB-PILOT-*` batch.
4. Save batch assignment.
5. Create invoice.
6. Queue QuickBooks sync.
7. Confirm a pending invoice row appears in `quickbooks_sync_jobs`.
8. Run QuickBooks Web Connector.
9. Verify the invoice in QuickBooks Desktop.

## What To Verify In QuickBooks

- Customer matches the ModhaniOS `QB Customer` value exactly.
- Ship-To address matches the selected ModhaniOS location.
- Invoice lines use the configured QuickBooks item names.
- Quantities and rates are correct.
- ModhaniOS changes the sync status from `Pending sync` to `Pushed`, or shows a clear failure message.

## Failure Test

After at least one successful sync, intentionally edit one pilot product's `QuickBooks Item Name` to a wrong value, then queue a new invoice. QuickBooks should reject it, and ModhaniOS should show the failed sync state and error message.

Change the item name back before continuing normal tests.
