// Seed the materials catalog from the client's QuickBooks item list
// (ITEM LIST 2.xlsx). Imports every "Inventory Part" row (raw materials,
// packaging, chemicals/PPE) — NOT the "Inventory Assembly" rows, which are
// finished products and already live in the `products` table. Uses the QB item
// code (e.g. CUPS-003) as the material id so recipes reference real codes.
//
// Idempotent: re-running upserts by id. Run AFTER migration 202606170002 is
// applied (it adds the 'consumable' material type for CHEM/PPE).
//
// First extract the workbook into ./.tmp-seed-itemlist/ :
//   mkdir -p .tmp-seed-itemlist && (cd .tmp-seed-itemlist && unzip -o "<ITEM LIST 2.xlsx>")
// then:
//   node scripts/seedMaterials.mjs --dry-run  # print what would be sent
//   node scripts/seedMaterials.mjs            # upsert into personal Supabase
import { readFileSync } from 'node:fs';

// Directory the xlsx was extracted into (unzip it here first; see header).
const TMP = new URL('../.tmp-seed-itemlist/', import.meta.url);
const DRY = process.argv.includes('--dry-run');

const env = (() => {
  const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const e = {};
  for (const line of text.split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) e[m[1]] = m[2]; }
  return e;
})();
const U = env.VITE_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;

// --- parse the (already-extracted) xlsx (no external deps) ---
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const ss = readFileSync(new URL('xl/sharedStrings.xml', TMP), 'utf8');
const strings = [...ss.matchAll(/<si>(.*?)<\/si>/gs)].map((m) =>
  decode([...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((x) => x[1]).join('')));
function parseSheet(name) {
  const xml = readFileSync(new URL(`xl/worksheets/${name}`, TMP), 'utf8');
  return [...xml.matchAll(/<row[^>]*>(.*?)<\/row>/gs)].map((r) => {
    const cells = [...r[1].matchAll(/<c r="([A-Z]+)\d+"[^>]*?(t="s")?>(?:<v>(.*?)<\/v>)?<\/c>/gs)];
    const o = {};
    for (const c of cells) o[c[1]] = c[3] == null ? '' : (c[2] ? strings[+c[3]] : c[3]);
    return o;
  });
}
const rows = [...parseSheet('sheet1.xml'), ...parseSheet('sheet2.xml')];

// --- mapping ---
const PREFIX_TYPE = {
  MILK: 'raw', MILKP: 'raw', CULTURE: 'raw', ENZY: 'raw', FRUIT: 'raw', ING: 'raw',
  BASE: 'packaging', BOTTLE: 'packaging', CAPS: 'packaging', CASE: 'packaging', CUPS: 'packaging',
  FILM: 'packaging', FOIL: 'packaging', JARS: 'packaging', LABEL: 'packaging', LIDS: 'packaging',
  NSEAL: 'packaging', TRAY: 'packaging', TUBS: 'packaging',
  CHEM: 'consumable', PPE: 'consumable',
};
function mapUnit(um) {
  const s = (um || '').toLowerCase();
  if (s.includes('(kg)') || s.includes('kilogram')) return 'kg';
  if (s.includes('(l)') || s.includes('litre') || s.includes('liter')) return 'L';
  if (s.includes('(lb)') || s.includes('pound')) return 'lb';
  if (s.includes('(ft)') || s.includes('foot')) return 'ft';
  if (s.includes('pail')) return 'Pail';
  return 'each';
}

const materials = [];
const skipped = [];
for (const r of rows) {
  const code = (r.A || '').trim();
  const desc = (r.B || '').trim();
  const type = (r.C || '').trim();
  if (type !== 'Inventory Part') continue;          // skip headers + assemblies
  if (!code || !desc) continue;
  const prefix = code.split('-')[0].trim();
  const matType = PREFIX_TYPE[prefix];
  if (!matType) { skipped.push(`${code} (unknown prefix ${prefix})`); continue; }
  materials.push({
    id: code,
    name: desc,
    type: matType,
    unit: mapUnit(r.D),
    supplier: (r.E || '').trim() || null,
    low_stock_threshold: null,
    is_active: true,
  });
}

const counts = materials.reduce((a, m) => ((a[m.type] = (a[m.type] || 0) + 1), a), {});
console.log(`Parsed ${materials.length} Inventory Part rows:`, counts);
if (skipped.length) console.log('Skipped (no type mapping):', skipped.join(', '));

if (DRY) {
  console.table(materials.slice(0, 12).map((m) => ({ id: m.id, type: m.type, unit: m.unit, name: m.name.slice(0, 40) })));
  console.log(`(dry run — ${materials.length} rows would be upserted)`);
  process.exit(0);
}

const res = await fetch(`${U}/rest/v1/materials?on_conflict=id`, {
  method: 'POST',
  headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(materials),
});
if (!res.ok) { console.error('Upsert failed:', res.status, await res.text()); process.exit(1); }
console.log(`✅ Upserted ${materials.length} materials into the catalog.`);
