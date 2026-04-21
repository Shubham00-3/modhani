import { useApp } from '../context/useApp';
import { getClientName, getLocationName, getProduct, getProductDisplayName, formatTime, formatCurrency } from '../data/seedData';
import { Package, AlertTriangle, Clock, ClipboardList, RefreshCw, Users, TrendingUp, CheckCircle2, XCircle } from 'lucide-react';

export default function Overview() {
  const { state } = useApp();
  const { orders, clients, locations, products, batches } = state;

  // Stats
  const today = new Date().toISOString().slice(0, 10);
  const ordersToday = orders.length; // In demo mode, count all orders as "today"
  const lowStockProducts = batches.filter(b => b.status === 'active' && b.qtyRemaining < 200).length;
  const expiringBatches = 2; // Mock
  const outstandingFulfilments = orders.filter(o => o.status === 'pending' || o.status === 'partial').length;

  // Client stats
  const clientStats = clients.map(c => {
    const clientOrders = orders.filter(o => o.clientId === c.id);
    const clientLocations = locations.filter(l => l.clientId === c.id);
    return {
      ...c,
      todayOrders: clientOrders.length,
      locationDisplay: c.locationCount >= 100 ? `~${c.locationCount} locations` : `${clientLocations.length} stores`,
    };
  });

  // QB Sync stats
  const invoicesPushed = orders.filter(o => o.qbSyncStatus === 'pushed').length;
  const pendingSync = orders.filter(o => o.qbSyncStatus === 'pending' && o.status !== 'pending').length;

  // Recent orders
  const recentOrders = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);

  return (
    <div>
      {/* Stat Cards */}
      <div className="stat-cards-grid section">
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-card-icon">
              <Package size={22} />
            </div>
            <span className="stat-card-badge badge-shipped" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <TrendingUp size={12} /> +6 vs yesterday
            </span>
          </div>
          <div className="stat-card-value">{ordersToday}</div>
          <div className="stat-card-label">Orders Today</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-card-icon" style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
              <AlertTriangle size={22} />
            </div>
            <span className="badge badge-declined">Alert</span>
          </div>
          <div className="stat-card-value">{lowStockProducts}</div>
          <div className="stat-card-label">Low Stock Products</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-card-icon" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
              <Clock size={22} />
            </div>
            <span className="badge badge-invoiced">48h</span>
          </div>
          <div className="stat-card-value">{expiringBatches}</div>
          <div className="stat-card-label">Batches Expiring Soon</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-card-icon">
              <ClipboardList size={22} />
            </div>
            <span className="stat-card-badge" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Partial orders pending
            </span>
          </div>
          <div className="stat-card-value">{outstandingFulfilments}</div>
          <div className="stat-card-label">Outstanding Fulfilments</div>
        </div>
      </div>

      {/* Active Clients */}
      <div className="section">
        <div className="section-title"><Users size={18} /> Active Clients</div>
        <div className="client-cards-grid">
          {clientStats.map(c => (
            <div key={c.id} className="client-card">
              <div className="client-card-name">{c.name}</div>
              <div className="client-card-locations">{c.locationDisplay}</div>
              <div className="client-card-orders">{c.todayOrders} orders today</div>
            </div>
          ))}
        </div>
      </div>

      {/* QB Desktop Sync */}
      <div className="qb-sync-card section">
        <div className="qb-sync-title">
          <RefreshCw size={20} /> QuickBooks Desktop — Today's Activity
        </div>
        <div className="qb-sync-stats">
          <div className="qb-sync-stat">
            <div className="qb-sync-stat-value green">{invoicesPushed}</div>
            <div className="qb-sync-stat-label">Invoices Pushed</div>
          </div>
          <div className="qb-sync-stat">
            <div className="qb-sync-stat-value green">3</div>
            <div className="qb-sync-stat-label">POs Pushed</div>
          </div>
          <div className="qb-sync-stat">
            <div className="qb-sync-stat-value red">{pendingSync}</div>
            <div className="qb-sync-stat-label">Pending Sync</div>
          </div>
          <div className="qb-sync-stat">
            <div className="qb-sync-stat-value mono">2:47 PM</div>
            <div className="qb-sync-stat-label">Last Sync</div>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="card section">
        <div className="card-title">Recent Orders</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Location</th>
              <th>Product</th>
              <th>Qty</th>
              <th>Source</th>
              <th>Time</th>
              <th>Status</th>
              <th>QB Sync</th>
            </tr>
          </thead>
          <tbody>
            {recentOrders.map(order => {
              const client = clients.find(c => c.id === order.clientId);
              const location = locations.find(l => l.id === order.locationId);
              const firstItem = order.items[0];
              const product = products.find(p => p.id === firstItem?.productId);
              return (
                <tr key={order.id}>
                  <td style={{ fontWeight: 600 }}>{client?.name}</td>
                  <td style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                    {location?.name}
                  </td>
                  <td style={{ fontWeight: 500 }}>{product ? getProductDisplayName(product) : '—'}</td>
                  <td className="cell-monospace">{firstItem?.quantity?.toLocaleString()}</td>
                  <td>
                    <span className={`badge badge-${order.source}`}>
                      {order.source.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ color: 'var(--color-text-muted)', fontFamily: 'monospace', fontSize: 'var(--font-size-sm)' }}>
                    {formatTime(order.createdAt)}
                  </td>
                  <td>
                    <span className={`badge badge-${order.status}`}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </span>
                  </td>
                  <td>
                    {order.qbSyncStatus === 'pushed' ? (
                      <span className="badge badge-pushed" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <CheckCircle2 size={12} /> Pushed QB
                      </span>
                    ) : (
                      <span className="badge badge-qb-pending" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Clock size={12} /> Pending QB
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
