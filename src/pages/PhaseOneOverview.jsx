import { createElement, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3, ClipboardList, ImageOff, Package, RefreshCw, ScrollText, Truck } from 'lucide-react';
import { useApp } from '../context/useApp';
import {
  formatClientLocationScale,
  formatCurrency,
  formatDate,
  formatTime,
  getClientName,
  getLocationName,
  getOrderOutstandingQty,
  getOrderValue,
  getProductDisplayName,
  getProductImageUrl,
  hasProductImage,
} from '../data/phaseOneData';

const LOW_STOCK_THRESHOLD = 20;

function getStockStatus(totalRemaining) {
  if (totalRemaining <= 0) return 'out';
  if (totalRemaining <= LOW_STOCK_THRESHOLD) return 'low';
  return 'in';
}

function getStockStatusLabel(status) {
  if (status === 'out') return 'Out of stock';
  if (status === 'low') return 'Running low';
  return 'In stock';
}

export default function PhaseOneOverview() {
  const { state } = useApp();
  const [searchParams] = useSearchParams();
  const [selectedDashboardView, setSelectedDashboardView] = useState(null);
  const dashboardSearchRaw = (searchParams.get('q') ?? '').trim();
  const dashboardSearch = dashboardSearchRaw.toLowerCase();
  const todayKey = new Date().toISOString().slice(0, 10);
  const orderMatchesDashboardSearch = (order) => {
    if (!dashboardSearch) return true;

    const itemSearchText = (order.items ?? [])
      .map((item) => {
        const product = state.products.find((catalogueProduct) => catalogueProduct.id === item.productId);
        return [
          product ? getProductDisplayName(product) : null,
          item.productName,
          item.productId,
          item.qtyOrdered,
          item.qtyFulfilled,
        ]
          .filter(Boolean)
          .join(' ');
      })
      .join(' ');

    return [
      order.orderNumber,
      order.status,
      order.source,
      order.invoiceNumber,
      order.qbInvoiceNumber,
      order.packingSlipNumber,
      getClientName(state.clients, order.clientId),
      getLocationName(state.locations, order.locationId),
      itemSearchText,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(dashboardSearch);
  };
  const activeOrders = state.orders.filter((order) =>
    ['pending', 'partial', 'fulfilled', 'invoiced'].includes(order.status)
  );
  const outstandingOrders = state.orders.filter((order) => getOrderOutstandingQty(order) > 0);
  const outstandingUnits = outstandingOrders.reduce((sum, order) => sum + getOrderOutstandingQty(order), 0);
  const invoicesPendingQbOrders = state.orders.filter((order) => order.invoiceNumber && !order.qbInvoiceNumber);
  const shipmentsTodayOrders = state.orders.filter((order) => order.shippedAt?.slice(0, 10) === todayKey);
  const dashboardViews = {
    open: {
      title: 'Open Orders',
      description: 'Orders currently pending, partially fulfilled, fulfilled, or invoiced.',
      orders: activeOrders,
    },
    outstanding: {
      title: 'Outstanding Units',
      description: 'Orders that still have remaining quantity to fulfil.',
      orders: outstandingOrders,
    },
    'qb-pending': {
      title: 'Pending QB Push',
      description: 'Invoices created in ModhaniOS that still need a QuickBooks invoice number.',
      orders: invoicesPendingQbOrders,
    },
    'shipments-today': {
      title: 'Shipments Today',
      description: 'Orders shipped today based on shipment confirmation time.',
      orders: shipmentsTodayOrders,
    },
  };
  const selectedDashboardConfig = selectedDashboardView ? dashboardViews[selectedDashboardView] : null;
  const dashboardSearchOrders = state.orders.filter(orderMatchesDashboardSearch);
  const visibleDashboardConfig = selectedDashboardConfig
    ? {
        ...selectedDashboardConfig,
        description: dashboardSearchRaw
          ? `${selectedDashboardConfig.description} Filtered by "${dashboardSearchRaw}".`
          : selectedDashboardConfig.description,
        orders: selectedDashboardConfig.orders.filter(orderMatchesDashboardSearch),
      }
    : dashboardSearchRaw
      ? {
          title: 'Dashboard Search Results',
          description: `Orders matching "${dashboardSearchRaw}".`,
          orders: dashboardSearchOrders,
        }
      : null;
  const recentOrdersSource = dashboardSearchRaw ? dashboardSearchOrders : state.orders;
  const recentOrders = [...recentOrdersSource].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);
  const inventoryPreviewRows = state.products
    .map((product) => {
      const productBatches = state.batches.filter((batch) => batch.productId === product.id);
      const activeBatches = productBatches
        .filter((batch) => batch.status === 'active' && batch.qtyRemaining > 0)
        .sort((a, b) => new Date(a.productionDate) - new Date(b.productionDate));
      const totalProduced = productBatches.reduce((sum, batch) => sum + Number(batch.qtyProduced ?? 0), 0);
      const totalRemaining = productBatches.reduce((sum, batch) => sum + Number(batch.qtyRemaining ?? 0), 0);
      const oldestLot = activeBatches[0];
      const newestActivity = productBatches.reduce((latest, batch) => {
        const batchTime = new Date(batch.updatedAt ?? batch.productionDate).getTime();
        return Number.isNaN(batchTime) ? latest : Math.max(latest, batchTime);
      }, 0);

      return {
        product,
        activeBatches,
        totalProduced,
        totalRemaining,
        oldestLot,
        newestActivity,
        stockStatus: getStockStatus(totalRemaining),
      };
    })
    .filter((row) => row.totalProduced > 0 || row.totalRemaining > 0)
    .sort((a, b) => {
      const statusOrder = { out: 0, low: 1, in: 2 };
      return statusOrder[a.stockStatus] - statusOrder[b.stockStatus]
        || a.totalRemaining - b.totalRemaining
        || b.newestActivity - a.newestActivity;
    })
    .slice(0, 4);
  const topClients = state.clients
    .map((client) => {
      const clientOrders = state.orders.filter((order) => order.clientId === client.id);
      const clientLocations = state.locations.filter((location) => location.clientId === client.id);
      const searchableText = [
        client.name,
        client.qbCustomerName,
        ...clientLocations.flatMap((location) => [
          location.name,
          location.city,
          location.province,
          location.postalCode,
          location.addressLine1,
          location.addressLine2,
        ]),
        ...clientOrders.flatMap((order) => [
          order.orderNumber,
          order.status,
          order.invoiceNumber,
          order.qbInvoiceNumber,
        ]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return {
        id: client.id,
        name: client.name,
        orders: clientOrders.length,
        value: clientOrders.reduce((sum, order) => sum + getOrderValue(order), 0),
        locationCount: clientLocations.length,
        locationLabel: formatClientLocationScale(
          client,
          clientLocations.length
        ),
        searchableText,
      };
    })
    .filter((client) => !dashboardSearch || client.searchableText.includes(dashboardSearch))
    .sort((a, b) => b.value - a.value || b.orders - a.orders)
    .slice(0, 5);

  return (
    <div>
      <div className="dashboard-brand section">
        <img src="/modhani-logo.svg" alt="Modhani" />
        <div>
          <div className="dashboard-brand-title">Operations Dashboard</div>
          <div className="dashboard-brand-subtitle">Orders, fulfilment, invoicing, and QuickBooks sync.</div>
        </div>
      </div>

      <div className="stat-cards-grid section">
        <StatCard
          icon={ClipboardList}
          label="Open Orders"
          value={activeOrders.length}
          detail="Pending through invoiced"
          active={selectedDashboardView === 'open'}
          onClick={() => setSelectedDashboardView((current) => (current === 'open' ? null : 'open'))}
        />
        <StatCard
          icon={Package}
          label="Outstanding Units"
          value={outstandingUnits.toLocaleString()}
          detail="Awaiting next batch or manual fulfilment"
          active={selectedDashboardView === 'outstanding'}
          onClick={() => setSelectedDashboardView((current) => (current === 'outstanding' ? null : 'outstanding'))}
        />
        <StatCard
          icon={RefreshCw}
          label="Pending QB Push"
          value={invoicesPendingQbOrders.length}
          detail={state.quickBooks.lastSyncAt ? `Last sync ${formatTime(state.quickBooks.lastSyncAt)}` : 'No sync recorded yet'}
          active={selectedDashboardView === 'qb-pending'}
          onClick={() => setSelectedDashboardView((current) => (current === 'qb-pending' ? null : 'qb-pending'))}
        />
        <StatCard
          icon={Truck}
          label="Shipments Today"
          value={shipmentsTodayOrders.length}
          detail="Packing slips generated per shipment"
          active={selectedDashboardView === 'shipments-today'}
          onClick={() => setSelectedDashboardView((current) => (current === 'shipments-today' ? null : 'shipments-today'))}
        />
      </div>

      {visibleDashboardConfig ? (
        <DashboardOrderPanel
          title={visibleDashboardConfig.title}
          description={visibleDashboardConfig.description}
          orders={visibleDashboardConfig.orders}
          clients={state.clients}
          locations={state.locations}
        />
      ) : null}

      <div className="grid-2 section">
        <div className="card">
          <div className="card-title">
            <BarChart3 size={18} /> Client Snapshot
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {topClients.length ? (
              topClients.map((client) => (
                <div key={client.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{client.name}</div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                      {client.orders} orders • {client.locationLabel}
                    </div>
                  </div>
                  <div className="cell-monospace">{formatCurrency(client.value)}</div>
                </div>
              ))
            ) : (
              <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                <div className="empty-state-title">No client activity yet</div>
                <div className="empty-state-description">
                  Client revenue and order mix will appear here once incoming orders are created.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', alignItems: 'center' }}>
            <div>
              <div className="card-title">
                <ScrollText size={18} /> Inventory Preview
              </div>
              <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: -4 }}>
                Running low at {LOW_STOCK_THRESHOLD.toLocaleString()} units or less.
              </div>
            </div>
            <Link className="btn btn-secondary" to="/inventory">View full inventory</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            {inventoryPreviewRows.length ? (
              inventoryPreviewRows.map((row) => (
                <div
                  key={row.product.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '52px minmax(0, 1fr) auto',
                    gap: 'var(--space-3)',
                    alignItems: 'center',
                  }}
                >
                  <DashboardProductImage product={row.product} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{getProductDisplayName(row.product)}</div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                      {row.product.category || 'Uncategorized'} | {row.product.unitSize || 'Unit not set'}
                    </div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                      Oldest: {row.oldestLot ? `${row.oldestLot.batchNumber} (${formatDate(row.oldestLot.productionDate)})` : '-'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className={`badge badge-${row.stockStatus === 'low' ? 'partial' : row.stockStatus === 'out' ? 'declined' : 'fulfilled'}`}>
                      {getStockStatusLabel(row.stockStatus)}
                    </span>
                    <div className="cell-monospace" style={{ marginTop: 6 }}>{row.totalRemaining.toLocaleString()} left</div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                      {row.activeBatches.length.toLocaleString()} active lots
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                <div className="empty-state-title">No urgent stock alerts</div>
                <div className="empty-state-description">
                  Log production lots to populate the inventory preview.
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
            {recentOrders.length ? (
              recentOrders.map((order) => (
                <tr key={order.id}>
                  <td className="cell-monospace">#{order.orderNumber}</td>
                  <td style={{ fontWeight: 600 }}>{getClientName(state.clients, order.clientId)}</td>
                  <td>{getLocationName(state.locations, order.locationId)}</td>
                  <td><span className={`badge badge-${order.status}`}>{order.status}</span></td>
                  <td className="cell-monospace">{formatCurrency(getOrderValue(order))}</td>
                  <td className="cell-monospace">{order.qbInvoiceNumber ?? '-'}</td>
                  <td>{formatDate(order.createdAt)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" style={{ padding: 0 }}>
                  <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                    <div className="empty-state-title">No orders yet</div>
                    <div className="empty-state-description">
                      New incoming orders will appear here once the operations team starts using the system.
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DashboardProductImage({ product }) {
  const imageUrl = getProductImageUrl(product, { fallback: true });
  const usesFallback = !hasProductImage(product);

  return (
    <div className={`product-thumb ${usesFallback ? 'product-thumb-fallback' : ''}`} style={{ width: 52, height: 52 }}>
      {imageUrl ? <img src={imageUrl} alt={getProductDisplayName(product)} /> : <ImageOff size={18} />}
    </div>
  );
}

function StatCard({ icon, label, value, detail, active, onClick }) {
  const content = (
    <>
      <div className="stat-card-header">
        <div className="stat-card-icon">
          {createElement(icon, { size: 20 })}
        </div>
      </div>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
      <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>{detail}</div>
    </>
  );

  return (
    <button
      className={`stat-card stat-card-clickable ${active ? 'stat-card-active' : ''}`}
      type="button"
      onClick={onClick}
      aria-pressed={active}
    >
      {content}
    </button>
  );
}

function DashboardOrderPanel({ title, description, orders, clients, locations }) {
  return (
    <div className="card dashboard-order-panel section">
      <div className="dashboard-order-panel-header">
        <div>
          <div className="card-title">{title}</div>
          <div className="dashboard-order-panel-description">{description}</div>
        </div>
        <span className="badge badge-active">{orders.length.toLocaleString()} orders</span>
      </div>
      {orders.length ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Client</th>
              <th>Location</th>
              <th>Status</th>
              <th>Outstanding</th>
              <th>Total Value</th>
              <th>QB Invoice</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {[...orders]
              .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
              .map((order) => (
                <tr key={order.id}>
                  <td className="cell-monospace">#{order.orderNumber}</td>
                  <td style={{ fontWeight: 600 }}>{getClientName(clients, order.clientId)}</td>
                  <td>{getLocationName(locations, order.locationId)}</td>
                  <td><span className={`badge badge-${order.status}`}>{order.status}</span></td>
                  <td className="cell-monospace">{getOrderOutstandingQty(order).toLocaleString()}</td>
                  <td className="cell-monospace">{formatCurrency(getOrderValue(order))}</td>
                  <td className="cell-monospace">{order.qbInvoiceNumber ?? order.invoiceNumber ?? '-'}</td>
                  <td>{formatDate(order.createdAt)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
          <div className="empty-state-title">No matching orders</div>
          <div className="empty-state-description">
            This dashboard category is currently empty.
          </div>
        </div>
      )}
    </div>
  );
}
