import { useMemo, useState } from 'react';
import { AlertTriangle, Boxes, PackagePlus, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useApp } from '../context/useApp';
import { useModalBehavior, handleOverlayClick } from '../hooks/useModalBehavior';
import { formatDate } from '../data/phaseOneData';
import { ALL_FACILITIES, FACILITIES, getFacilityName, resolveFacilityId } from '../lib/facilities';

const MATERIAL_TYPES = [
  { value: 'raw', label: 'Raw material' },
  { value: 'packaging', label: 'Packaging' },
];
const MATERIAL_UNITS = ['kg', 'L', 'each'];
// Lots within this many days of their expiry date raise a warning.
const EXPIRY_WARN_DAYS = 14;

function getMaterialTypeLabel(type) {
  return MATERIAL_TYPES.find((t) => t.value === type)?.label ?? type;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target - today) / 86400000);
}

export default function PhaseOneMaterials() {
  const { state, dispatch, addToast } = useApp();
  const selectedFacility = state.selectedFacility ?? ALL_FACILITIES;
  const showAllFacilities = selectedFacility === ALL_FACILITIES;
  const canManageCatalog = Boolean(state.currentUser?.permissions?.manageSettings);

  const materials = useMemo(() => state.materials ?? [], [state.materials]);
  const materialLots = useMemo(() => state.materialLots ?? [], [state.materialLots]);

  const [editingMaterial, setEditingMaterial] = useState(null);
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [trashingLot, setTrashingLot] = useState(null);
  const [typeFilter, setTypeFilter] = useState('');

  // Stock on hand per material (active, non-trashed lots), scoped to the
  // selected factory when the topbar is filtered.
  const materialRows = useMemo(() => {
    return materials
      .filter((material) => (typeFilter ? material.type === typeFilter : true))
      .map((material) => {
        const lots = materialLots.filter(
          (lot) =>
            lot.materialId === material.id &&
            !lot.deletedAt &&
            (showAllFacilities || resolveFacilityId(lot.facilityId) === selectedFacility)
        );
        const onHand = lots.reduce((sum, lot) => sum + Number(lot.qtyRemaining ?? 0), 0);
        const activeLots = lots.filter((lot) => lot.status === 'active' && lot.qtyRemaining > 0);
        const isLow = material.lowStockThreshold != null && onHand <= Number(material.lowStockThreshold);
        return { material, lots, onHand, activeLots, isLow };
      })
      .sort((a, b) => a.material.name.localeCompare(b.material.name));
  }, [materials, materialLots, selectedFacility, showAllFacilities, typeFilter]);

  // Flat list of received lots (the receiving log) for the lots table.
  const lotRows = useMemo(() => {
    return materialLots
      .filter((lot) => !lot.deletedAt)
      .filter((lot) => (showAllFacilities ? true : resolveFacilityId(lot.facilityId) === selectedFacility))
      .map((lot) => ({
        ...lot,
        material: materials.find((m) => m.id === lot.materialId) ?? null,
        expiryDays: daysUntil(lot.expiryDate),
      }))
      .sort((a, b) => new Date(b.receivedDate) - new Date(a.receivedDate));
  }, [materialLots, materials, selectedFacility, showAllFacilities]);

  const lowStockCount = materialRows.filter((row) => row.isLow && row.onHand >= 0).length;
  const expiringLots = lotRows.filter((lot) => lot.expiryDays != null && lot.expiryDays <= EXPIRY_WARN_DAYS);

  const canReceive = materials.some((m) => m.isActive);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Boxes size={26} /> Materials
          </h1>
          <p className="page-subtitle">Raw materials &amp; packaging — receiving, stock on hand, and supplier lots.</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {canManageCatalog ? (
            <button className="btn btn-secondary" type="button" onClick={() => { setEditingMaterial(null); setShowMaterialForm(true); }}>
              <Plus size={16} /> Add Material
            </button>
          ) : null}
          <button className="btn btn-primary" type="button" disabled={!canReceive} onClick={() => setShowReceive(true)}>
            <PackagePlus size={16} /> Add Receiving
          </button>
        </div>
      </div>

      {!materials.length ? (
        <div className="alert alert-warning section">
          <AlertTriangle size={18} />
          <div className="alert-content">
            <div className="alert-title">No materials yet</div>
            <div className="alert-description">
              {canManageCatalog
                ? 'Add a raw material or packaging item to the catalog, then log a receiving to start tracking stock.'
                : 'An admin needs to add materials to the catalog before receiving can be logged.'}
            </div>
          </div>
        </div>
      ) : null}

      {(lowStockCount > 0 || expiringLots.length > 0) ? (
        <div className="alert alert-warning section">
          <AlertTriangle size={18} />
          <div className="alert-content">
            <div className="alert-title">
              {lowStockCount > 0 ? `${lowStockCount} material${lowStockCount === 1 ? '' : 's'} running low` : ''}
              {lowStockCount > 0 && expiringLots.length > 0 ? ' · ' : ''}
              {expiringLots.length > 0 ? `${expiringLots.length} lot${expiringLots.length === 1 ? '' : 's'} near/at expiry` : ''}
            </div>
            <div className="alert-description">
              Check the stock and lot tables below. Expiry window is {EXPIRY_WARN_DAYS} days.
            </div>
          </div>
        </div>
      ) : null}

      {/* Stock on hand */}
      <div className="card section">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', alignItems: 'center' }}>
          <div>
            <div className="card-title">Stock on Hand</div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Remaining quantity per material{showAllFacilities ? ' (all locations)' : ` at ${getFacilityName(selectedFacility)}`}.
            </div>
          </div>
          <select aria-label="Filter by type" className="form-select" style={{ maxWidth: 200 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All Types</option>
            {MATERIAL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {materialRows.length ? (
          <div className="table-scroll-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Type</th>
                  <th>Supplier</th>
                  <th>On Hand</th>
                  <th>Active Lots</th>
                  <th>Status</th>
                  {canManageCatalog ? <th style={{ width: 70 }}>Edit</th> : null}
                </tr>
              </thead>
              <tbody>
                {materialRows.map(({ material, onHand, activeLots, isLow }) => (
                  <tr key={material.id}>
                    <td className="cell-truncate"><span className="text-truncate" title={material.name}>{material.name}</span></td>
                    <td>{getMaterialTypeLabel(material.type)}</td>
                    <td className="cell-truncate"><span className="text-truncate" title={material.supplier}>{material.supplier || '-'}</span></td>
                    <td className="cell-monospace cell-align-left">{onHand.toLocaleString()} {material.unit}</td>
                    <td className="cell-monospace cell-align-left">{activeLots.length}</td>
                    <td>
                      {!material.isActive ? (
                        <span className="badge badge-cleared">Inactive</span>
                      ) : isLow ? (
                        <span className="badge badge-partial">Running low</span>
                      ) : (
                        <span className="badge badge-fulfilled">In stock</span>
                      )}
                    </td>
                    {canManageCatalog ? (
                      <td>
                        <button className="um-icon-btn" type="button" title="Edit material" aria-label={`Edit ${material.name}`} onClick={() => { setEditingMaterial(material); setShowMaterialForm(true); }}>
                          <Pencil size={14} />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <Boxes size={32} />
            <div className="empty-state-title">No materials match this filter</div>
            <div className="empty-state-description">Reset the type filter or add materials to the catalog.</div>
          </div>
        )}
      </div>

      {/* Received lots */}
      <div className="card">
        <div className="card-title">Received Lots</div>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-3)' }}>
          Every incoming delivery, with its supplier lot code — the basis for traceability.
        </div>
        {lotRows.length ? (
          <div className="table-scroll-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Supplier Lot</th>
                  <th>Material</th>
                  <th>Factory</th>
                  <th>Received</th>
                  <th>Remaining</th>
                  <th>Expiry</th>
                  <th style={{ width: 70 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {lotRows.map((lot) => (
                  <tr key={lot.id}>
                    <td className="cell-monospace cell-align-left">{lot.supplierLotCode}</td>
                    <td className="cell-truncate"><span className="text-truncate" title={lot.material?.name}>{lot.material?.name ?? 'Unknown'}</span></td>
                    <td>{getFacilityName(resolveFacilityId(lot.facilityId))}</td>
                    <td>{formatDate(lot.receivedDate)}</td>
                    <td className="cell-monospace cell-align-left">
                      {Number(lot.qtyRemaining).toLocaleString()} {lot.material?.unit ?? ''}
                    </td>
                    <td>
                      {lot.expiryDate ? (
                        <span className={lot.expiryDays != null && lot.expiryDays <= EXPIRY_WARN_DAYS ? 'badge badge-declined' : ''}>
                          {formatDate(lot.expiryDate)}
                          {lot.expiryDays != null && lot.expiryDays < 0 ? ' (expired)' : ''}
                        </span>
                      ) : '-'}
                    </td>
                    <td>
                      <button className="um-icon-btn um-icon-btn-danger" type="button" title="Trash lot" aria-label={`Trash lot ${lot.supplierLotCode}`} onClick={() => setTrashingLot(lot)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <div className="empty-state-title">No received lots yet</div>
            <div className="empty-state-description">Use “Add Receiving” to log an incoming supplier delivery.</div>
          </div>
        )}
      </div>

      {showMaterialForm ? (
        <MaterialFormModal
          material={editingMaterial}
          onClose={() => { setShowMaterialForm(false); setEditingMaterial(null); }}
          onSave={async (payload) => {
            const result = await dispatch({ type: 'UPSERT_MATERIAL', payload });
            if (result?.ok) {
              addToast(`Material ${payload.name} saved.`);
              setShowMaterialForm(false);
              setEditingMaterial(null);
            }
          }}
        />
      ) : null}

      {showReceive ? (
        <ReceiveMaterialModal
          materials={materials.filter((m) => m.isActive)}
          defaultFacility={!showAllFacilities ? selectedFacility : FACILITIES[0].id}
          onClose={() => setShowReceive(false)}
          onSave={async (payload) => {
            const result = await dispatch({ type: 'RECEIVE_MATERIAL', payload });
            if (result?.ok) {
              addToast(`Received ${payload.qty} into lot ${payload.supplierLotCode}.`);
              setShowReceive(false);
            }
          }}
        />
      ) : null}

      {trashingLot ? (
        <TrashLotModal
          lot={trashingLot}
          onClose={() => setTrashingLot(null)}
          onConfirm={async ({ reason }) => {
            const result = await dispatch({ type: 'SOFT_DELETE_MATERIAL_LOT', payload: { id: trashingLot.id, reason } });
            if (result?.ok) {
              addToast(`Lot ${trashingLot.supplierLotCode} trashed.`);
              setTrashingLot(null);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function MaterialFormModal({ material, onClose, onSave }) {
  useModalBehavior(onClose);
  const [name, setName] = useState(material?.name ?? '');
  const [type, setType] = useState(material?.type ?? 'raw');
  const [unit, setUnit] = useState(material?.unit ?? 'kg');
  const [supplier, setSupplier] = useState(material?.supplier ?? '');
  const [lowStock, setLowStock] = useState(material?.lowStockThreshold ?? '');
  const [isActive, setIsActive] = useState(material?.isActive !== false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!name.trim()) { window.alert('Material name is required.'); return; }
    setSaving(true);
    await onSave({
      id: material?.id ?? `material-${Date.now()}`,
      name: name.trim(),
      type,
      unit,
      supplier: supplier.trim() || null,
      lowStockThreshold: lowStock === '' ? null : Number(lowStock),
      isActive,
    });
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick(onClose)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{material ? 'Edit Material' : 'Add Material'}</h3>
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}><X size={18} /></button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Name</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dahi cap (lid), Buffalo milk" required autoFocus />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
                {MATERIAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Unit</label>
              <select className="form-select" value={unit} onChange={(e) => setUnit(e.target.value)}>
                {MATERIAL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Supplier (optional)</label>
              <input className="form-input" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Supplier name" />
            </div>
            <div className="form-group">
              <label className="form-label">Low-stock threshold (optional)</label>
              <input className="form-input" type="number" min="0" step="0.01" value={lowStock} onChange={(e) => setLowStock(e.target.value)} placeholder="Alert when at/below" />
            </div>
          </div>
          {material ? (
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Active (available for receiving)
              </label>
            </div>
          ) : null}
          <div className="modal-footer">
            <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Material'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReceiveMaterialModal({ materials, defaultFacility, onClose, onSave }) {
  useModalBehavior(onClose);
  const [materialId, setMaterialId] = useState(materials[0]?.id ?? '');
  const [supplierLotCode, setSupplierLotCode] = useState('');
  const [facilityId, setFacilityId] = useState(defaultFacility);
  const [qty, setQty] = useState('');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [saving, setSaving] = useState(false);
  const material = materials.find((m) => m.id === materialId);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!materialId) { window.alert('Choose a material.'); return; }
    if (!supplierLotCode.trim()) { window.alert('Supplier lot code is required.'); return; }
    const numericQty = Number(qty);
    if (!Number.isFinite(numericQty) || numericQty <= 0) { window.alert('Enter a quantity greater than zero.'); return; }
    if (receivedDate > new Date().toISOString().slice(0, 10)) { window.alert('Received date cannot be in the future.'); return; }
    setSaving(true);
    await onSave({
      id: `mlot-${Date.now()}`,
      materialId,
      supplierLotCode: supplierLotCode.trim(),
      facilityId,
      qty: numericQty,
      receivedDate,
      expiryDate: expiryDate || null,
      unitCost: unitCost === '' ? null : Number(unitCost),
    });
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick(onClose)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            <PackagePlus size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Add Receiving
          </h3>
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}><X size={18} /></button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Material</label>
            <select className="form-select" value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
              {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
            </select>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Supplier Lot Code</label>
              <input className="form-input" value={supplierLotCode} onChange={(e) => setSupplierLotCode(e.target.value)} placeholder="e.g. truck lot 001 / milk 5579" required autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Factory</label>
              <select className="form-select" value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
                {FACILITIES.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.code})</option>)}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Quantity {material ? `(${material.unit})` : ''}</label>
              <input className="form-input" type="number" min="0.01" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Received Date</label>
              <input className="form-input" type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Expiry Date (optional)</label>
              <input className="form-input" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Unit Cost (optional)</label>
              <input className="form-input" type="number" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="Per unit" />
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Receiving...' : 'Log Receiving'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TrashLotModal({ lot, onClose, onConfirm }) {
  useModalBehavior(onClose);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!reason.trim()) { window.alert('Enter a reason for trashing this lot.'); return; }
    setSaving(true);
    await onConfirm({ reason: reason.trim() });
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick(onClose)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Trash Lot {lot.supplierLotCode}?</h3>
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}><X size={18} /></button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <p style={{ marginTop: 0, color: 'var(--color-text-secondary)', fontSize: 14 }}>
            This removes the lot from stock but keeps it on record for audit. A reason is required.
          </p>
          <div className="form-group">
            <label className="form-label">Reason (required)</label>
            <input className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Spoiled, mis-entered, recalled" required autoFocus />
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={saving || !reason.trim()}>{saving ? 'Trashing...' : 'Trash Lot'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
