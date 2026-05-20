import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardSignature, LogOut, MapPin, Printer, RotateCcw, Truck } from 'lucide-react';
import { useApp } from '../context/useApp';
import {
  formatDateTime,
  getClientName,
  getLocationName,
  getOrderShipToSnapshot,
  getProduct,
  getProductDisplayName,
  normalizeLotCode,
} from '../data/phaseOneData';
import { printProofOfDelivery } from '../utils/printDocuments';

function formatAddress(shipTo) {
  // Clean each part: trim, strip trailing commas/whitespace.
  const clean = (s) => String(s ?? '').trim().replace(/[,\s]+$/, '');
  // Build the city/province/postal line, then assemble all parts and drop
  // any part that duplicates one already included (data sometimes ships
  // the full address baked into addressLine1/2 plus separate city fields).
  const cityLine = [shipTo.city, shipTo.province, shipTo.postalCode]
    .map(clean)
    .filter(Boolean)
    .join(' ');

  const parts = [
    clean(shipTo.name),
    clean(shipTo.addressLine1),
    clean(shipTo.addressLine2),
    cityLine,
    clean(shipTo.country),
  ].filter(Boolean);

  const seen = new Set();
  const deduped = [];
  for (const part of parts) {
    const key = part.toLowerCase().replace(/\s+/g, ' ');
    // Skip a part if we've already seen it, or if it's a substring of a
    // previously kept part (catches name vs addressLine1 dupes).
    if (seen.has(key)) continue;
    const isSubstring = deduped.some((prev) => prev.toLowerCase().includes(key));
    if (isSubstring) continue;
    seen.add(key);
    deduped.push(part);
  }
  return deduped.join(', ');
}

const CANADA_TIME_ZONE_BY_PROVINCE = {
  AB: 'America/Edmonton',
  ALBERTA: 'America/Edmonton',
  BC: 'America/Vancouver',
  'BRITISH COLUMBIA': 'America/Vancouver',
  MB: 'America/Winnipeg',
  MANITOBA: 'America/Winnipeg',
  NB: 'America/Moncton',
  'NEW BRUNSWICK': 'America/Moncton',
  NL: 'America/St_Johns',
  NEWFOUNDLAND: 'America/St_Johns',
  'NEWFOUNDLAND AND LABRADOR': 'America/St_Johns',
  NS: 'America/Halifax',
  'NOVA SCOTIA': 'America/Halifax',
  NT: 'America/Yellowknife',
  'NORTHWEST TERRITORIES': 'America/Yellowknife',
  NU: 'America/Iqaluit',
  NUNAVUT: 'America/Iqaluit',
  ON: 'America/Toronto',
  ONTARIO: 'America/Toronto',
  PE: 'America/Halifax',
  PEI: 'America/Halifax',
  'PRINCE EDWARD ISLAND': 'America/Halifax',
  QC: 'America/Toronto',
  QUEBEC: 'America/Toronto',
  SK: 'America/Regina',
  SASKATCHEWAN: 'America/Regina',
  YT: 'America/Whitehorse',
  YUKON: 'America/Whitehorse',
};

const CANADA_TIME_ZONE_BY_POSTAL_PREFIX = {
  A: 'America/St_Johns',
  B: 'America/Halifax',
  C: 'America/Halifax',
  E: 'America/Moncton',
  G: 'America/Toronto',
  H: 'America/Toronto',
  J: 'America/Toronto',
  K: 'America/Toronto',
  L: 'America/Toronto',
  M: 'America/Toronto',
  N: 'America/Toronto',
  P: 'America/Toronto',
  R: 'America/Winnipeg',
  S: 'America/Regina',
  T: 'America/Edmonton',
  V: 'America/Vancouver',
  X: 'America/Yellowknife',
  Y: 'America/Whitehorse',
};

function getDeliveryTimeZone(location, shipTo) {
  const postalPrefix = String(shipTo?.postalCode ?? location?.postalCode ?? '')
    .trim()
    .charAt(0)
    .toUpperCase();
  const provinceKey = String(shipTo?.province ?? location?.province ?? '')
    .trim()
    .toUpperCase();

  return (
    CANADA_TIME_ZONE_BY_POSTAL_PREFIX[postalPrefix]
    ?? CANADA_TIME_ZONE_BY_PROVINCE[provinceKey]
    ?? Intl.DateTimeFormat().resolvedOptions().timeZone
    ?? 'America/Toronto'
  );
}

function buildPodTimestampSnapshot({ date = new Date(), timeZone } = {}) {
  const resolvedTimeZone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'America/Toronto';
  const localFormatter = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
    timeZone: resolvedTimeZone,
  });
  return {
    iso: date.toISOString(),
    unixMs: date.getTime(),
    local: localFormatter.format(date),
    timeZone: resolvedTimeZone,
  };
}

function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function initCanvas() {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * ratio);
      canvas.height = Math.floor(rect.height * ratio);
      const context = canvas.getContext('2d');
      context.scale(ratio, ratio);
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = 2.5;
      context.strokeStyle = '#10261a';
    }

    initCanvas();

    function handleResize() {
      initCanvas();
      setIsEmpty(true);
      onChange('');
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [onChange]);

  function getPoint(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function startDrawing(event) {
    event.preventDefault();
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    const point = getPoint(event);
    drawingRef.current = true;
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function draw(event) {
    if (!drawingRef.current) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    const point = getPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
    setIsEmpty(false);
    onChange(canvas.toDataURL('image/png'));
  }

  function stopDrawing() {
    drawingRef.current = false;
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
    onChange('');
  }

  return (
    <div className="driver-signature-wrap">
      <canvas
        ref={canvasRef}
        className="driver-signature-canvas"
        aria-label="Customer signature area"
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
      />
      <div className="driver-signature-actions">
        <span>{isEmpty ? 'Ask receiver to sign inside the box.' : 'Signature captured.'}</span>
        <button className="btn btn-ghost" type="button" onClick={clearSignature}>
          <RotateCcw size={16} /> Clear
        </button>
      </div>
    </div>
  );
}

export default function DriverPortal() {
  const { state, dispatch, addToast, logout } = useApp();
  // Start with no explicit selection; derived state below picks a sensible
  // fallback and ignores stale IDs after realtime refreshes.
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [signedBy, setSignedBy] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fallbackSelectedOrderId = useMemo(() => {
    if (state.orders.length === 0) return null;
    const firstPending = state.orders.find((order) => !order.podSignedAt);
    return (firstPending ?? state.orders[0]).id;
  }, [state.orders]);

  const effectiveSelectedOrderId = state.orders.some((order) => order.id === selectedOrderId)
    ? selectedOrderId
    : fallbackSelectedOrderId;

  // Driver portal only ever holds orders in "shipped" status assigned to
  // this driver. Once POD is captured the order disappears on the next
  // refresh, so there's no separate completed list to render.
  const pendingOrders = state.orders;

  const selectedOrder = useMemo(
    () => state.orders.find((order) => order.id === effectiveSelectedOrderId) ?? null,
    [effectiveSelectedOrderId, state.orders]
  );
  const selectedLocation = selectedOrder
    ? state.locations.find((location) => location.id === selectedOrder.locationId)
    : null;
  const shipTo = selectedOrder ? getOrderShipToSnapshot(selectedOrder, selectedLocation) : null;

  function handleSelectOrder(orderId) {
    setSelectedOrderId(orderId);
    setSignedBy('');
    setSignatureDataUrl('');
    setNotes('');
  }

  async function handleSavePod(event) {
    event.preventDefault();
    if (!selectedOrder) return;

    if (!signedBy.trim()) {
      addToast('Enter the receiver name before saving POD.', 'warning');
      return;
    }

    if (!signatureDataUrl) {
      addToast('Capture the receiver signature before saving POD.', 'warning');
      return;
    }

    setSaving(true);
    const justPoddedOrderId = selectedOrder.id;
    let result;
    try {
      const signedTimestamp = buildPodTimestampSnapshot({
        timeZone: getDeliveryTimeZone(selectedLocation, shipTo),
      });
      result = await dispatch({
        type: 'COMPLETE_DELIVERY_POD',
        payload: {
          orderId: justPoddedOrderId,
          signedBy: signedBy.trim(),
          signatureDataUrl,
          notes: notes.trim(),
          timestamp: signedTimestamp.iso,
          signedAtUnixMs: signedTimestamp.unixMs,
          signedAtLocal: signedTimestamp.local,
          signedTimezone: signedTimestamp.timeZone,
          userId: state.currentUserId,
        },
      });
    } catch (error) {
      addToast(`Save failed: ${error.message}`, 'warning');
      result = { ok: false, error };
    } finally {
      setSaving(false);
    }

    if (result?.ok) {
      addToast(`POD saved for order #${selectedOrder.orderNumber}.`);
      // Keep the just-POD'd order selected so the driver sees the confirmation panel
      setSelectedOrderId(justPoddedOrderId);
      setSignedBy('');
      setSignatureDataUrl('');
      setNotes('');
    }
  }

  return (
    <div className="driver-portal-page">
      <header className="driver-portal-header">
        <div className="driver-brand">
          <img src="/modhani-logo.svg" alt="Modhani" />
          <div>
            <div className="driver-kicker">Driver Portal</div>
            <h1>Delivery Proof</h1>
          </div>
        </div>
        <button className="btn btn-secondary" type="button" onClick={logout}>
          <LogOut size={16} /> Sign Out
        </button>
      </header>

      <main className="driver-portal-layout">
        <aside className="driver-order-list" aria-label="Delivery orders">
          <div className="driver-list-heading">
            <Truck size={18} />
            <span>Pending Delivery</span>
            <strong>{pendingOrders.length}</strong>
          </div>
          {pendingOrders.length ? (
            pendingOrders.map((order) => {
              const locationName = getLocationName(state.locations, order.locationId);
              const clientName = getClientName(state.clients, order.clientId);
              return (
                <button
                  className={`driver-order-card ${order.id === selectedOrder?.id ? 'active' : ''}`}
                  key={order.id}
                  type="button"
                  onClick={() => handleSelectOrder(order.id)}
                >
                  <span className="driver-order-number">Order #{order.orderNumber}</span>
                  <span>{clientName}</span>
                  <small>{locationName}</small>
                </button>
              );
            })
          ) : (
            <div className="driver-empty-state">
              No deliveries assigned to you right now.
            </div>
          )}
        </aside>

        <section className="driver-delivery-panel">
          {selectedOrder && shipTo ? (
            <>
              <div className="driver-panel-header">
                <div>
                  <div className="driver-kicker">Order #{selectedOrder.orderNumber}</div>
                  <h2>{getClientName(state.clients, selectedOrder.clientId)}</h2>
                  <p>
                    <MapPin size={15} /> {formatAddress(shipTo)}
                  </p>
                </div>
                <div className="driver-status-card">
                  <span>Shipped</span>
                  <strong>Order #{selectedOrder.orderNumber}</strong>
                  <small>{formatDateTime(selectedOrder.shippedAt)}</small>
                </div>
              </div>

              <div className="driver-invoice-preview">
                <div className="driver-section-title">Items to deliver</div>
                {selectedOrder.items
                  .filter((item) => (item.invoiceQty ?? item.fulfilledQty) > 0)
                  .map((item) => {
                    const product = getProduct(state.products, item.productId);
                    const qty = item.invoiceQty ?? item.fulfilledQty;
                    const lotCodes = [
                      ...new Set(
                        item.assignedBatches.map((assigned) => {
                          const batch = state.batches.find((entry) => entry.id === assigned.batchId);
                          return normalizeLotCode(batch?.batchNumber ?? assigned.batchId);
                        })
                      ),
                    ]
                      .filter(Boolean)
                      .join(', ');

                    return (
                      <div className="driver-line-item" key={item.id}>
                        <div>
                          <strong>{getProductDisplayName(product)}</strong>
                          <span>{lotCodes || 'No lot assignment'}</span>
                        </div>
                        <div>
                          <strong>{qty.toLocaleString()} {qty === 1 ? 'unit' : 'units'}</strong>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {selectedOrder.podSignedAt ? (
                <div className="driver-pod-summary">
                  <div>
                    <div className="driver-section-title">Proof of Delivery</div>
                    <p>
                      Signed by <strong>{selectedOrder.podSignedBy}</strong> on {formatDateTime(selectedOrder.podSignedAt)}
                    </p>
                    <div style={{ display: 'grid', gap: 4, marginTop: 10, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                      <span>Local timestamp: {selectedOrder.podSignedAtLocal ?? formatDateTime(selectedOrder.podSignedAt)}</span>
                      <span>Unix timestamp: {selectedOrder.podSignedAtUnixMs ?? (selectedOrder.podSignedAt ? new Date(selectedOrder.podSignedAt).getTime() : '-')}</span>
                      <span>Timezone: {selectedOrder.podSignedTimezone ?? getDeliveryTimeZone(selectedLocation, shipTo)}</span>
                    </div>
                  </div>
                  {selectedOrder.podSignatureDataUrl ? (
                    <img src={selectedOrder.podSignatureDataUrl} alt="Saved proof of delivery signature" />
                  ) : null}
                </div>
              ) : (
                <form className="driver-pod-form" onSubmit={handleSavePod}>
                  <div className="driver-section-title">
                    <ClipboardSignature size={18} /> Capture POD Signature
                  </div>
                  <div className="form-group">
                    <label className="form-label">Received By</label>
                    <input
                      className="form-input"
                      value={signedBy}
                      onChange={(event) => setSignedBy(event.target.value)}
                      placeholder="Receiver name"
                      required
                    />
                  </div>
                  <SignaturePad onChange={setSignatureDataUrl} />
                  <div className="form-group">
                    <label className="form-label">Delivery Notes</label>
                    <textarea
                      className="form-input"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Optional notes"
                      rows={3}
                    />
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={saving}>
                    <ClipboardSignature size={16} /> {saving ? 'Saving POD...' : 'Save POD'}
                  </button>
                </form>
              )}

              <div className="driver-print-actions">
                {selectedOrder.podSignedAt ? (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() =>
                      printProofOfDelivery({
                        order: selectedOrder,
                        clients: state.clients,
                        locations: state.locations,
                        products: state.products,
                        batches: state.batches,
                      })
                    }
                  >
                    <Printer size={16} /> Print POD
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <div className="driver-empty-state">Select a shipped order to capture proof of delivery.</div>
          )}
        </section>
      </main>
    </div>
  );
}
