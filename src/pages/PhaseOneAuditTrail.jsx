import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RotateCcw, ScrollText } from 'lucide-react';
import { useApp } from '../context/useApp';
import { formatDateTime, getClientName } from '../data/phaseOneData';

const ACTION_LABELS = {
  order_received: 'Order Received',
  order_locked: 'Order Locked',
  order_fulfilled: 'Order Fulfilled',
  order_partial: 'Order Partial',
  order_declined: 'Order Declined',
  batch_assigned: 'Batch Assigned',
  production_logged: 'Production Logged',
  price_override: 'Price Override',
  invoice_created: 'Invoice Created',
  invoice_updated: 'Invoice Updated',
  invoice_sent: 'Invoice Sent',
  qb_sync: 'QB Sync',
  packing_slip_created: 'Packing Slip Created',
  packing_slip_sent: 'Packing Slip Sent',
  product_saved: 'Product Saved',
  client_saved: 'Client Saved',
  location_saved: 'Location Saved',
  client_pricing_updated: 'Client Pricing Updated',
  user_permissions_updated: 'User Permissions Updated',
  quickbooks_settings_updated: 'QuickBooks Settings Updated',
  order_balance_declined: 'Remaining Balance Declined',
};

export default function PhaseOneAuditTrail() {
  const { state } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    action: '',
    order: '',
    user: '',
    clientId: '',
  });
  const dashboardSearch = (searchParams.get('q') ?? '').trim().toLowerCase();

  const filteredLog = useMemo(() => {
    return state.auditLog
      .filter((entry) => (filters.action ? entry.action === filters.action : true))
      .filter((entry) => (filters.user ? entry.userName.toLowerCase().includes(filters.user.toLowerCase()) : true))
      .filter((entry) => {
        if (!filters.order) return true;
        const order = state.orders.find((item) => item.id === entry.orderId);
        return order ? String(order.orderNumber).includes(filters.order) : false;
      })
      .filter((entry) => (filters.clientId ? entry.clientId === filters.clientId : true))
      .filter((entry) => {
        if (!dashboardSearch) return true;
        const order = entry.orderId ? state.orders.find((item) => item.id === entry.orderId) : null;
        return [
          ACTION_LABELS[entry.action] ?? entry.action,
          entry.details,
          entry.userName,
          entry.previousValue,
          entry.newValue,
          entry.timestamp,
          entry.clientId ? getClientName(state.clients, entry.clientId) : '',
          order ? order.orderNumber : '',
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(dashboardSearch);
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [dashboardSearch, filters, state.auditLog, state.clients, state.orders]);

  const actions = [...new Set(state.auditLog.map((entry) => entry.action))];
  const summary = useMemo(() => {
    const touchedOrders = new Set(filteredLog.map((entry) => entry.orderId).filter(Boolean));
    const touchedUsers = new Set(filteredLog.map((entry) => entry.userId).filter(Boolean));
    const today = new Date().toISOString().slice(0, 10);

    return {
      totalEvents: filteredLog.length,
      touchedOrders: touchedOrders.size,
      touchedUsers: touchedUsers.size,
      todayEvents: filteredLog.filter((entry) => entry.timestamp.slice(0, 10) === today).length,
    };
  }, [filteredLog]);
  const hasActiveFilters = Boolean(filters.action || filters.order || filters.user || filters.clientId || dashboardSearch);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <ScrollText size={28} /> Audit Trail
          </h1>
          <p className="page-subtitle">Phase 1 immutable activity log for orders, pricing, production, and shipment actions.</p>
        </div>
      </div>

      <div className="grid-4 section">
        <AuditSummaryCard label="Events" value={summary.totalEvents.toLocaleString()} />
        <AuditSummaryCard label="Orders Touched" value={summary.touchedOrders.toLocaleString()} />
        <AuditSummaryCard label="Staff Involved" value={summary.touchedUsers.toLocaleString()} />
        <AuditSummaryCard label="Today's Entries" value={summary.todayEvents.toLocaleString()} />
      </div>

      <div className="filter-bar">
        <select className="form-select" value={filters.action} onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))}>
          <option value="">All Actions</option>
          {actions.map((action) => (
            <option key={action} value={action}>
              {ACTION_LABELS[action] ?? action}
            </option>
          ))}
        </select>
        <select className="form-select" value={filters.clientId} onChange={(event) => setFilters((current) => ({ ...current, clientId: event.target.value }))}>
          <option value="">All Clients</option>
          {state.clients.map((client) => (
            <option key={client.id} value={client.id}>{client.name}</option>
          ))}
        </select>
        <input className="form-input" placeholder="Order #" value={filters.order} onChange={(event) => setFilters((current) => ({ ...current, order: event.target.value }))} />
        <input className="form-input" placeholder="Staff member" value={filters.user} onChange={(event) => setFilters((current) => ({ ...current, user: event.target.value }))} />
        <button
          className="btn btn-secondary"
          type="button"
          disabled={!hasActiveFilters}
          onClick={() => {
            const nextSearchParams = new URLSearchParams(searchParams);
            nextSearchParams.delete('q');
            setSearchParams(nextSearchParams);
            setFilters({ action: '', order: '', user: '', clientId: '' });
          }}
        >
          <RotateCcw size={14} /> Reset Filters
        </button>
      </div>

      <div className="card">
        {filteredLog.length ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Client</th>
                <th>Order</th>
                <th>User</th>
                <th>Details</th>
                <th>Previous</th>
                <th>New Value</th>
              </tr>
            </thead>
            <tbody>
              {filteredLog.map((entry) => {
                const order = entry.orderId ? state.orders.find((item) => item.id === entry.orderId) : null;

                return (
                  <tr key={entry.id}>
                    <td>{formatDateTime(entry.timestamp)}</td>
                    <td><span className="badge badge-pending">{ACTION_LABELS[entry.action] ?? entry.action}</span></td>
                    <td>{entry.clientId ? getClientName(state.clients, entry.clientId) : '-'}</td>
                    <td className="cell-monospace">{order ? `#${order.orderNumber}` : '-'}</td>
                    <td style={{ fontWeight: 600 }}>{entry.userName}</td>
                    <td>{entry.details}</td>
                    <td>{entry.previousValue ?? '-'}</td>
                    <td>{entry.newValue ?? '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <div className="empty-state-title">No audit entries match these filters</div>
            <div className="empty-state-description">
              Clear the current filters to restore the full operational audit log.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AuditSummaryCard({ label, value }) {
  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <div style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
        {label}
      </div>
      <div style={{ marginTop: 6, fontWeight: 700, fontSize: 'var(--font-size-lg)' }}>{value}</div>
    </div>
  );
}
