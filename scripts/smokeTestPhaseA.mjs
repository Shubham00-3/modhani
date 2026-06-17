// Isolated RPC smoke test for Phase A (materials) + stock transfers against the
// PERSONAL Supabase sandbox. Uses TEST-marked throwaway fixtures and hard-deletes
// everything (incl. audit rows) at the end, so the sandbox is left clean.
// Run: node scripts/smokeTestPhaseA.mjs
import { readFileSync } from 'node:fs';

const env = (() => {
  const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const e = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) e[m[1]] = m[2];
  }
  return e;
})();

const URL_BASE = env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const PRIYA = '33743cec-fe8f-4260-b97a-c2ffe44c360a';
const PRODUCT = 'product-balkan-yogurt-10kg';
const STAMP = Date.now();
const MAT_ID = `material-TEST-${STAMP}`;
const LOT_ID = `mlot-TEST-${STAMP}`;
const BATCH_ID = `batch-TEST-${STAMP}`;
const BATCH_NUM = `TEST${STAMP}`;
const SUPPLIER_LOT = `TESTLOT-${STAMP}`;

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  cond ? pass++ : fail++;
}

async function rpc(fn, body) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}
async function get(path) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, { headers: H });
  return res.json();
}
async function del(path) {
  await fetch(`${URL_BASE}/rest/v1/${path}`, { method: 'DELETE', headers: H });
}

async function main() {
  console.log('=== Phase A + transfers RPC smoke test ===\n');

  // --- Materials: upsert ---
  console.log('1. modhanios_upsert_material');
  let r = await rpc('modhanios_upsert_material', {
    p_id: MAT_ID, p_name: `TEST Buffalo Milk ${STAMP}`, p_type: 'raw', p_unit: 'L',
    p_supplier: 'TEST Dairy Co', p_low_stock_threshold: 50, p_is_active: true, p_user_id: PRIYA,
  });
  check('upsert material returns 2xx', r.ok, r.ok ? '' : r.body);
  let mat = await get(`materials?id=eq.${MAT_ID}&select=*`);
  check('material row exists', mat[0]?.name?.includes('TEST Buffalo Milk'));

  // --- Materials: receive twice (accumulation) ---
  console.log('\n2. modhanios_receive_material (x2, same supplier lot -> accumulate)');
  r = await rpc('modhanios_receive_material', {
    p_lot_id: LOT_ID, p_material_id: MAT_ID, p_supplier_lot_code: SUPPLIER_LOT,
    p_facility_id: 'brampton', p_qty: 100, p_received_date: '2026-06-17',
    p_expiry_date: '2026-07-01', p_unit_cost: 2.5, p_user_id: PRIYA,
  });
  check('first receive returns 2xx', r.ok, r.ok ? '' : r.body);
  r = await rpc('modhanios_receive_material', {
    p_lot_id: `${LOT_ID}-b`, p_material_id: MAT_ID, p_supplier_lot_code: SUPPLIER_LOT,
    p_facility_id: 'brampton', p_qty: 50, p_received_date: '2026-06-16',
    p_expiry_date: null, p_unit_cost: null, p_user_id: PRIYA,
  });
  check('second receive returns 2xx', r.ok, r.ok ? '' : r.body);
  let lot = await get(`material_lots?material_id=eq.${MAT_ID}&select=*`);
  check('accumulated into ONE lot row', lot.length === 1, `rows=${lot.length}`);
  check('qty_received = 150', Number(lot[0]?.qty_received) === 150, `got ${lot[0]?.qty_received}`);
  check('qty_remaining = 150', Number(lot[0]?.qty_remaining) === 150, `got ${lot[0]?.qty_remaining}`);
  check('received_date = earliest (06-16)', lot[0]?.received_date === '2026-06-16', `got ${lot[0]?.received_date}`);
  check('expiry preserved from first', lot[0]?.expiry_date === '2026-07-01', `got ${lot[0]?.expiry_date}`);

  // --- Materials: trash ---
  console.log('\n3. modhanios_soft_delete_material_lot');
  r = await rpc('modhanios_soft_delete_material_lot', { p_lot_id: lot[0].id, p_user_id: PRIYA, p_reason: 'smoke test trash' });
  check('trash returns 2xx', r.ok, r.ok ? '' : r.body);
  lot = await get(`material_lots?id=eq.${lot[0].id}&select=*`);
  check('lot soft-deleted (deleted_at set, status cleared)', lot[0]?.deleted_at != null && lot[0]?.status === 'cleared');
  r = await rpc('modhanios_soft_delete_material_lot', { p_lot_id: lot[0].id, p_user_id: PRIYA, p_reason: '' });
  check('trash rejects empty reason', !r.ok && r.body.includes('reason'), `status ${r.status}`);

  // --- Transfer: log a test batch at Brampton, move part to Tillsonburg ---
  console.log('\n4. modhanios_log_production_batch (Brampton fixture)');
  r = await rpc('modhanios_log_production_batch', {
    p_batch_id: BATCH_ID, p_batch_number: BATCH_NUM, p_product_id: PRODUCT,
    p_production_date: '2026-06-17', p_qty_produced: 100, p_user_id: PRIYA, p_facility_id: 'brampton',
  });
  check('log production returns 2xx', r.ok, r.ok ? '' : r.body);

  console.log('\n5. modhanios_transfer_stock (Brampton -> Tillsonburg, qty 30)');
  r = await rpc('modhanios_transfer_stock', {
    p_batch_id: BATCH_ID, p_to_facility: 'tillsonburg', p_qty: 30, p_reason: 'smoke test transfer', p_user_id: PRIYA,
  });
  check('transfer returns 2xx', r.ok, r.ok ? '' : r.body);
  let rows = await get(`batches?batch_number=eq.${BATCH_NUM}&select=*&order=facility_id`);
  const br = rows.find((b) => b.facility_id === 'brampton');
  const tb = rows.find((b) => b.facility_id === 'tillsonburg');
  check('source Brampton remaining = 70', Number(br?.qty_remaining) === 70, `got ${br?.qty_remaining}`);
  check('source Brampton produced = 70', Number(br?.qty_produced) === 70, `got ${br?.qty_produced}`);
  check('dest Tillsonburg row created', tb != null);
  check('dest Tillsonburg remaining = 30', Number(tb?.qty_remaining) === 30, `got ${tb?.qty_remaining}`);
  check('dest keeps origin lot code', tb?.batch_number === BATCH_NUM, `got ${tb?.batch_number}`);
  check('company total preserved (70+30=100)', Number(br?.qty_remaining) + Number(tb?.qty_remaining) === 100);

  // guard rails
  r = await rpc('modhanios_transfer_stock', { p_batch_id: BATCH_ID, p_to_facility: 'tillsonburg', p_qty: 9999, p_reason: 'x', p_user_id: PRIYA });
  check('transfer rejects over-quantity', !r.ok && /available/.test(r.body), `status ${r.status}`);
  r = await rpc('modhanios_transfer_stock', { p_batch_id: BATCH_ID, p_to_facility: 'brampton', p_qty: 5, p_reason: 'x', p_user_id: PRIYA });
  check('transfer rejects same-factory', !r.ok && /same/.test(r.body), `status ${r.status}`);

  // --- audit rows landed? ---
  console.log('\n6. audit trail');
  const audits = await get(`audit_events?select=action,details&or=(details.ilike.*${STAMP}*,details.ilike.*smoke test*)&order=timestamp.desc`);
  const actions = audits.map((a) => a.action);
  check('material_received audited', actions.includes('material_received'));
  check('material_lot_trashed audited', actions.includes('material_lot_trashed'));
  check('production_logged audited', actions.includes('production_logged'));
  check('stock_transferred audited', actions.includes('stock_transferred'));

  // --- cleanup ---
  console.log('\n7. cleanup (hard-delete TEST fixtures + audit rows)');
  await del(`material_lots?material_id=eq.${MAT_ID}`);
  await del(`materials?id=eq.${MAT_ID}`);
  await del(`batches?batch_number=eq.${BATCH_NUM}`);
  await del(`audit_events?or=(details.ilike.*${STAMP}*,details.ilike.*smoke test*)`);
  const leftMat = await get(`materials?id=eq.${MAT_ID}&select=id`);
  const leftBatch = await get(`batches?batch_number=eq.${BATCH_NUM}&select=id`);
  const leftAudit = await get(`audit_events?details=ilike.*${STAMP}*&select=id`);
  check('materials fixture removed', leftMat.length === 0);
  check('batch fixture removed', leftBatch.length === 0);
  check('audit fixtures removed', Array.isArray(leftAudit) && leftAudit.length === 0);

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
