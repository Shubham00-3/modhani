import { getOrderShipToSnapshot } from '../data/phaseOneData';

// Basic, dependency-free route helper for the driver portal.
//
// Deliberately uses NO Google/Maps API, NO geolocation, and NO coordinate math.
// We just order the stops with a simple address-text heuristic and hand the
// ordered list to Google Maps via a plain directions URL. Google does the real
// routing when the link opens, and the driver decides whether to follow it.

/** Single-line address used for display and the Maps URL. */
export function formatStopAddress(shipTo) {
  return [
    shipTo.addressLine1,
    shipTo.addressLine2,
    shipTo.city,
    shipTo.province,
    shipTo.postalCode,
  ]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

// Canadian postal codes start with a Forward Sortation Area (e.g. "L6T") that
// clusters geographically, so sorting by it groups nearby stops. We fall back
// to city then street so stops without a postal code still order sensibly.
function routeSortKey(shipTo) {
  const fsa = String(shipTo.postalCode ?? '').toUpperCase().replace(/\s+/g, '').slice(0, 3);
  const city = String(shipTo.city ?? '').toUpperCase().trim();
  const street = String(shipTo.addressLine1 ?? '').toUpperCase().trim();
  return `${fsa}|${city}|${street}`;
}

/**
 * Order the given orders into a basic delivery route. Returns an array of
 * `{ order, shipTo, address, label }` stops. Orders without a usable address
 * are kept (appended last) so nothing silently disappears from the list.
 */
export function buildOptimizedRoute(orders, locations) {
  const stops = orders.map((order) => {
    const location = locations.find((entry) => entry.id === order.locationId) ?? null;
    const shipTo = getOrderShipToSnapshot(order, location);
    const address = formatStopAddress(shipTo);
    return {
      order,
      shipTo,
      address,
      label: shipTo.name || address,
      sortKey: routeSortKey(shipTo),
      hasAddress: Boolean(address),
    };
  });

  return stops.sort((a, b) => {
    if (a.hasAddress !== b.hasAddress) return a.hasAddress ? -1 : 1;
    return a.sortKey.localeCompare(b.sortKey);
  });
}

/**
 * Build a Google Maps directions URL for the ordered stops. Origin is omitted
 * so Maps starts from the device's current location; remaining stops become
 * waypoints in our order (Google may further optimize). Returns '' when there
 * is nothing to route.
 */
export function buildGoogleMapsRouteUrl(stops) {
  const addresses = stops.map((stop) => stop.address).filter(Boolean);
  if (!addresses.length) return '';

  const destination = encodeURIComponent(addresses[addresses.length - 1]);
  const waypoints = addresses.slice(0, -1).map((address) => encodeURIComponent(address));

  const params = [`api=1`, `destination=${destination}`, `travelmode=driving`];
  if (waypoints.length) {
    params.splice(2, 0, `waypoints=${waypoints.join('|')}`);
  }
  return `https://www.google.com/maps/dir/?${params.join('&')}`;
}
