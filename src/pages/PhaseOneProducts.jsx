import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Package, Plus, Search, Settings2 } from 'lucide-react';
import { useApp } from '../context/useApp';
import {
  formatCurrency,
  getProductDisplayName,
  getProductImageUrl,
  getProductOrderUnitLabel,
  getProductTierPrice,
  getActiveCatalogProducts,
  hasProductImage,
} from '../data/phaseOneData';
import { ProductModal } from '../components/settings/ManagementModals';
import ProductImageLightbox from '../components/ProductImageLightbox';

export default function PhaseOneProducts() {
  const { state } = useApp();
  const [searchParams] = useSearchParams();
  const canManage = state.currentUser.permissions.manageSettings;
  const [editingProduct, setEditingProduct] = useState(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [previewProduct, setPreviewProduct] = useState(null);
  const [productSearch, setProductSearch] = useState('');
  const dashboardSearch = searchParams.get('q') ?? '';
  const activeProducts = useMemo(() => getActiveCatalogProducts(state.products), [state.products]);

  const filteredProducts = useMemo(() => {
    const query = (productSearch || dashboardSearch).trim().toLowerCase();

    if (!query) return activeProducts;

    return activeProducts.filter((product) =>
      [
        getProductDisplayName(product),
        product.name,
        product.unitSize,
        product.category,
        product.itemNumber,
        product.packagingDetails,
        product.unitsPerCase,
        product.shelfLifeDays,
        product.leadTimeDays,
        product.orderUnitLabel,
        product.baseCataloguePrice,
        ...Object.values(product.tierPrices ?? {}),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [activeProducts, dashboardSearch, productSearch]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Products</h1>
          <p className="page-subtitle">
            Maintain the master catalogue for production, pricing, and ordering.
          </p>
        </div>
        <button className="btn btn-primary" type="button" disabled={!canManage} onClick={() => setShowProductModal(true)}>
          <Plus size={16} /> Add Product
        </button>
      </div>

      {!canManage ? (
        <div className="alert alert-warning">
          <Settings2 size={18} />
          <div className="alert-content">
            <div className="alert-title">Read-only catalogue</div>
            <div className="alert-description">
              Only settings admins can change the master product catalogue.
            </div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="catalogue-header">
          <div>
            <div className="card-title">
              <Package size={18} /> Product Catalogue
            </div>
            <div className="catalogue-count">
              Showing {filteredProducts.length.toLocaleString()} of {activeProducts.length.toLocaleString()} products
            </div>
          </div>
          <label className="catalogue-search">
            <Search size={16} />
            <input
              type="search"
              placeholder="Search products..."
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
            />
          </label>
        </div>
        {activeProducts.length ? (
          <div className="table-scroll-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Item #</th>
                <th>Product</th>
                <th>Category</th>
                <th>Packaging</th>
                <th>Tier 1 Price</th>
                <th>Shelf Life</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length ? (
                filteredProducts.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <ProductThumbnail product={product} onPreview={setPreviewProduct} />
                    </td>
                    <td className="cell-monospace cell-align-left">{product.itemNumber || '-'}</td>
                    <td className="cell-truncate">
                      <span className="text-truncate" style={{ fontWeight: 600 }} title={getProductDisplayName(product)}>
                        {getProductDisplayName(product)}
                      </span>
                    </td>
                    <td>{product.category || '-'}</td>
                    <td>
                      <div>{product.packagingDetails || product.unitSize || '-'}</div>
                      <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                        {getProductOrderUnitLabel(product)}
                      </div>
                    </td>
                    <td className="cell-monospace">{formatCurrency(getProductTierPrice(product, 1))}</td>
                    <td>{product.shelfLifeDays ? `${product.shelfLifeDays} days` : '-'}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" type="button" disabled={!canManage} onClick={() => setEditingProduct(product)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" style={{ padding: 0 }}>
                    <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                      <div className="empty-state-title">No matching products</div>
                      <div className="empty-state-description">
                        Try searching by product name, category, item number, or price.
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <div className="empty-state-title">No products yet</div>
            <div className="empty-state-description">
              Add products to make ordering, pricing, and production available across the app.
            </div>
          </div>
        )}
      </div>

      {showProductModal || editingProduct ? (
        <ProductModal
          product={editingProduct}
          onClose={() => {
            setShowProductModal(false);
            setEditingProduct(null);
          }}
        />
      ) : null}

      {previewProduct ? (
        <ProductImageLightbox product={previewProduct} onClose={() => setPreviewProduct(null)} />
      ) : null}
    </div>
  );
}

function ProductThumbnail({ product, onPreview }) {
  const imageUrl = getProductImageUrl(product, { fallback: true });
  const usesFallback = !hasProductImage(product);

  return (
    <button
      className={`product-thumb product-thumb-button ${usesFallback ? 'product-thumb-fallback' : ''}`}
      type="button"
      onClick={() => onPreview(product)}
      aria-label={`Open ${usesFallback ? 'Modhani logo placeholder for' : ''} ${getProductDisplayName(product)} image`}
      title={usesFallback ? 'No product image yet. Showing Modhani logo.' : `Open ${getProductDisplayName(product)} image`}
    >
      <img src={imageUrl} alt={usesFallback ? 'Modhani logo placeholder' : getProductDisplayName(product)} />
    </button>
  );
}
