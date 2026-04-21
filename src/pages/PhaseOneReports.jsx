import { useMemo, useState } from 'react';
import { BarChart3, RotateCcw, X } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useApp } from '../context/useApp';
import {
  formatCurrency,
  formatDateTime,
  getBatchLabel,
  getClientName,
  getItemOutstandingQty,
  getLocationName,
  getOrderFulfilmentBucket,
  getOrderOutstandingQty,
  getOrderValue,
  getProduct,
  getProductDisplayName,
} from '../data/phaseOneData';

const CHART_COLORS = ['#1A3021', '#587B66', '#D1A14E', '#8FA899', '#D97706', '#EF4444'];

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 12px',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} style={{ color: entry.color, fontSize: 'var(--font-size-sm)' }}>
          {entry.name}: {isCurrencySeries(entry.name) ? formatCurrency(entry.value) : entry.value}
        </div>
      ))}
    </div>
  );
}

function isCurrencySeries(seriesName) {
  return ['Revenue'].includes(seriesName);
}

function startOfWeek(date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = next.getDate() - day + (day === 0 ? -6 : 1);
  next.setDate(diff);
  next.setHours(0, 0, 0, 0);
  return next;
}

function formatBucket(date, period) {
  if (period === 'monthly') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  if (period === 'weekly') return `Wk of ${startOfWeek(date).toISOString().slice(0, 10)}`;
  return date.toISOString().slice(0, 10);
}

export default function PhaseOneReports() {
  const { state } = useApp();
  const [filters, setFilters] = useState({
    clientId: '',
    locationId: '',
    productId: '',
    status: '',
    batchNumber: '',
    from: '',
    to: '',
    period: 'daily',
  });
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const hasActiveFilters = Boolean(
    filters.clientId || filters.locationId || filters.productId || filters.status || filters.batchNumber || filters.from || filters.to || filters.period !== 'daily'
  );

  const filteredReportRows = useMemo(() => {
    return state.reportRows.filter((row) => {
      const orderDate = new Date(row.createdAt);
      const matchesClient = filters.clientId ? row.clientId === filters.clientId : true;
      const matchesLocation = filters.locationId ? row.locationId === filters.locationId : true;
      const matchesStatus = filters.status ? row.status === filters.status : true;
      const matchesFrom = filters.from ? orderDate >= new Date(filters.from) : true;
      const matchesTo = filters.to ? orderDate <= new Date(`${filters.to}T23:59:59`) : true;
      const matchesProduct = filters.productId ? row.productId === filters.productId : true;
      const matchesBatch = filters.batchNumber
        ? row.batchNumbers.toLowerCase().includes(filters.batchNumber.toLowerCase())
        : true;

      return matchesClient && matchesLocation && matchesStatus && matchesFrom && matchesTo && matchesProduct && matchesBatch;
    });
  }, [filters, state.reportRows]);

  const filteredOrders = useMemo(() => {
    const matchedIds = new Set(filteredReportRows.map((row) => row.orderId));
    return state.orders.filter((order) => matchedIds.has(order.id));
  }, [filteredReportRows, state.orders]);
  const selectedOrder = filteredOrders.find((order) => order.id === selectedOrderId) ?? null;

  const salesVolume = useMemo(() => {
    const grouped = new Map();
    filteredReportRows.forEach((row) => {
      const date = new Date(row.shippedAt ?? row.fulfilledAt ?? row.createdAt);
      const key = formatBucket(date, filters.period);
      grouped.set(key, (grouped.get(key) ?? 0) + row.fulfilledQty);
    });
    return [...grouped.entries()].map(([label, units]) => ({ label, units }));
  }, [filteredReportRows, filters.period]);

  const revenueByClient = useMemo(() => {
    const grouped = new Map();
    filteredReportRows.forEach((row) => {
      grouped.set(row.clientName, (grouped.get(row.clientName) ?? 0) + row.orderedValue);
    });
    return [...grouped.entries()].map(([name, revenue]) => ({ name, revenue }));
  }, [filteredReportRows]);

  const topProducts = useMemo(() => {
    const grouped = new Map();
    filteredReportRows
      .filter((row) => row.status === 'shipped')
      .forEach((row) => {
        grouped.set(row.productDisplayName, (grouped.get(row.productDisplayName) ?? 0) + row.fulfilledQty);
      });
    return [...grouped.entries()]
      .map(([name, units]) => ({ name, units }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 5);
  }, [filteredReportRows]);

  const ordersByLocation = useMemo(() => {
    const grouped = new Map();
    filteredOrders.forEach((order) => {
      const locationName = getLocationName(state.locations, order.locationId);
      grouped.set(locationName, (grouped.get(locationName) ?? 0) + 1);
    });
    return [...grouped.entries()].map(([name, orders]) => ({ name, orders }));
  }, [filteredOrders, state.locations]);

  const fulfilmentRate = useMemo(() => {
    const grouped = new Map();
    filteredOrders.forEach((order) => {
      const bucket = getOrderFulfilmentBucket(order);
      grouped.set(bucket, (grouped.get(bucket) ?? 0) + 1);
    });
    return [...grouped.entries()].map(([name, value]) => ({ name, value }));
  }, [filteredOrders]);

  const reportingSummary = useMemo(() => {
    const fulfilledUnits = filteredReportRows.reduce((sum, row) => sum + row.fulfilledQty, 0);
    const outstandingUnits = filteredReportRows.reduce((sum, row) => sum + row.outstandingQty, 0);
    const invoiceableRevenue = filteredReportRows.reduce((sum, row) => sum + row.fulfilledValue, 0);

    return {
      orders: filteredOrders.length,
      fulfilledUnits,
      outstandingUnits,
      invoiceableRevenue,
    };
  }, [filteredOrders.length, filteredReportRows]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <BarChart3 size={28} /> Reports
          </h1>
          <p className="page-subtitle">
            Persisted operational reporting across clients, locations, products, status, dates, and batch traceability.
          </p>
        </div>
      </div>

      <div className="filter-bar">
        <select className="form-select" value={filters.clientId} onChange={(event) => setFilters((current) => ({ ...current, clientId: event.target.value, locationId: '' }))}>
          <option value="">All Clients</option>
          {state.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select>
        <select className="form-select" value={filters.locationId} onChange={(event) => setFilters((current) => ({ ...current, locationId: event.target.value }))}>
          <option value="">All Locations</option>
          {state.locations.filter((location) => (filters.clientId ? location.clientId === filters.clientId : true)).map((location) => (
            <option key={location.id} value={location.id}>{location.name}</option>
          ))}
        </select>
        <select className="form-select" value={filters.productId} onChange={(event) => setFilters((current) => ({ ...current, productId: event.target.value }))}>
          <option value="">All Products</option>
          {state.products.map((product) => <option key={product.id} value={product.id}>{getProductDisplayName(product)}</option>)}
        </select>
        <select className="form-select" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="partial">Partial</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="invoiced">Invoiced</option>
          <option value="shipped">Shipped</option>
          <option value="declined">Declined</option>
        </select>
        <input className="form-input" type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
        <input className="form-input" type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
        <input className="form-input" placeholder="Batch number" value={filters.batchNumber} onChange={(event) => setFilters((current) => ({ ...current, batchNumber: event.target.value }))} />
        <select className="form-select" value={filters.period} onChange={(event) => setFilters((current) => ({ ...current, period: event.target.value }))}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={!hasActiveFilters}
          onClick={() =>
            setFilters({
              clientId: '',
              locationId: '',
              productId: '',
              status: '',
              batchNumber: '',
              from: '',
              to: '',
              period: 'daily',
            })
          }
        >
          <RotateCcw size={14} /> Reset Filters
        </button>
      </div>

      <div className="grid-4 section">
        <ReportInfoCard label="Matching Orders" value={reportingSummary.orders.toLocaleString()} />
        <ReportInfoCard label="Fulfilled Units" value={reportingSummary.fulfilledUnits.toLocaleString()} />
        <ReportInfoCard label="Outstanding Units" value={reportingSummary.outstandingUnits.toLocaleString()} />
        <ReportInfoCard label="Invoiceable Revenue" value={formatCurrency(reportingSummary.invoiceableRevenue)} />
      </div>

      {hasActiveFilters ? (
        <div className="alert alert-info" style={{ marginBottom: 'var(--space-6)' }}>
          <BarChart3 size={18} />
          <div className="alert-content">
            <div className="alert-title">Filtered reporting view</div>
            <div className="alert-description">
              Charts and drill-downs are currently narrowed to the selected filters only.
            </div>
          </div>
        </div>
      ) : null}

      {!filteredOrders.length ? (
        <div className="empty-state card">
          <div className="empty-state-title">No matching report data</div>
          <div className="empty-state-description">
            Adjust or reset the current filters to bring matching orders back into the reporting view.
          </div>
        </div>
      ) : (
        <>
      <div className="grid-2 section">
        <ChartCard title={`Sales Volume (${filters.period})`}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={salesVolume}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="units" fill="#1A3021" name="Units" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue by Client">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={revenueByClient}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="revenue" fill="#587B66" name="Revenue" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid-3 section">
        <ChartCard title="Top Products by Units Shipped">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={topProducts}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="units" fill="#D1A14E" name="Units" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Orders by Location">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={ordersByLocation}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="orders" fill="#8FA899" name="Orders" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Fulfilment Rate">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={fulfilmentRate} dataKey="value" nameKey="name" innerRadius={50} outerRadius={86}>
                {fulfilmentRate.map((entry, index) => (
                  <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="card">
        <div className="card-title">Orders Table</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Client</th>
              <th>Location</th>
              <th>Total Value</th>
              <th>QB Invoice</th>
              <th>Packing Slip</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((order) => (
              <tr
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                style={{ cursor: 'pointer' }}
                title={`Open drill-down for Order #${order.orderNumber}`}
              >
                <td><span className={`badge badge-${order.status}`}>{order.status}</span></td>
                <td style={{ fontWeight: 600 }}>{getClientName(state.clients, order.clientId)}</td>
                <td>{getLocationName(state.locations, order.locationId)}</td>
                <td className="cell-monospace">{formatCurrency(getOrderValue(order))}</td>
                <td className="cell-monospace">{order.qbInvoiceNumber ?? '-'}</td>
                <td className="cell-monospace">{order.packingSlipNumber ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
        </>
      )}

      {selectedOrder ? (
        <>
          <div className="slide-panel-overlay" onClick={() => setSelectedOrderId(null)} />
          <div className="slide-panel">
            <div className="slide-panel-header">
              <div>
                <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>
                  Report Drill-Down: Order #{selectedOrder.orderNumber}
                </h2>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  {getClientName(state.clients, selectedOrder.clientId)} | {getLocationName(state.locations, selectedOrder.locationId)}
                </div>
              </div>
              <button className="btn btn-ghost" type="button" onClick={() => setSelectedOrderId(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="slide-panel-body">
              <ReportOrderDrillDown order={selectedOrder} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      {children}
    </div>
  );
}

function ReportInfoCard({ label, value }) {
  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <div style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
        {label}
      </div>
      <div style={{ marginTop: 6, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function ReportOrderDrillDown({ order }) {
  const { state } = useApp();
  const orderAudit = state.auditLog
    .filter((entry) => entry.orderId === order.id)
    .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div className="grid-2">
        <ReportInfoCard label="Status" value={<span className={`badge badge-${order.status}`}>{order.status}</span>} />
        <ReportInfoCard label="Created" value={formatDateTime(order.createdAt)} />
        <ReportInfoCard label="Outstanding" value={`${getOrderOutstandingQty(order).toLocaleString()} units`} />
        <ReportInfoCard label="Invoice" value={order.invoiceNumber ?? '-'} />
        <ReportInfoCard label="QuickBooks" value={order.qbInvoiceNumber ?? '-'} />
        <ReportInfoCard label="Packing Slip" value={order.packingSlipNumber ?? '-'} />
      </div>

      <div>
        <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>Batch Breakdown & Pricing</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {order.items.map((item) => {
            const product = getProduct(state.products, item.productId);

            return (
              <div
                key={item.id}
                style={{
                  padding: 'var(--space-4)',
                  background: 'var(--color-bg)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{getProductDisplayName(product)}</div>
                    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                      Ordered {item.quantity.toLocaleString()} | Fulfilled {item.fulfilledQty.toLocaleString()} | Outstanding{' '}
                      {getItemOutstandingQty(item).toLocaleString()}
                      {(item.declinedQty ?? 0) > 0 ? ` | Declined ${(item.declinedQty ?? 0).toLocaleString()}` : ''}
                    </div>
                  </div>
                  <div className="cell-monospace">{formatCurrency(item.overridePrice ?? item.clientPrice ?? item.basePrice)}</div>
                </div>

                <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                  <span>Base: {formatCurrency(item.basePrice)}</span>
                  <span>Client: {formatCurrency(item.clientPrice)}</span>
                  {item.overridePrice != null ? (
                    <span style={{ color: 'var(--color-warning)' }}>
                      Override: {formatCurrency(item.overridePrice)} ({item.overrideReason})
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-text-secondary)' }}>No price override</span>
                  )}
                </div>

                <div style={{ marginTop: 'var(--space-3)' }}>
                  <div style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>
                    Batch Breakdown
                  </div>
                  {item.assignedBatches.length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      {item.assignedBatches.map((assigned, index) => (
                        <div
                          key={`${assigned.batchId}-${index}`}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 'var(--space-4)',
                            padding: '10px 12px',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-sm)',
                          }}
                        >
                          <span className="cell-monospace">{getBatchLabel(state.batches, assigned.batchId)}</span>
                          <span className="cell-monospace">{assigned.qty.toLocaleString()} units</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                      No batches assigned yet.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>Full Audit Trail</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {orderAudit.length ? (
            orderAudit.map((entry) => (
              <div
                key={entry.id}
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  borderLeft: '2px solid var(--color-secondary)',
                  background: 'var(--color-bg)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div style={{ fontWeight: 600 }}>{entry.details}</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 4 }}>
                  {entry.userName} | {formatDateTime(entry.timestamp)}
                </div>
                {(entry.previousValue != null || entry.newValue != null) ? (
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 4 }}>
                    {entry.previousValue ?? '-'} {'->'} {entry.newValue ?? '-'}
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
              <div className="empty-state-title">No audit entries</div>
              <div className="empty-state-description">
                This order does not have recorded actions yet.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
