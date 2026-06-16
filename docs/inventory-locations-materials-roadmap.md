# Inventory Roadmap: Multi-Location & Raw-Material Tracking

> **Status:** Brainstorm / design proposal (not yet scheduled)
> **Audience:** Management + dev
> **Date:** 2026-06-10

## TL;DR

Two requested capabilities — (1) managing stock across two factories
(Tillsonburg + Brampton) with **internal transfers**, and (2) a new module to
track **raw materials & packaging** that auto-deducts when finished goods are
produced — are really **the same underlying problem: recording stock movements
across dimensions (location, material).**

The single highest-leverage decision is to introduce a **stock-movements ledger**
once, and build both features on top of it, rather than as two one-off systems.

Everything below still follows ModhaniOS's standard 3-layer rollout:
**SQL migration → `phaseOneDataStore` dispatch → `PhaseOneProvider` reducer**,
with migrations applied to Supabase manually.

---

## 1. Multi-Location Inventory (Tillsonburg + Brampton)

### Today
- The business runs **two real factories — Brampton and Tillsonburg** — but the
  system has **no concept of location**: all inventory is a single pool and
  production lots (`batches`) are not attributed to a factory.
- We are building this project for them, so multi-location needs to be
  supported for **both factories from the start**.

### Why a manual stopgap isn't enough
- The only manual option (duplicating each product with a location label) would
  double the catalogue → messy search, QuickBooks item-mapping breaks, reporting
  splits, and FIFO/lot codes fragment across the fake duplicates.
- It gives no real notion of "same product, two factories" → no transfers, no
  total-company view. We want proper multi-location instead.

### The core choice: where does *location* live?

| | **Option A — Tag on lots** | **Option B — Movements ledger** |
|---|---|---|
| Change | Add `facility_id` to `batches` + a `facilities` table | New `stock_movements` table; on-hand = SUM(movements) |
| Inventory math | Aggregate batches by product × facility | Aggregate movements by product × facility |
| Transfers | Bolted on | Native (two rows: −A, +B) |
| Audit trail | Reuse existing audit events | Built in |
| Serves Feature 2? | No | **Yes (same backbone)** |
| Effort | Smaller | Larger refactor |

> ⚠️ `facilities` is a **new** concept — do **not** reuse the existing
> `locations` table (those are *customer delivery addresses*).

**Recommendation:** Start with Option A to retire the duplicate-product hack
fast, then migrate the on-hand math to the Option B ledger (which Feature 2
needs anyway).

### Internal transfers (the real ask)
A transfer is **not an order**. New action, e.g.
`modhanios_transfer_stock(product, from_facility, to_facility, qty, reason)`:
- For a **dairy/food business it must preserve lot codes** across the move
  (recall traceability). A transfer **splits a lot** (e.g. lot `26146`: 100 →
  60 stays Brampton + 40 to Tillsonburg, same lot code).
- Writes a movement/audit record **with a reason** (consistent with the new
  mandatory-reason rule on edit/trash).

### Decisions for management
- When fulfilling an order, **which facility ships** — manual pick or default
  per client?
- Show **total company stock** as well as per-facility, or per-facility only?
- Do transfers need approval, or can any fulfilment-staff perform them?

### Schema sketch
```sql
create table facilities (
  id            text primary key,         -- 'tillsonburg' | 'brampton'
  name          text not null,
  is_active     boolean not null default true
);

-- Option A: tag lots
alter table batches
  add column facility_id text references facilities(id);

-- Transfers (works with either option)
create table stock_transfers (
  id             text primary key,
  product_id     text references products(id),
  batch_id       text references batches(id),     -- lot being moved
  from_facility  text references facilities(id),
  to_facility    text references facilities(id),
  qty            numeric not null check (qty > 0),
  reason         text not null,                    -- mandatory, per house rule
  created_by     uuid,
  created_at     timestamptz default now()
);
```

---

## 2. Raw Material & Packaging Tracking (auto-deduct on production)

### Goal
Track raw materials (milk, cultures, sugar) and packaging (bottles, caps,
labels), and when a finished product is produced, **auto-deduct the required
components** per a recipe. Example: producing **100 units of yogurt** consumes
**500 kg of milk** (= 5 kg/unit) + 100 cups + 100 lids + 100 labels.

### Three building blocks

**(a) Materials catalog** — separate from finished `products`.
```sql
create table materials (
  id                  text primary key,
  name                text not null,
  type                text not null check (type in ('raw','packaging')),
  unit                text not null,            -- 'kg' | 'L' | 'each'
  qty_on_hand         numeric not null default 0,
  low_stock_threshold numeric,
  supplier            text
);
```

**(b) Bill of Materials (recipe)** — per finished product, per-unit consumption.
```sql
create table product_recipes (
  product_id    text references products(id),
  material_id   text references materials(id),
  qty_per_unit  numeric not null,   -- e.g. 5 (kg milk per 1 unit yogurt)
  primary key (product_id, material_id)
);
```

**(c) Auto-deduction at production** — hook into the existing
`modhanios_log_production_batch` RPC. When X units are logged:
1. look up the product's recipe rows,
2. compute `needs = X × qty_per_unit` per material,
3. **deduct from material stock in the same transaction** (atomic: finished
   goods +X and materials −needs together),
4. record a material movement linked to the lot (traceability).

### The piece people forget: materials come IN too
Finished goods are *produced*; raw materials are *bought*. So a **"Receive
Materials"** action is needed (stock-in from a supplier delivery) — otherwise
material stock only ever decreases.

### The new page
A dedicated **"Materials"** nav item (mirrors *Production & Lots*):
- **Stock on hand** — list view + low-stock alerts (reuse the new inventory
  list layout).
- **Receiving** — log incoming material deliveries.
- **Recipes (BOM)** — edit per-product material requirements.
- **Material history** — movements (received / consumed / adjusted).

### Edge cases to decide
- **Insufficient stock** at production time: hard-block, or warn-and-allow
  (negative stock)? *(Recommend warn first — don't halt the factory.)*
- **Unit conversions** (recipe kg vs received L) — keep units strict per
  material initially.
- **Material lots & expiry** — milk expires; for full recall ("which yogurt
  lots used the bad milk batch?") materials eventually need their own lot/
  expiry tracking. High value, but later phase.
- **QuickBooks** — materials are purchasing/COGS; decide if they sync or stay
  internal.

### Movement record (shared with Feature 1)
```sql
create table stock_movements (
  id           text primary key,
  item_type    text not null,          -- 'product' | 'material'
  item_id      text not null,
  facility_id  text references facilities(id),
  qty_delta    numeric not null,       -- + in, - out
  movement_type text not null,         -- production | consumption | receive
                                        -- | transfer_in | transfer_out | adjustment
  reference    text,                   -- lot id / transfer id / order id
  reason       text,
  created_by   uuid,
  created_at   timestamptz default now()
);
```

---

## 3. Phased Roadmap

| Phase | Multi-Location | Raw Materials & Packaging |
|------:|----------------|---------------------------|
| **1** | `facilities` table + `facility_id` on lots + per-facility inventory view → **retires the duplicate-product hack** | Materials catalog + manual stock adjust + Materials page (no auto-deduct) |
| **2** | Internal transfer action (split lot, preserve lot code, reason + audit) | Recipe / BOM editor per product |
| **3** | Migrate on-hand math to `stock_movements` ledger | **Auto-deduction on production** + low-stock alerts |
| **4** | Per-facility reporting & FIFO | Receiving/supplier flow + material lot & expiry traceability |

> The **ledger** (Phase 3) is the convergence point: once it exists, location
> transfers and material consumption are both just movements.

---

## 4. Open Decisions (need management input)

1. Which facility ships an order — manual pick or per-client default?
2. Total-company stock view, or per-facility only?
3. Do transfers require approval?
4. On insufficient raw material: block production, or warn and allow?
5. Do materials sync to QuickBooks, or stay internal-only?
6. Is raw-material lot/expiry traceability required for food-safety recall
   (affects scope significantly)?

---

## 5. Architectural Notes (for dev)

- **One ledger, two consumers.** Strongly prefer introducing `stock_movements`
  early; locations and materials both read/write it. Avoids a second refactor.
- **Reason everywhere.** Both features must capture a mandatory reason on manual
  changes, matching the existing edit/trash policy and audit trail.
- **3-layer per change.** Each capability = SQL migration (new tables + RPCs,
  e.g. `modhanios_transfer_stock`, `modhanios_receive_material`,
  `modhanios_set_recipe`, plus a hook in `modhanios_log_production_batch`) +
  `phaseOneDataStore.js` dispatch cases + `PhaseOneProvider.jsx` reducer +
  new page/sidebar entry. Migrations applied to Supabase manually.
- **Food-safety angle is a selling point.** Lot traceability from raw-material
  batch → finished-goods lot enables targeted recalls — worth highlighting to
  the client.
