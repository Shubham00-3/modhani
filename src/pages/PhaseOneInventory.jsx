import { useMemo, useState } from 'react';
import { History, ImageOff, PackageSearch, RotateCcw } from 'lucide-react';
import { useApp } from '../context/useApp';
import {
  formatDate,
  formatDateTime,
  getBatchLabel,
  getActiveCatalogProducts,
  getProduct,
  getProductDisplayName,
  getProductImageUrl,
  getProductOrderUnitLabel,
  hasProductImage,
} from '../data/phaseOneData';
import { LOW_STOCK_THRESHOLD, getStockStatus } from '../lib/inventoryThresholds';
import ProductImageLightbox from '../components/ProductImageLightbox';

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
  const [sortBy, setSortBy] = useState('product');
  const [previewProduct, setPreviewProduct] = useState(null);
  const activeProducts = useMemo(() => getActiveCatalogProducts(state.products), [state.products]);
  const categories = useMemo(
    () => [...new Set(activeProducts.map((product) => product.category).filter(Boolean))].sort(),
    [activeProducts]
  );

  const inventoryRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return activeProducts
      .map((product) => {
        const productBatches = state.batches.filter((batch) => batch.productId === product.id);
        const visibleBatches = lotStatusFilter
          ? productBatches.filter((batch) => batch.status === lotStatusFilter)
          : productBatches;
        const activeBatches = productBatches.filter((batch) => batch.status === 'active' && batch.qtyRemaining > 0);
        const totalProduced = productBatches.reduce((sum, batch) => sum + Number(batch.qtyProduced ?? 0), 0);
        const totalRemaining = productBatches.reduce((sum, batch) => sum + Number(batch.qtyRemaining ?? 0), 0);
        const oldestLot = [...activeBatches].sort((a, b) => new Date(a.productionDate) - new Date(b.productionDate))[0];
        const stockStatus = getStockStatus(totalRemaining);
        const lotCodes = visibleBatches.map((batch) => batch.batchNumber).join(' ');

        return {
          product,
          batches: visibleBatches,
          activeBatches,
          totalProduced,
          totalRemaining,
          oldestLot,
          stockStatus,
          searchText: [
            product.name,
            product.unitSize,
            product.category,
            product.itemNumber,
            product.upc,
            product.packagingDetails,
            product.orderUnitLabel,
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
      .sort((a, b) => {
        if (sortBy === 'category') {
          return (a.product.category || '').localeCompare(b.product.category || '')
            || getProductDisplayName(a.product).localeCompare(getProductDisplayName(b.product));
        }
        if (sortBy === 'remaining-asc') return a.totalRemaining - b.totalRemaining;
        if (sortBy === 'remaining-desc') return b.totalRemaining - a.totalRemaining;
        if (sortBy === 'status') {
          const statusOrder = { out: 0, low: 1, in: 2 };
          return statusOrder[a.stockStatus] - statusOrder[b.stockStatus]
            || a.totalRemaining - b.totalRemaining;
        }
        if (sortBy === 'oldest-lot') {
          const aDate = a.oldestLot?.productionDate ? new Date(a.oldestLot.productionDate).getTime() : Number.MAX_SAFE_INTEGER;
          const bDate = b.oldestLot?.productionDate ? new Date(b.oldestLot.productionDate).getTime() : Number.MAX_SAFE_INTEGER;
          return aDate - bDate;
        }

        return getProductDisplayName(a.product).localeCompare(getProductDisplayName(b.product));
      });
  }, [activeProducts, categoryFilter, lotStatusFilter, search, sortBy, state.batches, stockFilter]);

  const historyRows = useMemo(() => buildInventoryHistory(state), [state]);
  const hasActiveFilters = Boolean(search || categoryFilter || stockFilter || lotStatusFilter);

  function scrollToHistory() {
    const el = document.getElementById('inventory-history');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="page-subtitle">Product stock, lot codes, warehouse status, and inventory movement history.</p>
        </div>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={scrollToHistory}
          disabled={!historyRows.length}
          title={historyRows.length ? 'Jump to Inventory History' : 'No inventory history yet'}
        >
          <History size={16} /> View Inventory History
          {historyRows.length ? (
            <span className="inventory-history-count">{historyRows.length}</span>
          ) : null}
        </button>
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
          <select className="form-select" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="product">Sort by Product</option>
            <option value="category">Sort by Category</option>
            <option value="status">Sort by Stock Status</option>
            <option value="remaining-asc">Sort by Low Remaining</option>
            <option value="remaining-desc">Sort by High Remaining</option>
            <option value="oldest-lot">Sort by Oldest Active Lot</option>
          </select>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={!hasActiveFilters && sortBy === 'product'}
            onClick={() => {
              setSearch('');
              setCategoryFilter('');
              setStockFilter('');
              setLotStatusFilter('');
              setSortBy('product');
            }}
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>

        {inventoryRows.length ? (
          <div className="inventory-grid">
            {inventoryRows.map(({ product, batches, activeBatches, totalProduced, totalRemaining, oldestLot, stockStatus }) => (
              <div key={product.id} className={`inventory-card inventory-card-${stockStatus}`}>
                <div className="inventory-card-main">
                  <ProductImage product={product} onPreview={setPreviewProduct} />
                  <div className="inventory-card-info">
                    <div className="inventory-card-name">{getProductDisplayName(product)}</div>
                    <div className="inventory-card-meta">
                      {product.category || 'Uncategorized'} · {product.packagingDetails || product.unitSize || 'Not set'} · {getProductOrderUnitLabel(product)}
                      {product.itemNumber ? ` · #${product.itemNumber}` : ''}
                    </div>
                  </div>
                </div>
                <div className="inventory-card-stats">
                  <div className="inventory-stat-primary">
                    <span className="inventory-stat-value">{totalRemaining.toLocaleString()}</span>
                    <span className="inventory-stat-label">remaining</span>
                  </div>
                  <div className="inventory-stat-secondary">
                    <span>{totalProduced.toLocaleString()} produced</span>
                    <span>
                      <span className={`badge badge-${stockStatus === 'low' ? 'partial' : stockStatus === 'out' ? 'declined' : 'fulfilled'}`}>
                        {getStockStatusLabel(stockStatus)}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="inventory-card-lots">
                  <div className="inventory-lots-header">
                    <span>Active lots: {activeBatches.length || 0}</span>
                    {oldestLot ? <span className="inventory-oldest">FIFO: {oldestLot.batchNumber} ({formatDate(oldestLot.productionDate)})</span> : null}
                  </div>
                  {batches.length ? (
                    <div className="inventory-lot-badges">
                      {batches.map((batch) => (
                        <span key={batch.id} className={`badge badge-${batch.status}`}>
                          {batch.batchNumber}: {batch.qtyRemaining.toLocaleString()}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="inventory-no-lots">No lots logged</div>
                  )}
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

      <div className="card" id="inventory-history" style={{ scrollMarginTop: 'var(--space-6)' }}>
        <div className="card-title">Inventory History</div>
        {historyRows.length ? (
          <div className="table-scroll-wrapper">
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
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <div className="empty-state-title">No inventory history yet</div>
            <div className="empty-state-description">Production, fulfillment, shipments, and QuickBooks invoice activity will appear here.</div>
          </div>
        )}
      </div>

      {previewProduct ? (
        <ProductImageLightbox product={previewProduct} onClose={() => setPreviewProduct(null)} />
      ) : null}
    </div>
  );
}

function ProductImage({ product, onPreview }) {
  const imageUrl = getProductImageUrl(product, { fallback: true });
  const usesFallback = !hasProductImage(product);
  const label = getProductDisplayName(product);

  return (
    <button
      type="button"
      className={`product-thumb product-thumb-button ${usesFallback ? 'product-thumb-fallback' : ''}`}
      onClick={() => onPreview?.(product)}
      aria-label={`Open ${usesFallback ? 'Modhani logo placeholder for ' : ''}${label} image`}
      title={usesFallback ? 'No product image yet. Click to view the placeholder.' : `Open ${label} image`}
    >
      {imageUrl ? <img src={imageUrl} alt={label} /> : <ImageOff size={22} />}
    </button>
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
