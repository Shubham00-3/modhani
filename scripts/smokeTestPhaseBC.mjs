// Isolated RPC smoke test for Phase B (recipes) + Phase C (FIFO consumption +
// recall ledger) against the PERSONAL Supabase sandbox. Uses TEST-marked
// throwaway fixtures and hard-deletes everything at the end.
// Run AFTER migration 202606170002 is applied.  node scripts/smokeTestPhaseBC.mjs
import { readFileSync } from 'node:fs';

const env = (() => {
  const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const e = {};
  for (const line of text.split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) e[m[1]] = m[2]; }
  return e;
})();
const URL_BASE = env.VITE_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const PRIYA = '33743cec-fe8f-4260-b97a-c2ffe44c360a';
const PRODUCT = 'product-balkan-yogurt-10kg';
const S = Date.now();
const MAT = `material-TESTBC-${S}`;
const LOT_A = `mlot-TESTBC-A-${S}`, LOT_B = `mlot-TESTBC-B-${S}`;
const SUPLOT_A = `TESTBC-A-${S}`, SUPLOT_B = `TESTBC-B-${S}`;
const BATCH1 = `batch-TESTBC1-${S}`, BATCH2 = `batch-TESTBC2-${S}`;
const NUM1 = `TBC1${S}`, NUM2 = `TBC2${S}`;

let pass = 0, fail = 0;
const check = (n, c, x = '') => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}${x ? ' — ' + x : ''}`); c ? pass++ : fail++; };
async function rpc(fn, body) {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch { /* void */ }
  return { ok: r.ok, status: r.status, body: t, json: j };
}
const get = (p) => fetch(`${URL_BASE}/rest/v1/${p}`, { headers: H }).then((r) => r.json());
const del = (p) => fetch(`${URL_BASE}/rest/v1/${p}`, { method: 'DELETE', headers: H });

async function main() {
  console.log('=== Phase B (recipes) + C (consumption + recall) smoke test ===\n');

  // Fixtures: one raw material, two Brampton lots (A older than B) for FIFO.
  await rpc('modhanios_upsert_material', { p_id: MAT, p_name: `TESTBC Milk ${S}`, p_type: 'raw', p_unit: 'L', p_supplier: 'T', p_low_stock_threshold: null, p_is_active: true, p_user_id: PRIYA });
  await rpc('modhanios_receive_material', { p_lot_id: LOT_A, p_material_id: MAT, p_supplier_lot_code: SUPLOT_A, p_facility_id: 'brampton', p_qty: 100, p_received_date: '2026-06-10', p_expiry_date: null, p_unit_cost: null, p_user_id: PRIYA });
  await rpc('modhanios_receive_material', { p_lot_id: LOT_B, p_material_id: MAT, p_supplier_lot_code: SUPLOT_B, p_facility_id: 'brampton', p_qty: 100, p_received_date: '2026-06-15', p_expiry_date: null, p_unit_cost: null, p_user_id: PRIYA });
  const lotA = (await get(`material_lots?material_id=eq.${MAT}&supplier_lot_code=eq.${SUPLOT_A}&select=id`))[0];
  const lotB = (await get(`material_lots?material_id=eq.${MAT}&supplier_lot_code=eq.${SUPLOT_B}&select=id`))[0];

  // Phase B: recipe = 3 L of this material per produced unit.
  console.log('1. modhanios_save_product_recipe');
  let r = await rpc('modhanios_save_product_recipe', { p_product_id: PRODUCT, p_lines: [{ material_id: MAT, qty_per_unit: 3, note: 'test' }], p_user_id: PRIYA });
  check('save recipe returns 2xx', r.ok, r.ok ? '' : r.body);
  const lines = await get(`product_recipe_lines?product_id=eq.${PRODUCT}&material_id=eq.${MAT}&select=*`);
  check('recipe line stored (qty_per_unit=3)', lines.length === 1 && Number(lines[0].qty_per_unit) === 3);

  // admin-only guard
  r = await rpc('modhanios_save_product_recipe', { p_product_id: PRODUCT, p_lines: [], p_user_id: '00000000-0000-0000-0000-000000000000' });
  check('recipe save rejects non-admin', !r.ok, `status ${r.status}`);

  // Phase C: produce 50 units -> needs 150 L. FIFO drains lot A (100) then 50 of B.
  console.log('\n2. modhanios_log_production_batch (50 units, needs 150 L)');
  r = await rpc('modhanios_log_production_batch', { p_batch_id: BATCH1, p_batch_number: NUM1, p_product_id: PRODUCT, p_production_date: '2026-06-17', p_qty_produced: 50, p_user_id: PRIYA, p_facility_id: 'brampton' });
  check('production returns 2xx', r.ok, r.ok ? '' : r.body);
  check('no shortfall reported', Array.isArray(r.json?.shortfalls) && r.json.shortfalls.length === 0, JSON.stringify(r.json));
  const aAfter = (await get(`material_lots?id=eq.${lotA.id}&select=qty_remaining,status`))[0];
  const bAfter = (await get(`material_lots?id=eq.${lotB.id}&select=qty_remaining,status`))[0];
  check('FIFO drained lot A to 0 (cleared)', Number(aAfter.qty_remaining) === 0 && aAfter.status === 'cleared', `rem=${aAfter.qty_remaining} status=${aAfter.status}`);
  check('lot B reduced 100 -> 50 (active)', Number(bAfter.qty_remaining) === 50 && bAfter.status === 'active', `rem=${bAfter.qty_remaining}`);
  const cons1 = await get(`material_consumptions?batch_id=eq.${BATCH1}&select=material_lot_id,qty&order=qty.desc`);
  check('two consumption rows written', cons1.length === 2, `rows=${cons1.length}`);
  check('consumption totals 150 L', cons1.reduce((s, c) => s + Number(c.qty), 0) === 150);
  check('drew from BOTH lots A and B', cons1.some((c) => c.material_lot_id === lotA.id) && cons1.some((c) => c.material_lot_id === lotB.id));

  // Recall trace
  console.log('\n3. recall traceability');
  const fwd = await get(`material_consumptions?material_lot_id=eq.${lotA.id}&select=batch_id`);
  check('FORWARD: supplier lot A -> production batch', fwd.some((c) => c.batch_id === BATCH1));
  const bwd = await get(`material_consumptions?batch_id=eq.${BATCH1}&select=material_lot_id`);
  check('BACKWARD: batch -> both supplier lots', new Set(bwd.map((c) => c.material_lot_id)).size === 2);

  // Phase C shortfall: produce 100 units -> needs 300 L, only 50 left in B.
  console.log('\n4. shortfall (warn but allow)');
  r = await rpc('modhanios_log_production_batch', { p_batch_id: BATCH2, p_batch_number: NUM2, p_product_id: PRODUCT, p_production_date: '2026-06-17', p_qty_produced: 100, p_user_id: PRIYA, p_facility_id: 'brampton' });
  check('production still succeeds (not blocked)', r.ok, r.ok ? '' : r.body);
  const short = r.json?.shortfalls ?? [];
  check('shortfall reported for the material', short.length === 1 && short[0].material_id === MAT, JSON.stringify(short));
  check('short qty = 250 L (300 needed - 50 on hand)', Number(short[0]?.short_qty) === 250, `got ${short[0]?.short_qty}`);
  const bFinal = (await get(`material_lots?id=eq.${lotB.id}&select=qty_remaining`))[0];
  check('lot B floored at 0 (not negative)', Number(bFinal.qty_remaining) === 0, `rem=${bFinal.qty_remaining}`);
  const auditShort = await get(`audit_events?action=eq.material_shortfall&details=ilike.*${NUM2}*&select=id`);
  check('material_shortfall audited', auditShort.length >= 1);

  // Cleanup
  console.log('\n5. cleanup');
  await del(`material_consumptions?batch_id=in.(${BATCH1},${BATCH2})`);
  await del(`product_recipe_lines?product_id=eq.${PRODUCT}&material_id=eq.${MAT}`);
  await del(`batches?id=in.(${BATCH1},${BATCH2})`);
  await del(`material_lots?material_id=eq.${MAT}`);
  await del(`materials?id=eq.${MAT}`);
  await del(`audit_events?details=ilike.*${S}*`);
  const leftMat = await get(`materials?id=eq.${MAT}&select=id`);
  const leftCons = await get(`material_consumptions?batch_id=in.(${BATCH1},${BATCH2})&select=id`);
  check('fixtures removed', leftMat.length === 0 && leftCons.length === 0);

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
