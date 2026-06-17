// One-off verification probe for Phase A + transfers against the PERSONAL
// Supabase sandbox. Reads .env.local itself so no secrets are passed on argv.
// Usage: node scripts/verifyPhaseA.mjs
import { readFileSync } from 'node:fs';

function loadEnv() {
  const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv();
const URL_BASE = env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function rest(path) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, { headers });
  if (!res.ok) return { error: `${res.status} ${await res.text()}` };
  return { data: await res.json() };
}

function facilityName(id) {
  return id === 'brampton' ? 'Brampton' : id === 'tillsonburg' ? 'Tillsonburg' : (id ?? 'Unassigned');
}

async function main() {
  console.log('=== Personal Supabase sandbox:', URL_BASE, '===\n');

  // 1. Tables exist?
  for (const t of ['materials', 'material_lots', 'facilities', 'batches']) {
    const r = await rest(`${t}?select=*&limit=1`);
    console.log(`table ${t.padEnd(14)} : ${r.error ? 'MISSING / ' + r.error : 'OK'}`);
  }
  console.log('');

  // 2. Facilities seeded?
  const fac = await rest('facilities?select=id,name,code,is_active&order=sort_order');
  console.log('facilities:', fac.error ?? fac.data.map((f) => `${f.name}(${f.code})`).join(', '));
  console.log('');

  // 3. Materials catalog.
  const mats = await rest('materials?select=id,name,type,unit,supplier,is_active&order=name');
  if (mats.error) console.log('materials:', mats.error);
  else {
    console.log(`materials catalog (${mats.data.length}):`);
    for (const m of mats.data) console.log(`  - ${m.name} [${m.type}/${m.unit}] supplier=${m.supplier ?? '-'} active=${m.is_active}`);
  }
  console.log('');

  // 4. Material lots (receiving log), per facility, active only.
  const lots = await rest('material_lots?select=id,material_id,supplier_lot_code,facility_id,qty_received,qty_remaining,received_date,deleted_at&order=received_date.desc');
  if (lots.error) console.log('material_lots:', lots.error);
  else {
    const active = lots.data.filter((l) => !l.deleted_at);
    console.log(`material_lots: ${lots.data.length} total, ${active.length} active`);
    for (const l of active) {
      console.log(`  - ${l.supplier_lot_code} @ ${facilityName(l.facility_id)} : recv ${l.qty_received} / remain ${l.qty_remaining} (${l.received_date})`);
    }
  }
  console.log('');

  // 5. Production batches per facility (the transfer surface).
  const batches = await rest('batches?select=id,batch_number,product_id,facility_id,qty_produced,qty_remaining,status,deleted_at&order=batch_number');
  if (batches.error) console.log('batches:', batches.error);
  else {
    const active = batches.data.filter((b) => !b.deleted_at);
    const byFac = {};
    for (const b of active) {
      byFac[b.facility_id] = (byFac[b.facility_id] ?? 0) + Number(b.qty_remaining ?? 0);
    }
    console.log(`batches: ${batches.data.length} total, ${active.length} active`);
    console.log('  remaining by facility:', Object.entries(byFac).map(([k, v]) => `${facilityName(k)}=${v}`).join(', ') || '(none)');
    const tb = active.filter((b) => b.facility_id === 'tillsonburg');
    console.log(`  Tillsonburg lots: ${tb.length}`, tb.map((b) => `${b.batch_number}(${b.qty_remaining})`).join(', '));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
