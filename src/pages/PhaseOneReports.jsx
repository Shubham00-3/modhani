import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, Download, RotateCcw, Trash2, X } from 'lucide-react';
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
  formatDate,
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
import { printReport } from '../utils/printDocuments';

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

function compactAxisLabel(value, maxLength = 12) {
  const label = String(value ?? '');
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}...` : label;
}

export default function PhaseOneReports() {
  const { state } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const hasSecondaryFilters = Boolean(filters.from || filters.to || filters.batchNumber || filters.period !== 'daily');
  const [showSecondary, setShowSecondary] = useState(hasSecondaryFilters);
  const dashboardSearch = (searchParams.get('q') ?? '').trim().toLowerCase();
  const hasActiveFilters = Boolean(
    filters.clientId || filters.locationId || filters.productId || filters.status || filters.batchNumber || filters.from || filters.to || filters.period !== 'daily' || dashboardSearch
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
      const matchesSearch = dashboardSearch
        ? [
            row.orderNumber,
            row.clientName,
            row.locationName,
            row.productDisplayName,
            row.category,
            row.status,
            row.source,
            row.batchNumbers,
            row.invoiceNumber,
            row.qbInvoiceNumber,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(dashboardSearch)
        : true;

      return matchesClient && matchesLocation && matchesStatus && matchesFrom && matchesTo && matchesProduct && matchesBatch && matchesSearch;
    });
  }, [dashboardSearch, filters, state.reportRows]);

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
    // Count any order that has reached or passed the shipped milestone.
    // After driver POD, an order's status flips from 'shipped' to 'delivered',
    // but the units were still shipped — so we include both here.
    const SHIPPED_STATUSES = new Set(['shipped', 'delivered']);
    const grouped = new Map();
    filteredReportRows
      .filter((row) => SHIPPED_STATUSES.has(row.status))
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

  const handleDownloadPdf = () => {
    const filterSummary = [];
    if (filters.clientId) filterSummary.push({ label: 'Client', value: getClientName(state.clients, filters.clientId) });
    if (filters.locationId) filterSummary.push({ label: 'Location', value: getLocationName(state.locations, filters.locationId) });
    if (filters.productId) filterSummary.push({ label: 'Product', value: getProductDisplayName(getProduct(state.products, filters.productId)) });
    if (filters.status) filterSummary.push({ label: 'Status', value: filters.status });
    if (filters.batchNumber) filterSummary.push({ label: 'Lot code', value: filters.batchNumber });
    if (filters.from) filterSummary.push({ label: 'From', value: filters.from });
    if (filters.to) filterSummary.push({ label: 'To', value: filters.to });
    if (filters.period !== 'daily') filterSummary.push({ label: 'Period', value: filters.period });
    if (dashboardSearch) filterSummary.push({ label: 'Search', value: dashboardSearch });

    printReport({
      filterSummary,
      summary: reportingSummary,
      salesVolume,
      salesVolumePeriod: filters.period,
      revenueByClient,
      topProducts,
      ordersByLocation,
      fulfilmentRate,
      orders: filteredOrders,
      clients: state.clients,
      locations: state.locations,
    });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <BarChart3 size={28} /> Reports
          </h1>
          <p className="page-subtitle">
            Persisted operational reporting across clients, locations, products, status, dates, and lot traceability.
          </p>
        </div>
        <div className="page-header-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={handleDownloadPdf}
            title="Download the current report view as a PDF"
          >
            <Download size={16} /> Download PDF
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              const target = document.getElementById('trash-report-section');
              if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            <Trash2 size={16} /> Trash Report
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <select aria-label="Filter by client" title="Filter by client" className="form-select" value={filters.clientId} onChange={(event) => setFilters((current) => ({ ...current, clientId: event.target.value, locationId: '' }))}>
          <option value="">All Clients</option>
          {state.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select>
        <select aria-label="Filter by location" title="Filter by location" className="form-select" value={filters.locationId} onChange={(event) => setFilters((current) => ({ ...current, locationId: event.target.value }))}>
          <option value="">All Locations</option>
          {state.locations.filter((location) => (filters.clientId ? location.clientId === filters.clientId : true)).map((location) => (
            <option key={location.id} value={location.id}>{location.name}</option>
          ))}
        </select>
        <select aria-label="Filter by product" title="Filter by product" className="form-select" value={filters.productId} onChange={(event) => setFilters((current) => ({ ...current, productId: event.target.value }))}>
          <option value="">All Products</option>
          {state.products.map((product) => <option key={product.id} value={product.id}>{getProductDisplayName(product)}</option>)}
        </select>
        <select aria-label="Filter by order status" title="Filter by order status" className="form-select" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="partial">Partial</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="invoiced">Invoiced</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="declined">Declined</option>
        </select>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => setShowSecondary((v) => !v)}
          aria-expanded={showSecondary}
        >
          {showSecondary ? 'Hide' : 'More'} filters
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={!hasActiveFilters}
          onClick={() =>
            {
              const nextSearchParams = new URLSearchParams(searchParams);
              nextSearchParams.delete('q');
              setSearchParams(nextSearchParams);
              setFilters({
              clientId: '',
              locationId: '',
              productId: '',
              status: '',
              batchNumber: '',
              from: '',
              to: '',
              period: 'daily',
              });
            }
          }
        >
          <RotateCcw size={14} /> Reset Filters
        </button>
      </div>
      {showSecondary ? (
        <div className="filter-bar filter-bar-secondary">
          <input aria-label="From date" title="From date" className="form-input" type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
          <input aria-label="To date" title="To date" className="form-input" type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
          <input aria-label="Filter by lot code" className="form-input" placeholder="Lot code" value={filters.batchNumber} onChange={(event) => setFilters((current) => ({ ...current, batchNumber: event.target.value }))} />
          <select aria-label="Reporting period" title="Reporting period" className="form-select" value={filters.period} onChange={(event) => setFilters((current) => ({ ...current, period: event.target.value }))}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
      ) : null}

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
          {salesVolume.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={salesVolume} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} tickMargin={6} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} width={40} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(26, 48, 33, 0.04)' }} />
                <Bar dataKey="units" fill="#1A3021" name="Units" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState message="No shipments in the selected range." />
          )}
        </ChartCard>

        <ChartCard title="Revenue by Client">
          {revenueByClient.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={revenueByClient} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} tickMargin={6} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} width={56} tickFormatter={currencyTickFormatter} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(88, 123, 102, 0.06)' }} />
                <Bar dataKey="revenue" fill="#587B66" name="Revenue" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState message="No client revenue to summarise." />
          )}
        </ChartCard>
      </div>

      <div className="grid-2 section">
        <ChartCard title="Top Products by Units Shipped">
          {topProducts.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topProducts} margin={{ top: 8, right: 12, left: 0, bottom: 46 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
                  tickFormatter={(value) => compactAxisLabel(value, 18)}
                  tickMargin={10}
                  angle={-32}
                  textAnchor="end"
                  height={56}
                  interval={0}
                />
                <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} width={40} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(209, 161, 78, 0.08)' }} />
                <Bar dataKey="units" fill="#D1A14E" name="Units" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState message="No shipped product data yet." />
          )}
        </ChartCard>

        <ChartCard title="Orders by Location">
          {ordersByLocation.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={ordersByLocation} margin={{ top: 8, right: 12, left: 0, bottom: 46 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
                  tickFormatter={(value) => compactAxisLabel(value, 18)}
                  tickMargin={10}
                  angle={-32}
                  textAnchor="end"
                  height={56}
                  interval={0}
                />
                <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} width={40} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(143, 168, 153, 0.08)' }} />
                <Bar dataKey="orders" fill="#8FA899" name="Orders" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState message="No orders to break down by location." />
          )}
        </ChartCard>
      </div>

      <div className="grid-2 section">
        <div style={{ gridColumn: '1 / -1', width: 'min(720px, 100%)', justifySelf: 'center' }}>
          <ChartCard title="Fulfilment Rate">
            {fulfilmentRate.length ? (
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
            ) : (
              <ChartEmptyState message="No fulfilment data yet." />
            )}
          </ChartCard>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Orders Table</div>
        <div className="table-scroll-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Client</th>
              <th>Location</th>
              <th className="cell-align-right">Total Value</th>
              <th>QB Invoice</th>
              <th>Packing Slip</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((order) => (
              <tr
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedOrderId(order.id);
                  }
                }}
                role="button"
                tabIndex={0}
                style={{ cursor: 'pointer' }}
                title={`Open drill-down for Order #${order.orderNumber}`}
              >
                <td><span className={`badge badge-${order.status}`}>{order.status}</span></td>
                <td style={{ fontWeight: 600 }}>{getClientName(state.clients, order.clientId)}</td>
                <td>{getLocationName(state.locations, order.locationId)}</td>
                <td className="cell-monospace">{formatCurrency(getOrderValue(order))}</td>
                <td className="cell-monospace cell-align-left">{order.qbInvoiceNumber ?? '-'}</td>
                <td className="cell-monospace cell-align-left">{order.packingSlipNumber ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
        </>
      )}

      <TrashReportSection />

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

function TrashReportSection() {
  const { state } = useApp();
  const [productFilter, setProductFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const rows = useMemo(() => state.trashReportRows ?? [], [state.trashReportRows]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (productFilter && row.productId !== productFilter) return false;
      if (fromDate && row.deletedAt && new Date(row.deletedAt) < new Date(fromDate)) return false;
      if (toDate && row.deletedAt && new Date(row.deletedAt) > new Date(`${toDate}T23:59:59`)) return false;
      return true;
    });
  }, [rows, productFilter, fromDate, toDate]);

  const summary = useMemo(() => {
    const monthKey = new Date().toISOString().slice(0, 7);
    let totalUnits = 0;
    let unitsThisMonth = 0;
    let lotsThisMonth = 0;
    filtered.forEach((row) => {
      const qty = Number(row.qtyTrashed) || 0;
      totalUnits += qty;
      if (row.deletedAt?.slice(0, 7) === monthKey) {
        unitsThisMonth += qty;
        lotsThisMonth += 1;
      }
    });
    return {
      lots: filtered.length,
      totalUnits,
      unitsThisMonth,
      lotsThisMonth,
    };
  }, [filtered]);

  const trashByProduct = useMemo(() => {
    const grouped = new Map();
    filtered.forEach((row) => {
      const name = row.productDisplayName || row.productName || 'Unknown';
      grouped.set(name, (grouped.get(name) ?? 0) + (Number(row.qtyTrashed) || 0));
    });
    return [...grouped.entries()]
      .map(([name, units]) => ({ name, units }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 10);
  }, [filtered]);

  const productOptions = useMemo(() => {
    const seen = new Map();
    rows.forEach((row) => {
      if (!seen.has(row.productId)) {
        seen.set(row.productId, row.productDisplayName || row.productName || row.productId);
      }
    });
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const hasActiveFilters = Boolean(productFilter || fromDate || toDate);

  return (
    <div className="section" id="trash-report-section">
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Trash2 size={18} /> Trash Report
            </div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Production lots that were soft-deleted from inventory. Restore from Production &amp; Lots if a lot was trashed in error.
            </div>
          </div>
        </div>

        <div className="grid-4 section" style={{ marginTop: 'var(--space-4)' }}>
          <ReportInfoCard label="Trashed Lots" value={summary.lots.toLocaleString()} />
          <ReportInfoCard label="Total Units Trashed" value={summary.totalUnits.toLocaleString()} />
          <ReportInfoCard label="Lots Trashed This Month" value={summary.lotsThisMonth.toLocaleString()} />
          <ReportInfoCard label="Units Trashed This Month" value={summary.unitsThisMonth.toLocaleString()} />
        </div>

        <div className="filter-bar">
          <select
            className="form-select"
            aria-label="Filter trash by product"
            value={productFilter}
            onChange={(event) => setProductFilter(event.target.value)}
          >
            <option value="">All Products</option>
            {productOptions.map((product) => (
              <option key={product.id} value={product.id}>{product.name}</option>
            ))}
          </select>
          <input
            className="form-input"
            type="date"
            aria-label="Trashed from date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
          <input
            className="form-input"
            type="date"
            aria-label="Trashed to date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
          <button
            className="btn btn-secondary"
            type="button"
            disabled={!hasActiveFilters}
            onClick={() => {
              setProductFilter('');
              setFromDate('');
              setToDate('');
            }}
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>

        <ChartCard title="Trashed Units by Product">
          {trashByProduct.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trashByProduct} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }} tickMargin={6} interval={0} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} width={40} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(239, 68, 68, 0.06)' }} />
                <Bar dataKey="units" fill="#EF4444" name="Units" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState message="No trashed units in the selected range." />
          )}
        </ChartCard>

        {filtered.length ? (
          <div className="table-scroll-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lot Code</th>
                  <th>Product</th>
                  <th>Production Date</th>
                  <th className="cell-align-right">Qty Trashed</th>
                  <th>Trashed At</th>
                  <th>By</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.batchId}>
                    <td className="cell-monospace cell-align-left">{row.lotCode}</td>
                    <td style={{ fontWeight: 600 }}>{row.productDisplayName || row.productName}</td>
                    <td>{row.productionDate ? formatDate(row.productionDate) : '-'}</td>
                    <td className="cell-monospace">{Number(row.qtyTrashed || 0).toLocaleString()}</td>
                    <td>{row.deletedAt ? formatDateTime(row.deletedAt) : '-'}</td>
                    <td>{row.deletedUserName || '-'}</td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{row.deletedReason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <div className="empty-state-title">No trashed lots</div>
            <div className="empty-state-description">
              Damaged or discarded production lots will show up here once staff moves them to trash from the Production &amp; Lots page.
            </div>
          </div>
        )}
      </div>
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
    <div className="report-info-card card">
      <div className="report-info-card-label">{label}</div>
      <div className="report-info-card-value">{value}</div>
    </div>
  );
}

function ChartEmptyState({ message }) {
  return (
    <div className="chart-empty-state">
      <BarChart3 size={28} />
      <div>{message}</div>
    </div>
  );
}

function currencyTickFormatter(value) {
  if (value >= 1000) return `$${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return `$${value}`;
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
        <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>Lot Breakdown & Pricing</h3>
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
                    Lot Breakdown
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
                          <span className="cell-monospace cell-align-left">{getBatchLabel(state.batches, assigned.batchId)}</span>
                          <span className="cell-monospace">{assigned.qty.toLocaleString()} units</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                      No lots assigned yet.
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
