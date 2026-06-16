// Production facilities (our two factories). Distinct from `locations`, which
// are customer delivery addresses. Stored on `batches.facility_id`; the short
// `code` is suffixed onto lot codes (e.g. "26166-BR") so a physical label
// self-identifies its origin factory for recall traceability. Kept in one place
// so the topbar location switcher, the production logger, and the inventory
// roll-up share the same canonical set, labels, and codes.
export const FACILITIES = [
  { id: 'brampton', name: 'Brampton', code: 'BR', sortOrder: 1 },
  { id: 'tillsonburg', name: 'Tillsonburg', code: 'TB', sortOrder: 2 },
];

// Sentinel for the "show everything / company total" view in the switcher.
export const ALL_FACILITIES = 'all';

const FACILITY_BY_ID = Object.fromEntries(FACILITIES.map((f) => [f.id, f]));

export function getFacility(id) {
  return FACILITY_BY_ID[String(id ?? '').trim().toLowerCase()] ?? null;
}

export function getFacilityName(id) {
  return getFacility(id)?.name ?? 'Unassigned';
}

export function getFacilityCode(id) {
  return getFacility(id)?.code ?? '';
}

// Append the factory suffix to a base lot code, e.g. ("26166", "brampton") ->
// "26166-BR". Idempotent: if the base already ends with a known facility
// suffix it is replaced, so re-deriving on facility change doesn't stack
// "-BR-TB". Returns the base unchanged when the facility is unknown.
export function applyFacilityLotSuffix(baseLotCode, facilityId) {
  const base = String(baseLotCode ?? '').trim();
  const code = getFacilityCode(facilityId);
  if (!base) return base;
  const stripped = base.replace(/-(?:BR|TB)$/i, '');
  return code ? `${stripped}-${code}` : stripped;
}
