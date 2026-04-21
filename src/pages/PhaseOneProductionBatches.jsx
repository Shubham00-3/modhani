import { useMemo, useState } from 'react';
import { AlertTriangle, FlaskConical, Plus, X } from 'lucide-react';
import { useApp } from '../context/useApp';
import {
  formatDate,
  getItemOutstandingQty,
  getProduct,
  getProductDisplayName,
} from '../data/phaseOneData';

export default function PhaseOneProductionBatches() {
  const { state, dispatch, addToast } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [productFilter, setProductFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filteredBatches = useMemo(() => {
    return [...state.batches]
      .filter((batch) => (productFilter ? batch.productId === productFilter : true))
      .filter((batch) => (statusFilter ? batch.status === statusFilter : true))
      .sort((a, b) => new Date(b.productionDate) - new Date(a.productionDate));
  }, [productFilter, state.batches, statusFilter]);

  const oldestActive = [...state.batches]
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
      {oldestActive ? (
        <div className="alert alert-warning section">
          <AlertTriangle size={18} />
          <div className="alert-content">
            <div className="alert-title">
              FIFO reminder: {oldestActive.batchNumber} should be considered first.
            </div>
            <div className="alert-description">
              {getProductDisplayName(getProduct(state.products, oldestActive.productId))} has {oldestActive.qtyRemaining.toLocaleString()} units remaining from the oldest active batch.
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
                    Outstanding quantity will remain visible until staff manually assigns the next batch.
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
            <div className="card-title" style={{ marginBottom: 2 }}>Batch Inventory</div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Manual production logging creates inventory one batch at a time.
            </div>
          </div>
          <button className="btn btn-primary" type="button" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Log Production
          </button>
        </div>

        <div className="filter-bar">
          <select className="form-select" value={productFilter} onChange={(event) => setProductFilter(event.target.value)}>
            <option value="">All Products</option>
            {state.products.map((product) => (
              <option key={product.id} value={product.id}>
                {getProductDisplayName(product)}
              </option>
            ))}
          </select>

          <select className="form-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="cleared">Cleared</option>
          </select>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Batch</th>
              <th>Product</th>
              <th>Production Date</th>
              <th>Produced</th>
              <th>Remaining</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredBatches.map((batch) => (
              <tr key={batch.id}>
                <td className="cell-monospace">{batch.batchNumber}</td>
                <td>{getProductDisplayName(getProduct(state.products, batch.productId))}</td>
                <td>{formatDate(batch.productionDate)}</td>
                <td className="cell-monospace">{batch.qtyProduced.toLocaleString()}</td>
                <td className="cell-monospace">{batch.qtyRemaining.toLocaleString()}</td>
                <td><span className={`badge badge-${batch.status}`}>{batch.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal ? (
        <LogProductionModal
          onClose={() => setShowModal(false)}
          onSave={async (payload) => {
            const result = await dispatch({ type: 'LOG_PRODUCTION_BATCH', payload });
            if (!result?.ok) return;
            addToast(`Batch ${payload.batchNumber} logged.`);
            setShowModal(false);
          }}
        />
      ) : null}
    </div>
  );
}

function LogProductionModal({ onClose, onSave }) {
  const { state, addToast } = useApp();
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [productionDate, setProductionDate] = useState(new Date().toISOString().slice(0, 10));
  const [batchNumber, setBatchNumber] = useState(`B-${3020 + state.batches.length}`);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            <FlaskConical size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Log Production Batch
          </h3>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Product</label>
            <select className="form-select" value={productId} onChange={(event) => setProductId(event.target.value)}>
              <option value="">Select product</option>
              {state.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {getProductDisplayName(product)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Batch Number</label>
              <input className="form-input" value={batchNumber} onChange={(event) => setBatchNumber(event.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Production Date</label>
              <input className="form-input" type="date" value={productionDate} onChange={(event) => setProductionDate(event.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Quantity Produced</label>
            <input className="form-input" type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              if (!productId || Number(quantity) <= 0 || !batchNumber.trim()) {
                addToast('Complete all production fields.', 'warning');
                return;
              }

              onSave({
                id: `batch-${Date.now()}`,
                batchNumber: batchNumber.trim(),
                productId,
                productionDate,
                qtyProduced: Number(quantity),
                qtyRemaining: Number(quantity),
                status: 'active',
              });
            }}
          >
            Log Production
          </button>
        </div>
      </div>
    </div>
  );
}
