import { useMemo, useState } from 'react';
import { ImageOff, PackageSearch, RotateCcw } from 'lucide-react';
import { useApp } from '../context/useApp';
import {
  formatDate,
  formatDateTime,
  getBatchLabel,
  getProduct,
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

export default function PhaseOneInventory() {
  const { state } = useApp();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [lotStatusFilter, setLotStatusFilter] = useState('');
  const categories = useMemo(
    () => [...new Set(state.products.map((product) => product.category).filter(Boolean))].sort(),
    [state.products]
  );

  const inventoryRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return state.products
      .map((product) => {
        const productBatches = state.batches.filter((batch) => batch.productId === product.id);
        const visibleBatches = lotStatusFilter
          ? productBatches.filter((batch) => batch.status === lotStatusFilter)
          : productBatches;
        const activeBatches = productBatches.filter((batch) => batch.qtyRemaining > 0);
        const totalProduced = productBatches.reduce((sum, batch) => sum + Number(batch.qtyProduced ?? 0), 0);
        const totalRemaining = productBatches.reduce((sum, batch) => sum + Number(batch.qtyRemaining ?? 0), 0);
        const oldestLot = [...activeBatches].sort((a, b) => new Date(a.productionDate) - new Date(b.productionDate))[0];
        const stockStatus = getStockStatus(totalRemaining);
        const lotCodes = visibleBatches.map((batch) => batch.batchNumber).join(' ');

        return {
          product,
          batches: visibleBatches,
          totalProduced,
          totalRemaining,
          oldestLot,
          stockStatus,
          searchText: [
            product.name,
            product.unitSize,
            product.category,
            product.qbItemName,
            getProductDisplayName(product),
            lotCodes,
            stockStatus,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase(),
        };
      })
      .filter((row) => (categoryFilter ? row.product.category === categoryFilter : true))
      .filter((row) => (stockFilter ? row.stockStatus === stockFilter : true))
      .filter((row) => (lotStatusFilter ? row.batches.length > 0 : true))
      .filter((row) => (normalizedSearch ? row.searchText.includes(normalizedSearch) : true))
      .sort((a, b) => getProductDisplayName(a.product).localeCompare(getProductDisplayName(b.product)));
  }, [categoryFilter, lotStatusFilter, search, state.batches, state.products, stockFilter]);

  const historyRows = useMemo(() => buildInventoryHistory(state), [state]);
  const hasActiveFilters = Boolean(search || categoryFilter || stockFilter || lotStatusFilter);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="page-subtitle">Product stock, lot codes, warehouse status, and inventory movement history.</p>
        </div>
      </div>

      <div className="card section">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', alignItems: 'center' }}>
          <div>
            <div className="card-title">Stock Overview</div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Running low means remaining stock is {LOW_STOCK_THRESHOLD.toLocaleString()} units or less.
            </div>
          </div>
        </div>

        <div className="filter-bar">
          <input
            className="form-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products or lot codes..."
          />
          <select className="form-select" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <select className="form-select" value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
            <option value="">All Stock Statuses</option>
            <option value="in">In stock</option>
            <option value="low">Running low</option>
            <option value="out">Out of stock</option>
          </select>
          <select className="form-select" value={lotStatusFilter} onChange={(event) => setLotStatusFilter(event.target.value)}>
            <option value="">All Lot Statuses</option>
            <option value="active">Active Lots</option>
            <option value="cleared">Cleared Lots</option>
          </select>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={!hasActiveFilters}
            onClick={() => {
              setSearch('');
              setCategoryFilter('');
              setStockFilter('');
              setLotStatusFilter('');
            }}
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>

        {inventoryRows.length ? (
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            {inventoryRows.map(({ product, batches, totalProduced, totalRemaining, oldestLot, stockStatus }) => (
              <div key={product.id} className="card" style={{ padding: 'var(--space-4)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr) auto', gap: 'var(--space-4)', alignItems: 'center' }}>
                  <ProductImage product={product} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800 }}>{getProductDisplayName(product)}</div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                      {product.category || 'Uncategorized'} | {product.qbItemName || 'No QuickBooks item'}
                    </div>
                    <div style={{ marginTop: 'var(--space-2)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      {batches.length ? batches.map((batch) => (
                        <span key={batch.id} className={`badge badge-${batch.status}`}>
                          {batch.batchNumber}: {batch.qtyRemaining.toLocaleString()}
                        </span>
                      )) : <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>No lots logged</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div><span className={`badge badge-${stockStatus === 'low' ? 'partial' : stockStatus === 'out' ? 'declined' : 'fulfilled'}`}>{getStockStatusLabel(stockStatus)}</span></div>
                    <div className="cell-monospace" style={{ marginTop: 8 }}>{totalRemaining.toLocaleString()} remaining</div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>{totalProduced.toLocaleString()} produced</div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                      Oldest: {oldestLot ? `${oldestLot.batchNumber} (${formatDate(oldestLot.productionDate)})` : '-'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <PackageSearch size={32} />
            <div className="empty-state-title">No inventory matches these filters</div>
            <div className="empty-state-description">Reset filters or log production lots to populate inventory.</div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Inventory History</div>
        {historyRows.length ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Product</th>
                <th>Lot Code</th>
                <th>Quantity</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.date)}</td>
                  <td><span className="badge badge-portal">{row.type}</span></td>
                  <td>{row.productName}</td>
                  <td className="cell-monospace">{row.lotCode}</td>
                  <td className="cell-monospace">{row.quantity}</td>
                  <td>{row.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <div className="empty-state-title">No inventory history yet</div>
            <div className="empty-state-description">Production, fulfillment, shipments, and QuickBooks invoice activity will appear here.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProductImage({ product }) {
  const imageUrl = getProductImageUrl(product, { fallback: true });
  const usesFallback = !hasProductImage(product);

  return (
    <div className={`product-thumb ${usesFallback ? 'product-thumb-fallback' : ''}`} style={{ width: 72, height: 72 }}>
      {imageUrl ? <img src={imageUrl} alt={getProductDisplayName(product)} /> : <ImageOff size={22} />}
    </div>
  );
}

function buildInventoryHistory(state) {
  const rows = [];

  state.batches.forEach((batch) => {
    const product = getProduct(state.products, batch.productId);
    rows.push({
      id: `production-${batch.id}`,
      date: batch.updatedAt ?? batch.productionDate,
      type: 'Production',
      productName: getProductDisplayName(product),
      lotCode: batch.batchNumber,
      quantity: batch.qtyProduced.toLocaleString(),
      details: `${batch.status} lot with ${batch.qtyRemaining.toLocaleString()} units remaining`,
    });
  });

  state.orders.forEach((order) => {
    order.items.forEach((item) => {
      const product = getProduct(state.products, item.productId);
      item.assignedBatches.forEach((assignment, index) => {
        rows.push({
          id: `allocation-${order.id}-${item.id}-${assignment.batchId}-${index}`,
          date: order.fulfilledAt ?? order.createdAt,
          type: 'Fulfillment',
          productName: getProductDisplayName(product),
          lotCode: getBatchLabel(state.batches, assignment.batchId),
          quantity: assignment.qty.toLocaleString(),
          details: `Assigned to Order #${order.orderNumber}`,
        });
      });

      if (order.shippedAt && (item.invoiceQty ?? item.fulfilledQty) > 0) {
        rows.push({
          id: `shipment-${order.id}-${item.id}`,
          date: order.shippedAt,
          type: 'Shipment',
          productName: getProductDisplayName(product),
          lotCode: item.assignedBatches.map((assignment) => getBatchLabel(state.batches, assignment.batchId)).join(', ') || '-',
          quantity: (item.invoiceQty ?? item.fulfilledQty).toLocaleString(),
          details: `Shipped on Order #${order.orderNumber}`,
        });
      }

      if (order.qbSyncedAt && (item.invoiceQty ?? item.fulfilledQty) > 0) {
        rows.push({
          id: `qb-${order.id}-${item.id}`,
          date: order.qbSyncedAt,
          type: 'QuickBooks',
          productName: getProductDisplayName(product),
          lotCode: item.assignedBatches.map((assignment) => getBatchLabel(state.batches, assignment.batchId)).join(', ') || '-',
          quantity: (item.invoiceQty ?? item.fulfilledQty).toLocaleString(),
          details: `Synced invoice ${order.qbInvoiceNumber ?? order.invoiceNumber}`,
        });
      }
    });
  });

  return rows.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 100);
}
