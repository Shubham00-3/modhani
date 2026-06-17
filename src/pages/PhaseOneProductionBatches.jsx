import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowDownUp, ArrowLeftRight, FlaskConical, Pencil, Plus, RotateCcw, Trash2, Undo2, X } from 'lucide-react';
import { useApp } from '../context/useApp';
import { useModalBehavior, handleOverlayClick } from '../hooks/useModalBehavior';
import { compareItemNumbers } from '../lib/productSort';
import { ALL_FACILITIES, FACILITIES, applyFacilityLotSuffix, getFacilityName, resolveFacilityId } from '../lib/facilities';
import {
  formatCaseQuantityBreakdown,
  formatDate,
  getActiveCatalogProducts,
  getItemOutstandingQty,
  getNextLotCode,
  getProduct,
  getProductDisplayName,
  isValidCaseQuantityStep,
  isProductCatalogActive,
  normalizeLotCode,
} from '../data/phaseOneData';

function getProductionProductFilterKey(product) {
  return getProductDisplayName(product).trim().toLowerCase();
}

export default function PhaseOneProductionBatches() {
  const { state, dispatch, addToast } = useApp();
  const selectedFacility = state.selectedFacility ?? ALL_FACILITIES;
  const showAllFacilities = selectedFacility === ALL_FACILITIES;
  // Transfers between factories are admin-only (manage_settings permission).
  const canTransfer = Boolean(state.currentUser?.permissions?.manageSettings);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeProducts = useMemo(() => getActiveCatalogProducts(state.products), [state.products]);
  const canLogProduction = activeProducts.length > 0;
  const [showModal, setShowModal] = useState(false);
  const [editingBatch, setEditingBatch] = useState(null);
  const [trashingBatch, setTrashingBatch] = useState(null);
  const [transferringBatch, setTransferringBatch] = useState(null);
  const [productFilter, setProductFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [sortDir, setSortDir] = useState('asc');
  const [showTrash, setShowTrash] = useState(false);
  const dashboardSearch = (searchParams.get('q') ?? '').trim().toLowerCase();

  // Active (non-trashed) vs trashed lots - soft-delete keeps the row but
  // sets deleted_at, so we split them by that flag.
  const activeBatches = state.batches.filter((b) => !b.deletedAt);
  const trashedBatches = state.batches.filter((b) => b.deletedAt);
  const productFilterOptions = useMemo(() => {
    const optionsByKey = new Map();
    const productIdsWithLots = new Set(activeBatches.map((batch) => batch.productId));
    state.products
      .filter((product) => isProductCatalogActive(product) || productIdsWithLots.has(product.id))
      .forEach((product) => {
        const label = getProductDisplayName(product);
        const key = getProductionProductFilterKey(product);
        if (!optionsByKey.has(key)) {
          optionsByKey.set(key, { key, label });
        }
      });

    return [...optionsByKey.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [activeBatches, state.products]);

  const filteredBatches = useMemo(() => {
    return activeBatches
      .filter((batch) => showAllFacilities || resolveFacilityId(batch.facilityId) === selectedFacility)
      .filter((batch) => {
        if (!productFilter) return true;
        return getProductionProductFilterKey(getProduct(state.products, batch.productId)) === productFilter;
      })
      .filter((batch) => (statusFilter ? batch.status === statusFilter : true))
      .filter((batch) => {
        if (!dashboardSearch) return true;
        const product = getProduct(state.products, batch.productId);
        return [
          batch.batchNumber,
          batch.status,
          batch.productionDate,
          batch.qtyProduced,
          batch.qtyRemaining,
          product ? getProductDisplayName(product) : '',
          product?.qbItemName,
          product?.category,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(dashboardSearch);
      })
      .sort((a, b) => {
        if (sortBy === 'item-number') {
          const aItem = getProduct(state.products, a.productId)?.itemNumber;
          const bItem = getProduct(state.products, b.productId)?.itemNumber;
          return compareItemNumbers(aItem, bItem, sortDir)
            || String(a.batchNumber ?? '').localeCompare(String(b.batchNumber ?? ''), undefined, { numeric: true });
        }
        if (sortBy === 'lot-code') {
          return compareItemNumbers(a.batchNumber, b.batchNumber, sortDir);
        }
        const bTime = new Date(b.updatedAt ?? b.productionDate).getTime();
        const aTime = new Date(a.updatedAt ?? a.productionDate).getTime();
        return bTime - aTime || String(b.batchNumber ?? '').localeCompare(String(a.batchNumber ?? ''));
      });
  }, [activeBatches, dashboardSearch, selectedFacility, showAllFacilities, sortDir, productFilter, sortBy, state.products, statusFilter]);
  const hasActiveFilters = Boolean(productFilter || statusFilter || dashboardSearch);

  const oldestActive = activeBatches
    .filter((batch) => batch.qtyRemaining > 0)
    .sort((a, b) => new Date(a.productionDate) - new Date(b.productionDate))[0];

  const outstandingByProduct = state.orders.flatMap((order) =>
    order.items
      .filter((item) => getItemOutstandingQty(item) > 0)
      .map((item) => ({
        productId: item.productId,
        orderNumber: order.orderNumber,
        outstandingQty: getItemOutstandingQty(item),
      }))
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Production &amp; Lots</h1>
          <p className="page-subtitle">Log production runs, manage lot codes, and monitor FIFO consumption.</p>
        </div>
      </div>

      {oldestActive ? (
        <div className="alert alert-warning section">
          <AlertTriangle size={18} />
          <div className="alert-content">
            <div className="alert-title">
              FIFO reminder: Lot Code {oldestActive.batchNumber} should be considered first.
            </div>
            <div className="alert-description">
              {getProductDisplayName(getProduct(state.products, oldestActive.productId))} has {oldestActive.qtyRemaining.toLocaleString()} units remaining from the oldest active lot.
            </div>
          </div>
        </div>
      ) : null}

      {outstandingByProduct.length ? (
        <div className="card section">
          <div className="card-title">Outstanding Demand Reminders</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {outstandingByProduct.map((entry, index) => (
              <div key={`${entry.orderNumber}-${entry.productId}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    Order #{entry.orderNumber} - {getProductDisplayName(getProduct(state.products, entry.productId))}
                  </div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                    Outstanding quantity will remain visible until staff manually assigns the next lot.
                  </div>
                </div>
                <div className="cell-monospace">{entry.outstandingQty.toLocaleString()} units</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', alignItems: 'center' }}>
          <div>
            <div className="card-title" style={{ marginBottom: 2 }}>Lot Inventory</div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Manual production logging creates inventory one lot at a time.
            </div>
          </div>
          <button className="btn btn-primary" type="button" disabled={!canLogProduction} onClick={() => setShowModal(true)}>
            <Plus size={16} /> Log Production
          </button>
        </div>

        {!canLogProduction ? (
          <div className="alert alert-warning" style={{ marginTop: 'var(--space-4)' }}>
            <AlertTriangle size={18} />
            <div className="alert-content">
              <div className="alert-title">Add products before logging production</div>
              <div className="alert-description">
                Production lots can only be created after the product catalogue has been configured.
              </div>
            </div>
          </div>
        ) : null}

        <div className="filter-bar">
          <select className="form-select" value={productFilter} onChange={(event) => setProductFilter(event.target.value)}>
            <option value="">All Products</option>
            {productFilterOptions.map((product) => (
              <option key={product.key} value={product.key}>
                {product.label}
              </option>
            ))}
          </select>

          <select className="form-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="cleared">Cleared</option>
          </select>
          <select aria-label="Sort by" title="Sort by" className="form-select" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="recent">Most Recent</option>
            <option value="item-number">Sort by Item Number</option>
            <option value="lot-code">Sort by Lot Code</option>
          </select>
          {sortBy === 'item-number' || sortBy === 'lot-code' ? (
            <button
              className="btn btn-secondary"
              type="button"
              title={sortDir === 'asc' ? 'Ascending (A-Z / low to high). Click for Z-A.' : 'Descending (Z-A / high to low). Click for A-Z.'}
              aria-label={`Toggle sort direction (currently ${sortDir === 'asc' ? 'ascending' : 'descending'})`}
              onClick={() => setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))}
            >
              <ArrowDownUp size={14} /> {sortDir === 'asc' ? 'A-Z' : 'Z-A'}
            </button>
          ) : null}
          <button
            className="btn btn-secondary"
            type="button"
            disabled={!hasActiveFilters && sortBy === 'recent' && sortDir === 'asc'}
            onClick={() => {
              setProductFilter('');
              setStatusFilter('');
              setSortBy('recent');
              setSortDir('asc');
              const nextSearchParams = new URLSearchParams(searchParams);
              nextSearchParams.delete('q');
              setSearchParams(nextSearchParams);
            }}
          >
            <RotateCcw size={14} /> Reset Filters
          </button>
        </div>

        {filteredBatches.length ? (
          <div className="table-scroll-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lot Code</th>
                  <th>Product</th>
                  <th>Factory</th>
                  <th>Production Date</th>
                  <th>Remaining</th>
                  <th>Status</th>
                  <th style={{ width: 110 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBatches.map((batch) => {
                  const batchProductName = getProductDisplayName(getProduct(state.products, batch.productId));
                  return (
                  <tr key={batch.id}>
                    <td className="cell-monospace cell-align-left">{batch.batchNumber}</td>
                    <td className="cell-truncate">
                      <span className="text-truncate" title={batchProductName}>{batchProductName}</span>
                    </td>
                    <td>{getFacilityName(resolveFacilityId(batch.facilityId))}</td>
                    <td>{formatDate(batch.productionDate)}</td>
                    <td className="cell-monospace cell-align-left">{batch.qtyRemaining.toLocaleString()}</td>
                    <td><span className={`badge badge-${batch.status}`}>{batch.status}</span></td>
                    <td>
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        {canTransfer && batch.status === 'active' && batch.qtyRemaining > 0 ? (
                          <button
                            className="um-icon-btn"
                            type="button"
                            title="Transfer to other factory"
                            aria-label={`Transfer lot ${batch.batchNumber} to the other factory`}
                            onClick={() => setTransferringBatch(batch)}
                          >
                            <ArrowLeftRight size={14} />
                          </button>
                        ) : null}
                        <button
                          className="um-icon-btn"
                          type="button"
                          title="Edit quantity"
                          aria-label={`Edit lot ${batch.batchNumber}`}
                          onClick={() => setEditingBatch(batch)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="um-icon-btn um-icon-btn-danger"
                          type="button"
                          title="Move to trash"
                          aria-label={`Move lot ${batch.batchNumber} to trash`}
                          onClick={() => setTrashingBatch(batch)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <div className="empty-state-title">No lots match these filters</div>
            <div className="empty-state-description">
              Reset the filters or log a new production lot to bring inventory back into view.
            </div>
          </div>
        )}
      </div>

      {/* Trash pane - collapsed by default, persists trashed lots */}
      <div className="card section" style={{ marginTop: 'var(--space-6)' }}>
        <button
          type="button"
          onClick={() => setShowTrash((v) => !v)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            background: 'transparent',
            border: 0,
            padding: 0,
            cursor: 'pointer',
          }}
        >
          <div className="card-title" style={{ margin: 0 }}>
            <Trash2 size={18} /> Trash
            <span
              style={{
                marginLeft: 8,
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                background: 'var(--color-bg-secondary, #f3f4f6)',
                color: 'var(--color-text-muted)',
                borderRadius: 999,
              }}
            >
              {trashedBatches.length}
            </span>
          </div>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
            {showTrash ? 'Hide' : 'Show'}
          </span>
        </button>

        {showTrash ? (
          trashedBatches.length === 0 ? (
            <div style={{ padding: 'var(--space-4) 0', color: 'var(--color-text-muted)', fontSize: 13 }}>
              No trashed lots. Deleted production entries appear here and can be restored.
            </div>
          ) : (
            <div className="table-scroll-wrapper" style={{ marginTop: 'var(--space-3)' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Lot Code</th>
                    <th>Product</th>
                    <th>Production Date</th>
                    <th>Trashed At</th>
                    <th>Reason</th>
                    <th style={{ width: 110 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {trashedBatches.map((batch) => {
                    const trashedProductName = getProductDisplayName(getProduct(state.products, batch.productId));
                    return (
                    <tr key={batch.id} style={{ opacity: 0.78 }}>
                      <td className="cell-monospace cell-align-left">{batch.batchNumber}</td>
                      <td className="cell-truncate">
                        <span className="text-truncate" title={trashedProductName}>{trashedProductName}</span>
                      </td>
                      <td>{formatDate(batch.productionDate)}</td>
                      <td>{batch.deletedAt ? formatDate(batch.deletedAt) : '-'}</td>
                      <td style={{ color: 'var(--color-text-muted)' }}>{batch.deletedReason || '-'}</td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          onClick={async () => {
                            const ok = window.confirm(
                              `Restore lot ${batch.batchNumber} from trash?`
                            );
                            if (!ok) return;
                            const result = await dispatch({
                              type: 'RESTORE_BATCH',
                              payload: { id: batch.id },
                            });
                            if (result?.ok) addToast(`Lot ${batch.batchNumber} restored.`);
                          }}
                        >
                          <Undo2 size={14} /> Restore
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>

      {showModal ? (
        <LogProductionModal
          onClose={() => setShowModal(false)}
          onSave={async (payload) => {
            const result = await dispatch({ type: 'LOG_PRODUCTION_BATCH', payload });
            if (!result?.ok) return;
            const shortfalls = result.data?.shortfalls ?? [];
            if (shortfalls.length) {
              const summary = shortfalls
                .map((s) => `${s.material_name} (short ${Number(s.short_qty).toLocaleString()} ${s.unit ?? ''})`.trim())
                .join(', ');
              addToast(`Lot ${payload.batchNumber} logged, but stock ran short: ${summary}. Receive more material.`, 'warning');
            } else {
              addToast(`Lot Code ${payload.batchNumber} logged.`);
            }
            setShowModal(false);
          }}
        />
      ) : null}

      {editingBatch ? (
        <EditBatchModal
          batch={editingBatch}
          products={state.products}
          onClose={() => setEditingBatch(null)}
          onSave={async ({ qtyProduced, reason }) => {
            const result = await dispatch({
              type: 'EDIT_PRODUCTION_BATCH',
              payload: { id: editingBatch.id, qtyProduced, reason },
            });
            if (result?.ok) {
              addToast(`Lot ${editingBatch.batchNumber} updated.`);
              setEditingBatch(null);
            }
          }}
        />
      ) : null}

      {trashingBatch ? (
        <TrashBatchModal
          batch={trashingBatch}
          onClose={() => setTrashingBatch(null)}
          onConfirm={async ({ reason }) => {
            const result = await dispatch({
              type: 'SOFT_DELETE_BATCH',
              payload: { id: trashingBatch.id, reason },
            });
            if (result?.ok) {
              addToast(`Lot ${trashingBatch.batchNumber} moved to trash.`);
              setTrashingBatch(null);
            }
          }}
        />
      ) : null}

      {transferringBatch ? (
        <TransferStockModal
          batch={transferringBatch}
          products={state.products}
          onClose={() => setTransferringBatch(null)}
          onConfirm={async ({ toFacility, qty, reason }) => {
            const result = await dispatch({
              type: 'TRANSFER_STOCK',
              payload: { batchId: transferringBatch.id, toFacility, qty, reason },
            });
            if (result?.ok) {
              addToast(
                `Transferred ${qty.toLocaleString()} of lot ${transferringBatch.batchNumber} to ${getFacilityName(toFacility)}.`
              );
              setTransferringBatch(null);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function TransferStockModal({ batch, products, onClose, onConfirm }) {
  useModalBehavior(onClose);
  const product = getProduct(products, batch.productId);
  const available = Number(batch.qtyRemaining ?? 0);
  // Destination = the factory the lot is NOT currently in. With two factories
  // it's unambiguous; if more are added later this becomes a real choice.
  const destinations = FACILITIES.filter((facility) => facility.id !== resolveFacilityId(batch.facilityId));
  const [toFacility, setToFacility] = useState(destinations[0]?.id ?? '');
  const [qty, setQty] = useState(String(available));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const quantityBreakdown = formatCaseQuantityBreakdown(product, qty);

  async function handleSubmit(event) {
    event.preventDefault();
    const numericQty = Number(qty);
    if (!toFacility) {
      window.alert('Choose a destination factory.');
      return;
    }
    if (!Number.isFinite(numericQty) || numericQty <= 0) {
      window.alert('Enter a quantity greater than zero.');
      return;
    }
    if (numericQty > available) {
      window.alert(`Only ${available.toLocaleString()} units are available to transfer.`);
      return;
    }
    if (numericQty > 0 && !isValidCaseQuantityStep(numericQty)) {
      window.alert('Transfer quantity can use up to 2 decimal places.');
      return;
    }
    if (!reason.trim()) {
      window.alert('Enter a reason for this transfer.');
      return;
    }
    setSaving(true);
    await onConfirm({ toFacility, qty: numericQty, reason: reason.trim() });
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick(onClose)}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            <ArrowLeftRight size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Transfer Lot {batch.batchNumber}
          </h3>
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>
            <X size={18} />
          </button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <p style={{ marginTop: 0, color: 'var(--color-text-secondary)', fontSize: 14 }}>
            Moving units of <strong>{getProductDisplayName(product)}</strong> from{' '}
            <strong>{getFacilityName(resolveFacilityId(batch.facilityId))}</strong>. The lot code stays the same
            (it identifies where the lot was made); only the stock location changes.
          </p>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">From</label>
              <input className="form-input" value={getFacilityName(resolveFacilityId(batch.facilityId))} disabled />
            </div>
            <div className="form-group">
              <label className="form-label">To factory</label>
              <select
                className="form-select"
                value={toFacility}
                onChange={(event) => setToFacility(event.target.value)}
              >
                {destinations.map((facility) => (
                  <option key={facility.id} value={facility.id}>
                    {facility.name} ({facility.code})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Quantity to transfer</label>
            <input
              className="form-input"
              type="number"
              min="0.01"
              step="0.01"
              max={available}
              value={qty}
              onChange={(event) => setQty(event.target.value)}
              required
              autoFocus
            />
            <div className="form-hint">
              {available.toLocaleString()} available at {getFacilityName(resolveFacilityId(batch.facilityId))}.
              {quantityBreakdown ? ` ${quantityBreakdown}` : ''}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 'var(--space-2)', alignSelf: 'flex-start' }}
              onClick={() => setQty(String(available))}
            >
              Transfer all {available.toLocaleString()}
            </button>
          </div>
          <div className="form-group">
            <label className="form-label">Reason (required)</label>
            <input
              className="form-input"
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Rebalancing stock for Tillsonburg orders"
              required
            />
            <div className="form-hint">
              A reason is required for every transfer. It is kept on the audit trail.
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={saving || !toFacility}>
              {saving ? 'Transferring...' : 'Transfer Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditBatchModal({ batch, products, onClose, onSave }) {
  useModalBehavior(onClose);
  const [qty, setQty] = useState(String(batch.qtyProduced));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const product = getProduct(products, batch.productId);
  const quantityBreakdown = formatCaseQuantityBreakdown(product, qty);
  const isZeroing = Number(qty) === 0;

  async function handleSubmit(event) {
    event.preventDefault();
    const numericQty = Number(qty);
    if (!Number.isFinite(numericQty) || numericQty < 0) {
      window.alert('Enter a quantity of zero or more.');
      return;
    }
    // Zero is valid (e.g. moved between locations / sold internally); the
    // 2-decimal step rule only applies to positive quantities.
    if (numericQty > 0 && !isValidCaseQuantityStep(numericQty)) {
      window.alert('Production quantity can use up to 2 decimal places.');
      return;
    }
    if (!reason.trim()) {
      window.alert('Enter a reason for changing this production quantity.');
      return;
    }
    if (numericQty === batch.qtyProduced) {
      window.alert('Quantity is unchanged.');
      return;
    }
    const ok = window.confirm(
      numericQty === 0
        ? `Set lot ${batch.batchNumber} to zero units? The lot stays on record (cleared, not trashed) with your reason.`
        : `Update lot ${batch.batchNumber} from ${batch.qtyProduced.toLocaleString()} to ${numericQty.toLocaleString()} cases?`
    );
    if (!ok) return;
    setSaving(true);
    await onSave({ qtyProduced: numericQty, reason: reason.trim() });
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick(onClose)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Edit Lot {batch.batchNumber}</h3>
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>
            <X size={18} />
          </button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Case Quantity Produced</label>
            <input
              className="form-input"
              type="number"
              min="0"
              step="0.01"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              required
              autoFocus
            />
            <div className="form-hint">
              Quantity can be zero or more. Negative quantities are not allowed.
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 'var(--space-2)', alignSelf: 'flex-start' }}
              onClick={() => setQty('0')}
              disabled={isZeroing}
            >
              Set to zero (moved / internal use)
            </button>
            {quantityBreakdown ? <div className="form-hint">{quantityBreakdown}</div> : null}
          </div>
          <div className="form-group">
            <label className="form-label">
              Reason (required)
            </label>
            <input
              className="form-input"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Correcting initial mis-entry / moved to Brampton location / internal use"
              required
            />
            <div className="form-hint">
              A reason is required for every production quantity change. Setting production to zero keeps the lot on record (cleared, not trashed).
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TrashBatchModal({ batch, onClose, onConfirm }) {
  useModalBehavior(onClose);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!reason.trim()) {
      window.alert('Enter a reason for moving this lot to trash.');
      return;
    }
    setSaving(true);
    await onConfirm({ reason: reason.trim() });
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick(onClose)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Move Lot {batch.batchNumber} to Trash?</h3>
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>
            <X size={18} />
          </button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <p style={{ marginTop: 0, color: 'var(--color-text-secondary)', fontSize: 14 }}>
            This lot will be hidden from the active inventory but kept on record
            for audit purposes. You can restore it from the Trash pane at the
            bottom of the page. If the lot is currently assigned to active
            orders, this will be blocked.
          </p>
          <div className="form-group">
            <label className="form-label">Reason (required)</label>
            <input
              className="form-input"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Spoiled, mis-entered, recalled"
              required
              autoFocus
            />
            <div className="form-hint">
              A reason is required for every lot moved to trash. It is kept on the audit trail.
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={saving || !reason.trim()}>
              {saving ? 'Moving...' : 'Move to Trash'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LogProductionModal({ onClose, onSave }) {
  useModalBehavior(onClose);
  const { state, addToast } = useApp();
  const activeProducts = useMemo(() => getActiveCatalogProducts(state.products), [state.products]);
  const [productId, setProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [isProductSearchFocused, setIsProductSearchFocused] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [productionDate, setProductionDate] = useState(new Date().toISOString().slice(0, 10));
  // Default to the factory the topbar is scoped to (if any), else the first.
  const defaultFacility =
    state.selectedFacility && state.selectedFacility !== ALL_FACILITIES
      ? state.selectedFacility
      : FACILITIES[0].id;
  const [facilityId, setFacilityId] = useState(defaultFacility);
  const [lotCode, setLotCode] = useState(() =>
    applyFacilityLotSuffix(getNextLotCode(state.batches, productionDate), defaultFacility)
  );
  const [isSaving, setIsSaving] = useState(false);
  const selectedProduct = getProduct(state.products, productId);

  // Re-derive the lot code from the production date and append the factory
  // suffix (e.g. 26167-BR) whenever the date or facility changes.
  useEffect(() => {
    setLotCode(applyFacilityLotSuffix(getNextLotCode(state.batches, productionDate), facilityId));
  }, [productionDate, state.batches, facilityId]);

  const filteredProducts = useMemo(() => {
    const search = productSearch.trim().toLowerCase();
    if (!search) return activeProducts;

    return activeProducts
      .filter((product) => {
        const haystack = [
          product.name,
          product.unitSize,
          product.category,
          product.itemNumber,
          product.orderUnitLabel,
          product.packagingDetails,
          getProductDisplayName(product),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(search);
      });
  }, [activeProducts, productSearch]);
  const productSuggestions = filteredProducts.slice(0, 50);
  const showProductSuggestions = isProductSearchFocused && !productId;
  const getProductMeta = (product) =>
    [
      product.itemNumber ? `Item #${product.itemNumber}` : '',
      product.orderUnitLabel || product.packagingDetails || product.category || '',
    ].filter(Boolean).join(' - ');

  return (
    <div className="modal-overlay" onClick={handleOverlayClick(onClose)}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            <FlaskConical size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Log Production Lot
          </h3>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Product</label>
            <input
              className="form-input"
              value={productSearch}
              onChange={(event) => {
                setProductSearch(event.target.value);
                setProductId('');
              }}
              onFocus={() => setIsProductSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setIsProductSearchFocused(false), 120)}
              placeholder="Search products..."
              style={{ marginBottom: 'var(--space-2)' }}
            />
            {showProductSuggestions ? (
              <div
                className="production-product-menu"
              >
                {productSuggestions.length ? (
                  productSuggestions.map((product) => (
                    <button
                      key={product.id}
                      className="production-product-option"
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setProductId(product.id);
                        setProductSearch(getProductDisplayName(product));
                        setIsProductSearchFocused(false);
                      }}
                    >
                      <span className="production-product-option-name">
                        {getProductDisplayName(product)}
                      </span>
                      {getProductMeta(product) ? (
                        <span className="production-product-option-meta">
                          {getProductMeta(product)}
                        </span>
                      ) : null}
                    </button>
                  ))
                ) : (
                  <div style={{ padding: 'var(--space-3)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                    No products match this search.
                  </div>
                )}
              </div>
            ) : null}
            {selectedProduct ? (
              <div style={{ marginTop: 'var(--space-2)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                Selected: <strong style={{ color: 'var(--color-text-primary)' }}>{getProductDisplayName(selectedProduct)}</strong>
              </div>
            ) : null}
          </div>
          <div className="form-group">
            <label className="form-label">Factory</label>
            <select
              className="form-select"
              value={facilityId}
              onChange={(event) => setFacilityId(event.target.value)}
            >
              {FACILITIES.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.name} ({facility.code})
                </option>
              ))}
            </select>
            <div style={{ marginTop: 'var(--space-2)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              The factory that ran this production. Appended to the lot code for traceability.
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Lot Code</label>
              <input className="form-input" value={lotCode} onChange={(event) => setLotCode(event.target.value)} />
              <div style={{ marginTop: 'var(--space-2)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                Auto-filled from the production date and factory ({getFacilityName(facilityId)}). Staff can override it when needed.
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Production Date</label>
              <input className="form-input" type="date" value={productionDate} onChange={(event) => setProductionDate(event.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Case Quantity Produced</label>
            <input className="form-input" type="number" min="0.01" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            {selectedProduct && quantity ? (
              <div className="form-hint">{formatCaseQuantityBreakdown(selectedProduct, quantity)}</div>
            ) : null}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={isSaving}
            onClick={async () => {
              if (isSaving) return;

              const numericQuantity = Number(quantity);
              if (!productId || !Number.isFinite(numericQuantity) || numericQuantity <= 0 || !lotCode.trim()) {
                addToast('Complete all production fields.', 'warning');
                return;
              }

              if (!isValidCaseQuantityStep(numericQuantity)) {
                addToast('Production quantity can use up to 2 decimal places.', 'warning');
                return;
              }

              if (productionDate > new Date().toISOString().slice(0, 10)) {
                addToast('Production date cannot be in the future.', 'warning');
                return;
              }

              setIsSaving(true);
              try {
                await onSave({
                  id: `batch-${Date.now()}`,
                  batchNumber: normalizeLotCode(lotCode),
                  productId,
                  productionDate,
                  qtyProduced: numericQuantity,
                  qtyRemaining: numericQuantity,
                  status: 'active',
                  facilityId,
                });
              } finally {
                setIsSaving(false);
              }
            }}
          >
            {isSaving ? 'Logging...' : 'Log Production'}
          </button>
        </div>
      </div>
    </div>
  );
}
