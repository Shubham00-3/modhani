import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Package, Plus, Search, Settings2, X } from 'lucide-react';
import { useApp } from '../context/useApp';
import { formatCurrency, getProductDisplayName, getProductImageUrl } from '../data/phaseOneData';
import { ProductModal } from '../components/settings/ManagementModals';

export default function PhaseOneProducts() {
  const { state } = useApp();
  const [searchParams] = useSearchParams();
  const canManage = state.currentUser.permissions.manageSettings;
  const [editingProduct, setEditingProduct] = useState(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [previewProduct, setPreviewProduct] = useState(null);
  const [productSearch, setProductSearch] = useState('');
  const dashboardSearch = searchParams.get('q') ?? '';

  const filteredProducts = useMemo(() => {
    const query = (productSearch || dashboardSearch).trim().toLowerCase();

    if (!query) return state.products;

    return state.products.filter((product) =>
      [
        getProductDisplayName(product),
        product.name,
        product.unitSize,
        product.category,
        product.qbItemName,
        product.baseCataloguePrice,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [dashboardSearch, productSearch, state.products]);

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
              Showing {filteredProducts.length.toLocaleString()} of {state.products.length.toLocaleString()} products
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
        {state.products.length ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Product</th>
                <th>Category</th>
                <th>QuickBooks Item</th>
                <th>Base Catalogue Price</th>
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
                    <td style={{ fontWeight: 600 }}>{getProductDisplayName(product)}</td>
                    <td>{product.category || '-'}</td>
                    <td>{product.qbItemName || getProductDisplayName(product)}</td>
                    <td className="cell-monospace">{formatCurrency(product.baseCataloguePrice)}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" type="button" disabled={!canManage} onClick={() => setEditingProduct(product)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" style={{ padding: 0 }}>
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
  const imageUrl = getProductImageUrl(product);

  if (!imageUrl) {
    return (
      <div className="product-thumb" title="No product image yet">
        <Package size={18} />
      </div>
    );
  }

  return (
    <button
      className="product-thumb product-thumb-button"
      type="button"
      onClick={() => onPreview(product)}
      aria-label={`Open ${getProductDisplayName(product)} image`}
    >
      <img src={imageUrl} alt={getProductDisplayName(product)} />
    </button>
  );
}

function ProductImageLightbox({ product, onClose }) {
  const imageUrl = getProductImageUrl(product);

  return (
    <div className="modal-overlay product-image-lightbox-overlay" onClick={onClose}>
      <div className="product-image-lightbox" onClick={(event) => event.stopPropagation()}>
        <div className="product-image-lightbox-header">
          <div>
            <div className="product-image-lightbox-title">{getProductDisplayName(product)}</div>
            <div className="product-image-lightbox-meta">{product.category || 'Product image'}</div>
          </div>
          <button className="btn btn-ghost" type="button" onClick={onClose} aria-label="Close product image">
            <X size={18} />
          </button>
        </div>
        <div className="product-image-lightbox-body">
          <img src={imageUrl} alt={getProductDisplayName(product)} />
        </div>
      </div>
    </div>
  );
}
