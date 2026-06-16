import { useMemo, useState } from 'react';
import { ArrowDownUp, History, ImageOff, PackageSearch, RotateCcw } from 'lucide-react';
import { useApp } from '../context/useApp';
import {
  formatCaseQuantityBreakdown,
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
import { compareItemNumbers } from '../lib/productSort';
import { GOODS_TYPES, getGoodsTypeLabel, normalizeGoodsType } from '../lib/goodsTypes';
import { ALL_FACILITIES, FACILITIES, getFacilityCode, getFacilityName } from '../lib/facilities';
import ProductImageLightbox from '../components/ProductImageLightbox';

function getStockStatusLabel(status) {
  if (status === 'out') return 'Out of stock';
  if (status === 'low') return 'Running low';
  return 'In stock';
}

export default function PhaseOneInventory() {
  const { state } = useApp();
  const selectedFacility = state.selectedFacility ?? ALL_FACILITIES;
  const showAllFacilities = selectedFacility === ALL_FACILITIES;
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [goodsTypeFilter, setGoodsTypeFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [lotStatusFilter, setLotStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('item-number');
  const [itemNumberDir, setItemNumberDir] = useState('asc');
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
        // Remaining stock split per factory, plus the company total.
        const remainingByFacility = Object.fromEntries(FACILITIES.map((facility) => [facility.id, 0]));
        productBatches.forEach((batch) => {
          if (batch.facilityId && batch.facilityId in remainingByFacility) {
            remainingByFacility[batch.facilityId] += Number(batch.qtyRemaining ?? 0);
          }
        });
        const totalRemaining = productBatches.reduce((sum, batch) => sum + Number(batch.qtyRemaining ?? 0), 0);
        // When the topbar is scoped to one factory, every figure on the row
        // (remaining, status, lots, FIFO) reflects just that factory.
        const displayRemaining = showAllFacilities ? totalRemaining : (remainingByFacility[selectedFacility] ?? 0);
        const facilityBatches = showAllFacilities
          ? productBatches
          : productBatches.filter((batch) => batch.facilityId === selectedFacility);
        const visibleBatches = lotStatusFilter
          ? facilityBatches.filter((batch) => batch.status === lotStatusFilter)
          : facilityBatches;
        const activeBatches = facilityBatches.filter((batch) => batch.status === 'active' && batch.qtyRemaining > 0);
        const oldestLot = [...activeBatches].sort((a, b) => new Date(a.productionDate) - new Date(b.productionDate))[0];
        const stockStatus = getStockStatus(displayRemaining);
        const lotCodes = visibleBatches.map((batch) => batch.batchNumber).join(' ');

        return {
          product,
          batches: visibleBatches,
          activeBatches,
          remainingByFacility,
          totalRemaining,
          displayRemaining,
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
            getGoodsTypeLabel(product.goodsType),
            lotCodes,
            stockStatus,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase(),
        };
      })
      .filter((row) => (categoryFilter ? row.product.category === categoryFilter : true))
      .filter((row) => (goodsTypeFilter ? normalizeGoodsType(row.product.goodsType) === goodsTypeFilter : true))
      .filter((row) => (stockFilter ? row.stockStatus === stockFilter : true))
      .filter((row) => (lotStatusFilter ? row.batches.length > 0 : true))
      .filter((row) => (normalizedSearch ? row.searchText.includes(normalizedSearch) : true))
      .sort((a, b) => {
        if (sortBy === 'item-number') {
          return compareItemNumbers(a.product.itemNumber, b.product.itemNumber, itemNumberDir)
            || getProductDisplayName(a.product).localeCompare(getProductDisplayName(b.product));
        }
        if (sortBy === 'category') {
          return (a.product.category || '').localeCompare(b.product.category || '')
            || getProductDisplayName(a.product).localeCompare(getProductDisplayName(b.product));
        }
        if (sortBy === 'remaining-asc') return a.displayRemaining - b.displayRemaining;
        if (sortBy === 'remaining-desc') return b.displayRemaining - a.displayRemaining;
        if (sortBy === 'status') {
          const statusOrder = { out: 0, low: 1, in: 2 };
          return statusOrder[a.stockStatus] - statusOrder[b.stockStatus]
            || a.displayRemaining - b.displayRemaining;
        }
        if (sortBy === 'oldest-lot') {
          const aDate = a.oldestLot?.productionDate ? new Date(a.oldestLot.productionDate).getTime() : Number.MAX_SAFE_INTEGER;
          const bDate = b.oldestLot?.productionDate ? new Date(b.oldestLot.productionDate).getTime() : Number.MAX_SAFE_INTEGER;
          return aDate - bDate;
        }

        return getProductDisplayName(a.product).localeCompare(getProductDisplayName(b.product));
      });
  }, [activeProducts, categoryFilter, goodsTypeFilter, itemNumberDir, lotStatusFilter, search, selectedFacility, showAllFacilities, sortBy, state.batches, stockFilter]);

  const historyRows = useMemo(() => buildInventoryHistory(state), [state]);
  const hasActiveFilters = Boolean(search || categoryFilter || goodsTypeFilter || stockFilter || lotStatusFilter);

  const [historySearch, setHistorySearch] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');

  const historyTypes = useMemo(
    () => [...new Set(historyRows.map((row) => row.type).filter(Boolean))].sort(),
    [historyRows]
  );

  const filteredHistoryRows = useMemo(() => {
    const normalizedSearch = historySearch.trim().toLowerCase();
    const fromTime = historyDateFrom ? new Date(historyDateFrom).getTime() : null;
    const toTime = historyDateTo ? new Date(historyDateTo).getTime() + 24 * 60 * 60 * 1000 - 1 : null;

    return historyRows.filter((row) => {
      if (historyTypeFilter && row.type !== historyTypeFilter) return false;
      if (fromTime !== null || toTime !== null) {
        const rowTime = row.date ? new Date(row.date).getTime() : null;
        if (rowTime === null || Number.isNaN(rowTime)) return false;
        if (fromTime !== null && rowTime < fromTime) return false;
        if (toTime !== null && rowTime > toTime) return false;
      }
      if (normalizedSearch) {
        const text = [row.productName, row.lotCode, row.quantity, row.details, row.type]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!text.includes(normalizedSearch)) return false;
      }
      return true;
    });
  }, [historyRows, historySearch, historyTypeFilter, historyDateFrom, historyDateTo]);

  const hasHistoryFilters = Boolean(historySearch || historyTypeFilter || historyDateFrom || historyDateTo);

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
            aria-label="Search products or lot codes"
            className="form-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products or lot codes..."
          />
          <select aria-label="Filter by category" title="Filter by category" className="form-select" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <select aria-label="Filter by goods type" title="Filter by goods type" className="form-select" value={goodsTypeFilter} onChange={(event) => setGoodsTypeFilter(event.target.value)}>
            <option value="">All Goods Types</option>
            {GOODS_TYPES.map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
          <select aria-label="Filter by stock status" title="Filter by stock status" className="form-select" value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
            <option value="">All Stock Statuses</option>
            <option value="in">In stock</option>
            <option value="low">Running low</option>
            <option value="out">Out of stock</option>
          </select>
          <select aria-label="Filter by lot status" title="Filter by lot status" className="form-select" value={lotStatusFilter} onChange={(event) => setLotStatusFilter(event.target.value)}>
            <option value="">All Lot Statuses</option>
            <option value="active">Active Lots</option>
            <option value="cleared">Cleared Lots</option>
          </select>
          <select aria-label="Sort by" title="Sort by" className="form-select" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="product">Sort by Product</option>
            <option value="item-number">Sort by Item Number</option>
            <option value="category">Sort by Category</option>
            <option value="status">Sort by Stock Status</option>
            <option value="remaining-asc">Sort by Low Remaining</option>
            <option value="remaining-desc">Sort by High Remaining</option>
            <option value="oldest-lot">Sort by Oldest Active Lot</option>
          </select>
          {sortBy === 'item-number' ? (
            <button
              className="btn btn-secondary"
              type="button"
              title={itemNumberDir === 'asc' ? 'Item number: ascending (A-Z). Click for Z-A.' : 'Item number: descending (Z-A). Click for A-Z.'}
              aria-label={`Toggle item number sort direction (currently ${itemNumberDir === 'asc' ? 'ascending' : 'descending'})`}
              onClick={() => setItemNumberDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))}
            >
              <ArrowDownUp size={14} /> {itemNumberDir === 'asc' ? 'A-Z' : 'Z-A'}
            </button>
          ) : null}
          <button
            className="btn btn-secondary"
            type="button"
            disabled={!hasActiveFilters && sortBy === 'item-number' && itemNumberDir === 'asc'}
            onClick={() => {
              setSearch('');
              setCategoryFilter('');
              setGoodsTypeFilter('');
              setStockFilter('');
              setLotStatusFilter('');
              setSortBy('item-number');
              setItemNumberDir('asc');
            }}
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>

        {inventoryRows.length ? (
          <div className="table-scroll-wrapper">
            <table className="data-table inventory-table">
              <thead>
                <tr>
                  <th style={{ width: 48 }} aria-label="Product image" />
                  <th style={{ width: 90 }}>Item #</th>
                  <th>Product</th>
                  {showAllFacilities ? (
                    <>
                      {FACILITIES.map((facility) => (
                        <th key={facility.id} className="cell-align-right">{facility.name}</th>
                      ))}
                      <th className="cell-align-right">Total</th>
                    </>
                  ) : (
                    <th className="cell-align-right">Remaining · {getFacilityName(selectedFacility)}</th>
                  )}
                  <th>Status</th>
                  <th>Active Lots</th>
                </tr>
              </thead>
              <tbody>
                {inventoryRows.map(({ product, batches, activeBatches, remainingByFacility, totalRemaining, displayRemaining, oldestLot, stockStatus }) => (
                  <tr key={product.id} className={`inventory-row inventory-row-${stockStatus}`}>
                    <td>
                      <ProductImage product={product} onPreview={setPreviewProduct} small />
                    </td>
                    <td className="cell-monospace cell-align-left">{product.itemNumber || '-'}</td>
                    <td className="cell-truncate">
                      <div className="inventory-row-name" title={getProductDisplayName(product)}>
                        {getProductDisplayName(product)}
                      </div>
                      <div className="inventory-row-meta">
                        {getGoodsTypeLabel(product.goodsType)} · {product.category || 'Uncategorized'} · {product.packagingDetails || product.unitSize || 'Not set'} · {getProductOrderUnitLabel(product)}
                      </div>
                    </td>
                    {showAllFacilities ? (
                      <>
                        {FACILITIES.map((facility) => (
                          <td key={facility.id} className="cell-monospace cell-align-right">
                            {(remainingByFacility[facility.id] ?? 0).toLocaleString()}
                          </td>
                        ))}
                        <td className="cell-monospace cell-align-right">
                          <span className="inventory-row-remaining">{totalRemaining.toLocaleString()}</span>
                        </td>
                      </>
                    ) : (
                      <td className="cell-monospace cell-align-right">
                        <span className="inventory-row-remaining">{displayRemaining.toLocaleString()}</span>
                      </td>
                    )}
                    <td>
                      <span className={`badge badge-${stockStatus === 'low' ? 'partial' : stockStatus === 'out' ? 'declined' : 'fulfilled'}`}>
                        {getStockStatusLabel(stockStatus)}
                      </span>
                    </td>
                    <td>
                      {batches.length ? (
                        <div className="inventory-lot-badges">
                          {batches.map((batch) => (
                            <span key={batch.id} className={`badge badge-${batch.status}`}>
                              {showAllFacilities && getFacilityCode(batch.facilityId)
                                ? <span className="inventory-lot-facility">{getFacilityCode(batch.facilityId)}</span>
                                : null}
                              {batch.batchNumber}: {batch.qtyRemaining.toLocaleString()}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="inventory-no-lots">No lots logged</span>
                      )}
                      <div className="inventory-row-fifo">
                        {activeBatches.length ? `${activeBatches.length} active` : '0 active'}
                        {oldestLot ? ` · FIFO ${oldestLot.batchNumber} (${formatDate(oldestLot.productionDate)})` : ''}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          <>
            <div className="filter-bar">
              <input
                aria-label="Search history"
                className="form-input"
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
                placeholder="Search product, lot code, or details..."
              />
              <select
                aria-label="Filter by movement type"
                title="Filter by movement type"
                className="form-select"
                value={historyTypeFilter}
                onChange={(event) => setHistoryTypeFilter(event.target.value)}
              >
                <option value="">All Types</option>
                {historyTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <input
                className="form-input"
                type="date"
                value={historyDateFrom}
                onChange={(event) => setHistoryDateFrom(event.target.value)}
                aria-label="From date"
                title="From date"
              />
              <input
                className="form-input"
                type="date"
                value={historyDateTo}
                onChange={(event) => setHistoryDateTo(event.target.value)}
                aria-label="To date"
                title="To date"
              />
              <button
                className="btn btn-secondary"
                type="button"
                disabled={!hasHistoryFilters}
                onClick={() => {
                  setHistorySearch('');
                  setHistoryTypeFilter('');
                  setHistoryDateFrom('');
                  setHistoryDateTo('');
                }}
              >
                <RotateCcw size={14} /> Reset
              </button>
            </div>
            {filteredHistoryRows.length ? (
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
                    {filteredHistoryRows.map((row) => (
                      <tr key={row.id}>
                        <td>{formatDateTime(row.date)}</td>
                        <td><span className="badge badge-portal">{row.type}</span></td>
                        <td className="cell-truncate">
                          <span className="text-truncate" title={row.productName}>{row.productName}</span>
                        </td>
                        <td className="cell-monospace cell-align-left">{row.lotCode}</td>
                        <td className="cell-monospace cell-align-left">{row.quantity}</td>
                        <td>{row.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                <div className="empty-state-title">No inventory history matches these filters</div>
                <div className="empty-state-description">Reset filters to see all activity.</div>
              </div>
            )}
          </>
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

function ProductImage({ product, onPreview, small = false }) {
  const imageUrl = getProductImageUrl(product, { fallback: true });
  const usesFallback = !hasProductImage(product);
  const label = getProductDisplayName(product);

  return (
    <button
      type="button"
      className={`product-thumb product-thumb-button ${small ? 'product-thumb-sm' : ''} ${usesFallback ? 'product-thumb-fallback' : ''}`}
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
      details: `${batch.status} lot with ${formatCaseQuantityBreakdown(product, batch.qtyRemaining) || `${batch.qtyRemaining.toLocaleString()} cases`} remaining`,
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
