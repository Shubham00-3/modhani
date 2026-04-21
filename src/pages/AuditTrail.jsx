import { useState, useMemo } from 'react';
import { useApp } from '../context/useApp';
import { formatDateTime } from '../data/seedData';
import { ScrollText, Filter } from 'lucide-react';

const ACTION_LABELS = {
  order_received: 'Order Received',
  order_fulfilled: 'Order Fulfilled',
  order_shipped: 'Order Shipped',
  order_invoiced: 'Order Invoiced',
  invoice_created: 'Invoice Created',
  price_override: 'Price Override',
  production_logged: 'Production Logged',
  batch_assigned: 'Batch Assigned',
  packing_slip_sent: 'Packing Slip Sent',
  qb_sync: 'QB Sync',
  client_added: 'Client Added',
  pricing_updated: 'Pricing Updated',
};

const ACTION_COLORS = {
  order_received: 'var(--color-info)',
  order_fulfilled: 'var(--color-success)',
  order_shipped: 'var(--color-success)',
  order_invoiced: 'var(--color-accent)',
  invoice_created: 'var(--color-accent)',
  price_override: 'var(--color-warning)',
  production_logged: 'var(--color-secondary)',
  batch_assigned: 'var(--color-secondary)',
  packing_slip_sent: 'var(--color-muted-green)',
  qb_sync: 'var(--color-info)',
  client_added: 'var(--color-primary)',
  pricing_updated: 'var(--color-primary)',
};

export default function AuditTrail() {
  const { state } = useApp();
  const { auditLog, clients, orders } = state;
  const [filterAction, setFilterAction] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterOrder, setFilterOrder] = useState('');

  const filteredLog = useMemo(() => {
    let result = [...auditLog].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    if (filterAction) result = result.filter(a => a.action === filterAction);
    if (filterUser) result = result.filter(a => a.userName.toLowerCase().includes(filterUser.toLowerCase()));
    if (filterOrder) {
      result = result.filter(a => {
        if (!a.orderId) return false;
        const order = orders.find(o => o.id === a.orderId);
        return order && String(order.orderNumber).includes(filterOrder);
      });
    }
    return result;
  }, [auditLog, filterAction, filterUser, filterOrder, orders]);

  const uniqueActions = [...new Set(auditLog.map(a => a.action))];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <ScrollText size={28} /> Audit Trail
          </h1>
          <p className="page-subtitle">Immutable log of all system actions. Entries cannot be deleted or modified.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <select className="form-select" value={filterAction} onChange={e => setFilterAction(e.target.value)}>
          <option value="">All Actions</option>
          {uniqueActions.map(a => <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>)}
        </select>
        <input
          className="form-input"
          placeholder="Filter by user..."
          value={filterUser}
          onChange={e => setFilterUser(e.target.value)}
          style={{ minWidth: 160 }}
        />
        <input
          className="form-input"
          placeholder="Order #..."
          value={filterOrder}
          onChange={e => setFilterOrder(e.target.value)}
          style={{ minWidth: 100 }}
        />
      </div>

      {/* Log Table */}
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>Order</th>
              <th>User</th>
              <th>Details</th>
              <th>Previous</th>
              <th>New Value</th>
            </tr>
          </thead>
          <tbody>
            {filteredLog.map(entry => {
              const order = entry.orderId ? orders.find(o => o.id === entry.orderId) : null;
              return (
                <tr key={entry.id} style={{ cursor: 'default' }}>
                  <td style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {formatDateTime(entry.timestamp)}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background: `${ACTION_COLORS[entry.action] || 'var(--color-text-muted)'}18`,
                        color: ACTION_COLORS[entry.action] || 'var(--color-text-muted)',
                      }}
                    >
                      {ACTION_LABELS[entry.action] || entry.action}
                    </span>
                  </td>
                  <td className="cell-monospace">
                    {order ? `#${order.orderNumber}` : '—'}
                  </td>
                  <td style={{ fontWeight: 500 }}>{entry.userName}</td>
                  <td style={{ fontSize: 'var(--font-size-sm)', maxWidth: 300 }}>{entry.details}</td>
                  <td style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{entry.previousValue || '—'}</td>
                  <td style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{entry.newValue || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredLog.length === 0 && (
          <div className="empty-state">
            <Filter size={48} className="empty-state-icon" />
            <div className="empty-state-title">No matching entries</div>
            <div className="empty-state-description">Try adjusting your filters to see audit log entries.</div>
          </div>
        )}
      </div>
    </div>
  );
}
