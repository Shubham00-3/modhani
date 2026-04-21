import { useState, useMemo } from 'react';
import { useApp } from '../context/useApp';
import { getProductDisplayName, formatDate, formatCurrency } from '../data/seedData';
import { X, Lock, Unlock, AlertTriangle, CheckCircle2, Clock, Package, ChevronRight, FileText } from 'lucide-react';

export default function OrdersInvoicing() {
  const { state, dispatch, addToast, addAudit } = useApp();
  const { orders, clients, locations, products, batches, clientPricing, currentUser } = state;
  const [filters, setFilters] = useState({ client: '', status: '', source: '' });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showFulfilment, setShowFulfilment] = useState(false);

  const filteredOrders = useMemo(() => {
    let result = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (filters.client) result = result.filter(o => o.clientId === filters.client);
    if (filters.status) result = result.filter(o => o.status === filters.status);
    if (filters.source) result = result.filter(o => o.source === filters.source);
    return result;
  }, [orders, filters]);

  const openOrder = (order) => {
    setSelectedOrder(order);
    setShowFulfilment(false);
  };

  const closePanel = () => {
    setSelectedOrder(null);
    setShowFulfilment(false);
  };

  return (
    <div>
      {/* Filters */}
      <div className="filter-bar">
        <select className="form-select" value={filters.client} onChange={e => setFilters({ ...filters, client: e.target.value })}>
          <option value="">All Clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="form-select" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="fulfilling">Fulfilling</option>
          <option value="invoiced">Invoiced</option>
          <option value="shipped">Shipped</option>
          <option value="partial">Partial</option>
          <option value="declined">Declined</option>
        </select>
        <select className="form-select" value={filters.source} onChange={e => setFilters({ ...filters, source: e.target.value })}>
          <option value="">All Sources</option>
          <option value="edi">EDI</option>
          <option value="portal">Portal</option>
        </select>
      </div>

      {/* Orders Table */}
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Client</th>
              <th>Location</th>
              <th>Product</th>
              <th>Qty</th>
              <th>Source</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map(order => {
              const client = clients.find(c => c.id === order.clientId);
              const location = locations.find(l => l.id === order.locationId);
              const firstItem = order.items[0];
              const product = products.find(p => p.id === firstItem?.productId);
              return (
                <tr key={order.id} onClick={() => openOrder(order)} style={{ cursor: 'pointer' }}>
                  <td className="cell-monospace">#{order.orderNumber}</td>
                  <td style={{ fontWeight: 600 }}>{client?.name}</td>
                  <td style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>{location?.name}</td>
                  <td style={{ fontWeight: 500 }}>{product ? getProductDisplayName(product) : '—'}</td>
                  <td className="cell-monospace">{firstItem?.quantity?.toLocaleString()}</td>
                  <td><span className={`badge badge-${order.source}`}>{order.source.toUpperCase()}</span></td>
                  <td style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>{formatDate(order.createdAt)}</td>
                  <td><span className={`badge badge-${order.status}`}>{order.status.charAt(0).toUpperCase() + order.status.slice(1)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Slide Panel */}
      {selectedOrder && (
        <>
          <div className="slide-panel-overlay" onClick={closePanel} />
          <div className="slide-panel">
            <div className="slide-panel-header">
              <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
                Order #{selectedOrder.orderNumber}
                {selectedOrder.lockedBy && (
                  <Lock size={16} style={{ marginLeft: 8, color: 'var(--color-warning)' }} />
                )}
              </h2>
              <button className="btn btn-ghost" onClick={closePanel}><X size={20} /></button>
            </div>
            <div className="slide-panel-body">
              {showFulfilment ? (
                <FulfilmentPanel
                  order={selectedOrder}
                  batches={batches}
                  products={products}
                  dispatch={dispatch}
                  addToast={addToast}
                  addAudit={addAudit}
                  currentUser={currentUser}
                  onClose={() => setShowFulfilment(false)}
                />
              ) : (
                <OrderDetail
                  order={selectedOrder}
                  clients={clients}
                  locations={locations}
                  products={products}
                  batches={batches}
                  clientPricing={clientPricing}
                  auditLog={state.auditLog}
                  onFulfil={() => setShowFulfilment(true)}
                  dispatch={dispatch}
                  addToast={addToast}
                  addAudit={addAudit}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---- Order Detail Sub-Component ---- */
function OrderDetail({ order, clients, locations, products, batches, clientPricing, auditLog, onFulfil, dispatch, addToast, addAudit }) {
  const client = clients.find(c => c.id === order.clientId);
  const location = locations.find(l => l.id === order.locationId);
  const orderAudit = auditLog.filter(a => a.orderId === order.id);

  const handleStatusChange = (newStatus) => {
    const prev = order.status;
    const updates = { id: order.id, status: newStatus };
    if (newStatus === 'shipped') updates.shippedAt = new Date().toISOString();
    if (newStatus === 'invoiced') updates.invoicedAt = new Date().toISOString();
    dispatch({ type: 'UPDATE_ORDER', payload: updates });
    addAudit(`order_${newStatus}`, order.id, `Order #${order.orderNumber} → ${newStatus}`, prev, newStatus);
    addToast(`Order #${order.orderNumber} marked as ${newStatus}`);
  };

  const handleQBPush = () => {
    const invNum = `INV-${8840 + Math.floor(Math.random() * 100)}`;
    dispatch({ type: 'UPDATE_ORDER', payload: { id: order.id, qbInvoiceNumber: invNum, qbSyncStatus: 'pushed' } });
    addAudit('qb_sync', order.id, `Invoice ${invNum} pushed to QuickBooks Desktop`, 'pending', 'pushed');
    addToast(`Invoice ${invNum} pushed to QuickBooks`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Order Info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
        <div><span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>Client</span><div style={{ fontWeight: 600 }}>{client?.name}</div></div>
        <div><span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>Location</span><div>{location?.name}</div></div>
        <div><span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>Source</span><div><span className={`badge badge-${order.source}`}>{order.source.toUpperCase()}</span></div></div>
        <div><span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>Status</span><div><span className={`badge badge-${order.status}`}>{order.status.charAt(0).toUpperCase() + order.status.slice(1)}</span></div></div>
        <div><span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>QB Invoice</span><div style={{ fontFamily: 'monospace' }}>{order.qbInvoiceNumber || '—'}</div></div>
        <div><span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>Created</span><div>{formatDate(order.createdAt)}</div></div>
      </div>

      {/* Line Items */}
      <div>
        <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>Line Items</h3>
        {order.items.map(item => {
          const product = products.find(p => p.id === item.productId);
          return (
            <div key={item.id} style={{
              padding: 'var(--space-4)', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                <span style={{ fontWeight: 600 }}>{product ? getProductDisplayName(product) : 'Unknown'}</span>
                <span className="cell-monospace">{item.quantity.toLocaleString()} units</span>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-6)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                <span>Base: {formatCurrency(item.basePrice)}</span>
                <span>Client: {formatCurrency(item.clientPrice)}</span>
                {item.overridePrice && (
                  <span style={{ color: 'var(--color-warning)' }}>Override: {formatCurrency(item.overridePrice)}</span>
                )}
              </div>
              {item.overrideReason && (
                <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-xs)', color: 'var(--color-warning)', fontStyle: 'italic' }}>
                  "{item.overrideReason}"
                </div>
              )}
              <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)' }}>
                Fulfilled: {item.fulfilledQty.toLocaleString()} / {item.quantity.toLocaleString()}
                {item.fulfilledQty >= item.quantity ? (
                  <CheckCircle2 size={14} style={{ marginLeft: 6, color: 'var(--color-success)', verticalAlign: 'middle' }} />
                ) : item.fulfilledQty > 0 ? (
                  <Clock size={14} style={{ marginLeft: 6, color: 'var(--color-warning)', verticalAlign: 'middle' }} />
                ) : null}
              </div>
              {/* Batch breakdown */}
              {item.assignedBatches.length > 0 && (
                <div style={{ marginTop: 'var(--space-3)', paddingLeft: 'var(--space-4)', borderLeft: '2px solid var(--color-border)' }}>
                  {item.assignedBatches.map((ab, i) => {
                    const batch = batches.find(b => b.id === ab.batchId);
                    return (
                      <div key={i} style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 2 }}>
                        Batch {batch?.batchNumber}: {ab.qty.toLocaleString()} units
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        {(order.status === 'pending' || order.status === 'partial') && (
          <button className="btn btn-primary" onClick={onFulfil}>
            <Package size={16} /> Fulfil Order
          </button>
        )}
        {order.status === 'invoiced' && (
          <button className="btn btn-primary" onClick={() => handleStatusChange('shipped')}>
            <CheckCircle2 size={16} /> Mark Shipped
          </button>
        )}
        {order.qbSyncStatus === 'pending' && order.status !== 'pending' && (
          <button className="btn btn-secondary" onClick={handleQBPush}>
            <FileText size={16} /> Push to QuickBooks
          </button>
        )}
      </div>

      {/* Audit Trail */}
      {orderAudit.length > 0 && (
        <div>
          <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>Audit Trail</h3>
          {orderAudit.map(a => (
            <div key={a.id} style={{
              padding: 'var(--space-3)', borderLeft: '2px solid var(--color-secondary)', marginBottom: 'var(--space-2)',
              paddingLeft: 'var(--space-4)', fontSize: 'var(--font-size-sm)',
            }}>
              <div style={{ fontWeight: 500 }}>{a.details}</div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', marginTop: 2 }}>
                {a.userName} — {formatDate(a.timestamp)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- Fulfilment Panel Sub-Component ---- */
function FulfilmentPanel({ order, batches, products, dispatch, addToast, addAudit, currentUser, onClose }) {
  const [assignments, setAssignments] = useState({});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>
          <Package size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          Assign Batches (FIFO)
        </h3>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>← Back</button>
      </div>

      {order.items.map(item => {
        const product = products.find(p => p.id === item.productId);
        const availableBatches = batches
          .filter(b => b.productId === item.productId && b.status === 'active' && b.qtyRemaining > 0)
          .sort((a, b) => new Date(a.productionDate) - new Date(b.productionDate)); // FIFO

        const remaining = item.quantity - item.fulfilledQty;
        const itemAssignments = assignments[item.id] || {};
        const totalAssigned = Object.values(itemAssignments).reduce((s, v) => s + (parseInt(v) || 0), 0);

        return (
          <div key={item.id} style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
            <div style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>
              {product ? getProductDisplayName(product) : 'Unknown'} — {remaining.toLocaleString()} units needed
            </div>

            {availableBatches.length === 0 ? (
              <div className="alert alert-warning" style={{ marginTop: 'var(--space-2)' }}>
                <AlertTriangle size={18} />
                <div className="alert-content">
                  <div className="alert-title">No batches available</div>
                  <div className="alert-description">Schedule a production run for this product.</div>
                </div>
              </div>
            ) : (
              <table className="data-table" style={{ marginTop: 'var(--space-3)' }}>
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Prod. Date</th>
                    <th>Remaining</th>
                    <th>Assign</th>
                  </tr>
                </thead>
                <tbody>
                  {availableBatches.map(batch => (
                    <tr key={batch.id} style={{ cursor: 'default' }}>
                      <td className="cell-monospace">{batch.batchNumber}</td>
                      <td>{formatDate(batch.productionDate)}</td>
                      <td className="cell-monospace">{batch.qtyRemaining.toLocaleString()}</td>
                      <td>
                        <input
                          type="number"
                          className="form-input"
                          style={{ width: 90, padding: '4px 8px' }}
                          min="0"
                          max={Math.min(batch.qtyRemaining, remaining)}
                          value={itemAssignments[batch.id] || ''}
                          placeholder="0"
                          onChange={e => {
                            const val = Math.min(parseInt(e.target.value) || 0, batch.qtyRemaining);
                            setAssignments(prev => ({
                              ...prev,
                              [item.id]: { ...(prev[item.id] || {}), [batch.id]: val },
                            }));
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--font-size-sm)', color: totalAssigned >= remaining ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
              Assigned: {totalAssigned.toLocaleString()} / {remaining.toLocaleString()}
              {totalAssigned > 0 && totalAssigned < remaining && (
                <span style={{ color: 'var(--color-warning)', marginLeft: 8 }}>
                  ({(remaining - totalAssigned).toLocaleString()} outstanding)
                </span>
              )}
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <button
          className="btn btn-primary"
          onClick={() => {
            const allAssignments = [];
            for (const [itemId, batchMap] of Object.entries(assignments)) {
              for (const [batchId, qty] of Object.entries(batchMap)) {
                if (qty > 0) {
                  allAssignments.push({ orderItemId: itemId, batchId, qty: parseInt(qty) });
                }
              }
            }
            if (allAssignments.length === 0) {
              addToast('Enter quantities to assign', 'warning');
              return;
            }
            dispatch({ type: 'FULFIL_ORDER', payload: { orderId: order.id, assignments: allAssignments } });
            const totalQty = allAssignments.reduce((s, a) => s + a.qty, 0);
            addAudit('order_fulfilled', order.id,
              `Order #${order.orderNumber} — ${totalQty.toLocaleString()} units assigned from ${allAssignments.length} batch(es)`,
              'pending', 'fulfilled');
            addToast(`Order #${order.orderNumber} fulfilled successfully!`);
            onClose();
          }}
        >
          <CheckCircle2 size={16} /> Confirm Assignment
        </button>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
