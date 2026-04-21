import { createElement } from 'react';
import { BarChart3, ClipboardList, Package, RefreshCw, ScrollText, Truck } from 'lucide-react';
import { useApp } from '../context/useApp';
import {
  formatCurrency,
  formatDate,
  formatTime,
  getClientName,
  getLocationName,
  getOrderOutstandingQty,
  getOrderValue,
} from '../data/phaseOneData';

export default function PhaseOneOverview() {
  const { state } = useApp();
  const activeOrders = state.orders.filter((order) =>
    ['pending', 'partial', 'fulfilled', 'invoiced'].includes(order.status)
  );
  const outstandingUnits = state.orders.reduce((sum, order) => sum + getOrderOutstandingQty(order), 0);
  const invoicesPendingQb = state.orders.filter((order) => order.invoiceNumber && !order.qbInvoiceNumber).length;
  const shipmentsToday = state.orders.filter((order) => order.shippedAt?.startsWith('2026-04-14')).length;
  const recentOrders = [...state.orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);
  const lowStockBatches = state.batches.filter((batch) => batch.qtyRemaining > 0 && batch.qtyRemaining <= 150);
  const topClients = state.clients.map((client) => {
    const clientOrders = state.orders.filter((order) => order.clientId === client.id);
    return {
      id: client.id,
      name: client.name,
      orders: clientOrders.length,
      value: clientOrders.reduce((sum, order) => sum + getOrderValue(order), 0),
    };
  });

  return (
    <div>
      <div className="stat-cards-grid section">
        <StatCard icon={ClipboardList} label="Open Orders" value={activeOrders.length} detail="Pending through invoiced" />
        <StatCard icon={Package} label="Outstanding Units" value={outstandingUnits.toLocaleString()} detail="Awaiting next batch or manual fulfilment" />
        <StatCard icon={RefreshCw} label="Pending QB Push" value={invoicesPendingQb} detail={`Last sync ${formatTime(state.quickBooks.lastSyncAt)}`} />
        <StatCard icon={Truck} label="Shipments Today" value={shipmentsToday} detail="Packing slips generated per shipment" />
      </div>

      <div className="grid-2 section">
        <div className="card">
          <div className="card-title">
            <BarChart3 size={18} /> Client Snapshot
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {topClients.map((client) => (
              <div key={client.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{client.name}</div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                    {client.orders} orders across {state.locations.filter((location) => location.clientId === client.id).length} active demo locations
                  </div>
                </div>
                <div className="cell-monospace">{formatCurrency(client.value)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <ScrollText size={18} /> Inventory Alerts
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {lowStockBatches.length ? (
              lowStockBatches.map((batch) => (
                <div key={batch.id} className="alert alert-warning">
                  <div className="alert-content">
                    <div className="alert-title">{batch.batchNumber} is running low</div>
                    <div className="alert-description">
                      {batch.qtyRemaining.toLocaleString()} units remaining in this batch.
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                <div className="empty-state-title">No urgent stock alerts</div>
                <div className="empty-state-description">
                  Current demo inventory levels are healthy enough for the next fulfilment cycle.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Recent Orders</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Client</th>
              <th>Location</th>
              <th>Status</th>
              <th>Total Value</th>
              <th>QB Invoice</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {recentOrders.map((order) => (
              <tr key={order.id}>
                <td className="cell-monospace">#{order.orderNumber}</td>
                <td style={{ fontWeight: 600 }}>{getClientName(state.clients, order.clientId)}</td>
                <td>{getLocationName(state.locations, order.locationId)}</td>
                <td><span className={`badge badge-${order.status}`}>{order.status}</span></td>
                <td className="cell-monospace">{formatCurrency(getOrderValue(order))}</td>
                <td className="cell-monospace">{order.qbInvoiceNumber ?? '-'}</td>
                <td>{formatDate(order.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, detail }) {
  return (
    <div className="stat-card">
      <div className="stat-card-header">
        <div className="stat-card-icon">
          {createElement(icon, { size: 20 })}
        </div>
      </div>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
      <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>{detail}</div>
    </div>
  );
}
