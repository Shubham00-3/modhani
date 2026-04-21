import { useState } from 'react';
import { useApp } from '../context/useApp';
import { getProductDisplayName, formatDate } from '../data/seedData';
import { Play, AlertTriangle, TriangleAlert, Plus, X, FlaskConical } from 'lucide-react';

export default function ProductionBatches() {
  const { state, dispatch, addToast, addAudit } = useApp();
  const { batches, products, orders } = state;
  const [showLogModal, setShowLogModal] = useState(false);
  const [filterProduct, setFilterProduct] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Active production (latest batch)
  const latestBatch = [...batches].sort((a, b) => new Date(b.productionDate) - new Date(a.productionDate))[0];
  const latestProduct = products.find(p => p.id === latestBatch?.productId);

  // FIFO alerts — oldest active batches
  const oldestActive = batches
    .filter(b => b.status === 'active' && b.qtyRemaining > 0)
    .sort((a, b) => new Date(a.productionDate) - new Date(b.productionDate));
  const fifoAlert = oldestActive[0];
  const fifoProduct = fifoAlert ? products.find(p => p.id === fifoAlert.productId) : null;

  // Low stock
  const lowStockBatches = batches.filter(b => b.status === 'active' && b.qtyRemaining > 0 && b.qtyRemaining <= 150);
  const lowStockBatch = lowStockBatches[0];
  const lowStockProduct = lowStockBatch ? products.find(p => p.id === lowStockBatch.productId) : null;

  // Filtered batch table
  let displayBatches = [...batches].sort((a, b) => new Date(b.productionDate) - new Date(a.productionDate));
  if (filterProduct) displayBatches = displayBatches.filter(b => b.productId === filterProduct);
  if (filterStatus) displayBatches = displayBatches.filter(b => b.status === filterStatus);

  // Find assigned order for a batch
  const findAssignedOrder = (batchId) => {
    for (const order of orders) {
      for (const item of order.items) {
        if (item.assignedBatches.some(ab => ab.batchId === batchId)) {
          return order;
        }
      }
    }
    return null;
  };

  return (
    <div>
      {/* Production Banner */}
      {latestBatch && latestProduct && (
        <div className="production-banner section">
          <div className="production-banner-label">
            <Play size={12} /> Production Line 1 — ACTIVE
          </div>
          <div className="production-banner-product">{getProductDisplayName(latestProduct)}</div>
          <div className="production-banner-meta">
            Batch: {latestBatch.batchNumber} &nbsp;|&nbsp; Started: 8:00 AM &nbsp;|&nbsp; Est. Complete: 1:00 PM
          </div>
          <div className="production-banner-stats">
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              border: '4px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--color-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-accent)',
            }}>
              {latestBatch.qtyProduced > 0 ? Math.round(((latestBatch.qtyProduced - latestBatch.qtyRemaining) / latestBatch.qtyProduced) * 100) : 0}%
            </div>
            <div className="production-stat">
              <div className="production-stat-value">{(latestBatch.qtyProduced - latestBatch.qtyRemaining).toLocaleString()}</div>
              <div className="production-stat-label">Produced</div>
            </div>
            <div className="production-stat">
              <div className="production-stat-value">{latestBatch.qtyProduced.toLocaleString()}</div>
              <div className="production-stat-label">Target</div>
            </div>
            <div className="production-stat">
              <div className="production-stat-value">{latestBatch.qtyRemaining.toLocaleString()}</div>
              <div className="production-stat-label">Remaining</div>
            </div>
          </div>
        </div>
      )}

      {/* FIFO Alerts */}
      <div className="section" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {fifoAlert && fifoProduct && (
          <div className="alert alert-warning" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
              <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
              <div className="alert-content">
                <div className="alert-title">FIFO Alert — Batch {fifoAlert.batchNumber} ({getProductDisplayName(fifoProduct)}) has {fifoAlert.qtyRemaining.toLocaleString()} units remaining.</div>
                <div className="alert-description">Oldest batch — assign to next outbound order first.</div>
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }}>Assign to Order →</button>
          </div>
        )}

        {lowStockBatch && lowStockProduct && (
          <div className="alert alert-error" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
              <TriangleAlert size={20} style={{ flexShrink: 0, marginTop: 2 }} />
              <div className="alert-content">
                <div className="alert-title">Low Production Stock — {getProductDisplayName(lowStockProduct)}: only {lowStockBatch.qtyRemaining} units available.</div>
                <div className="alert-description">Schedule a new production run before next order.</div>
              </div>
            </div>
            <button className="btn btn-primary btn-sm" style={{ flexShrink: 0 }} onClick={() => setShowLogModal(true)}>Schedule Run →</button>
          </div>
        )}
      </div>

      {/* Batch Inventory */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
          <div>
            <div className="card-title" style={{ marginBottom: 2 }}>Batch Inventory</div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
              Each batch tracked separately — manual production logging
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowLogModal(true)}>
            <Plus size={16} /> Log Production
          </button>
        </div>

        <div className="filter-bar" style={{ paddingTop: 0 }}>
          <select className="form-select" value={filterProduct} onChange={e => setFilterProduct(e.target.value)}>
            <option value="">All Products</option>
            {products.map(p => <option key={p.id} value={p.id}>{getProductDisplayName(p)}</option>)}
          </select>
          <select className="form-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="cleared">Cleared</option>
          </select>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Batch #</th>
              <th>Product</th>
              <th>Prod. Date</th>
              <th>Qty Remaining</th>
              <th>Assigned Order</th>
              <th>FIFO Priority</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {displayBatches.map((batch, idx) => {
              const product = products.find(p => p.id === batch.productId);
              const assignedOrder = findAssignedOrder(batch.id);
              const isOldest = oldestActive[0]?.id === batch.id;
              return (
                <tr key={batch.id}>
                  <td className="cell-monospace" style={{ fontWeight: 600 }}>{batch.batchNumber}</td>
                  <td>{product ? getProductDisplayName(product) : '—'}</td>
                  <td>{formatDate(batch.productionDate)}</td>
                  <td className="cell-monospace">{batch.qtyRemaining.toLocaleString()}</td>
                  <td>
                    {assignedOrder ? (
                      <span style={{ fontSize: 'var(--font-size-sm)' }}>
                        #{assignedOrder.orderNumber} {state.clients.find(c => c.id === assignedOrder.clientId)?.name}
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    {batch.status === 'active' && isOldest ? (
                      <span className="badge badge-shipped" style={{ background: '#E0F2FE', color: '#0284C7' }}>Next to Ship</span>
                    ) : '—'}
                  </td>
                  <td>
                    <span className={`badge badge-${batch.status}`}>
                      {batch.status.charAt(0).toUpperCase() + batch.status.slice(1)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Log Production Modal */}
      {showLogModal && (
        <LogProductionModal
          products={products}
          batches={batches}
          dispatch={dispatch}
          addToast={addToast}
          addAudit={addAudit}
          onClose={() => setShowLogModal(false)}
        />
      )}
    </div>
  );
}

function LogProductionModal({ products, batches, dispatch, addToast, addAudit, onClose }) {
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');

  const handleSubmit = () => {
    if (!productId || !quantity || parseInt(quantity) <= 0) {
      addToast('Please select a product and enter quantity', 'warning');
      return;
    }
    const product = products.find(p => p.id === productId);
    const batchNum = `B-${2045 + batches.length}`;
    const newBatch = {
      id: `batch-${Date.now()}`,
      batchNumber: batchNum,
      productId,
      productionDate: new Date().toISOString().slice(0, 10),
      qtyProduced: parseInt(quantity),
      qtyRemaining: parseInt(quantity),
      status: 'active',
    };
    dispatch({ type: 'ADD_BATCH', payload: newBatch });
    addAudit('production_logged', null,
      `Produced ${parseInt(quantity).toLocaleString()} ${product ? getProductDisplayName(product) : ''} — Batch ${batchNum}`,
      null, `${batchNum}: ${parseInt(quantity).toLocaleString()} units`);
    addToast(`Batch ${batchNum} logged — ${parseInt(quantity).toLocaleString()} units`);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title"><FlaskConical size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />Log Production Run</h3>
          <button className="btn btn-ghost" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Product</label>
            <select className="form-select" value={productId} onChange={e => setProductId(e.target.value)}>
              <option value="">Select product...</option>
              {products.map(p => <option key={p.id} value={p.id}>{getProductDisplayName(p)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Quantity Produced</label>
            <input type="number" className="form-input" placeholder="e.g., 1000" value={quantity} onChange={e => setQuantity(e.target.value)} min="1" />
          </div>
          <div className="form-group">
            <label className="form-label">Production Date</label>
            <input type="date" className="form-input" defaultValue={new Date().toISOString().slice(0, 10)} disabled />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit}>Log Production</button>
        </div>
      </div>
    </div>
  );
}
