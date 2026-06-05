import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CheckCircle2, Droplets, Milk, Minus, Package, Plus, Search, ShoppingCart, Truck, X, ZoomIn } from 'lucide-react';
import { useApp } from '../context/useApp';
import { useCart } from '../hooks/useCart';
import {
  getProductDisplayName,
  getProductImageUrl,
  getProductOrderUnitLabel,
  formatCaseQuantityBreakdown,
  getNextCaseQuantity,
  hasProductImage,
} from '../data/phaseOneData';

export default function CustomerPortal() {
  const { state, completeCustomerProfile } = useApp();
  const portal = state.customerPortal;

  const {
    quantities,
    activeProducts,
    cartItemCount,
    formattedCartItemCount,
    updateProductQuantity,
    hasMultipleClients,
    portalClients,
    activeClientId,
    handleClientChange,
  } = useCart();

  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [dismissedCartCount, setDismissedCartCount] = useState(0);
  const showFloatingCart = cartItemCount > 0 && cartItemCount > dismissedCartCount;
  const [viewProduct, setViewProduct] = useState(null);

  // Get unique categories for filter pills
  const categories = useMemo(() => {
    const cats = [...new Set(activeProducts.map((p) => p.category).filter(Boolean))];
    return cats.sort();
  }, [activeProducts]);

  // Filter products by category and search
  const filteredProducts = useMemo(() => {
    let filtered = activeProducts;
    if (selectedCategory !== 'all') {
      filtered = filtered.filter((p) => p.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((p) =>
        [
          getProductDisplayName(p),
          p.category,
          p.itemNumber,
          p.upc,
          p.packagingDetails,
          p.orderUnitLabel,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }
    return filtered;
  }, [activeProducts, selectedCategory, searchQuery]);

  async function handleCompleteProfile(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');

    const result = await completeCustomerProfile(fullName);

    if (!result.ok) {
      setError(result.error ?? 'Unable to create customer profile.');
    } else {
      setMessage('Profile submitted. Staff will link your company before ordering is available.');
      setFullName('');
    }

    setSubmitting(false);
  }

  if (!portal) {
    return (
      <section className="customer-portal-panel customer-pending-panel">
        <div className="cp-loading-spinner" aria-hidden="true" />
        <h2>Loading your portal…</h2>
        <p>Fetching your catalogue and recent orders.</p>
      </section>
    );
  }

  if (!portal.contact) {
    return (
      <>
        <section className="customer-portal-panel">
          <div className="portal-section-heading">
            <Building2 size={20} />
            <div>
              <h1>Complete Customer Profile</h1>
              <p>Submit your name so Modhani staff can link your login to the right company.</p>
            </div>
          </div>
          <form className="customer-profile-form" onSubmit={handleCompleteProfile}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Profile'}
            </button>
          </form>
          <PortalMessages error={error} message={message} />
        </section>
      </>
    );
  }

  const portalClientsLocal = portal?.clients ?? [];
  if (portal.contact.status !== 'active' || (!portal.client && portalClientsLocal.length === 0)) {
    return (
      <section className="customer-portal-panel customer-pending-panel">
        <CheckCircle2 size={34} />
        <h1>Pending Staff Approval</h1>
        <p>
          Your customer account is created. Modhani staff still needs to link {portal.contact.contactEmail || portal.contact.username || portal.contact.email || 'your account'} to a company
          before you can place orders.
        </p>
      </section>
    );
  }

  return (
    <>
      {/* Hero Banner */}
      <section className="cp-hero">
        <div className="cp-hero-text">
          <span className="cp-hero-eyebrow">Wholesale Dairy Ordering</span>
          <h1>Order dairy inventory</h1>
          <p>Fast case entry, clean cart review, recent orders, and delivery location control in one focused screen.</p>
        </div>
        <div className="cp-hero-visual" aria-hidden="true">
          {/* Three stylized service tiles. Independent of the catalogue so the
              hero always reads the same regardless of how many product images
              have been uploaded. */}
          <div className="cp-hero-product-card cp-hero-card-milk" style={{ '--card-index': 0 }}>
            <Milk size={42} strokeWidth={1.6} />
            <span className="cp-hero-card-label">Fresh Milk</span>
          </div>
          <div className="cp-hero-product-card cp-hero-card-yogurt" style={{ '--card-index': 1 }}>
            <Droplets size={42} strokeWidth={1.6} />
            <span className="cp-hero-card-label">Yogurt &amp; Dahi</span>
          </div>
          <div className="cp-hero-product-card cp-hero-card-delivery" style={{ '--card-index': 2 }}>
            <Truck size={42} strokeWidth={1.6} />
            <span className="cp-hero-card-label">Fast Dispatch</span>
          </div>
        </div>
      </section>

      {/* Company selector (if multiple clients) */}
      {hasMultipleClients && (
        <div className="cp-delivery-location" style={{ maxWidth: 400 }}>
          <div className="cp-delivery-label">
            <span>COMPANY</span>
          </div>
          <select
            className="form-select"
            value={activeClientId}
            onChange={(event) => handleClientChange(event.target.value)}
          >
            {portalClients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Catalogue Header */}
      <section className="cp-catalogue-header">
        <h2 className="cp-catalogue-title">Catalogue</h2>
        <div className="cp-nav-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search products, cases, SKUs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="cp-category-pills">
          <button
            type="button"
            className={`cp-category-pill ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            All products
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`cp-category-pill ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {/* Product Grid */}
      <section className="customer-products-list" style={showFloatingCart ? { paddingBottom: 80 } : undefined}>
        {filteredProducts.length ? (
          filteredProducts.map((product) => {
            const imageUrl = getProductImageUrl(product, { fallback: true });
            const usesFallback = !hasProductImage(product);
            const quantity = quantities[product.id] ?? '';
            const numericQuantity = Number(quantity || 0);
            const orderUnit = getProductOrderUnitLabel(product);

            return (
              <article className="customer-product-card" key={product.id}>
                <button
                  className="customer-product-image cp-product-clickable"
                  type="button"
                  onClick={() => setViewProduct(product)}
                  aria-label={`View ${getProductDisplayName(product)} details`}
                >
                  <img
                    className={usesFallback ? 'product-image-fallback' : ''}
                    src={imageUrl}
                    alt={usesFallback ? 'Modhani logo placeholder' : getProductDisplayName(product)}
                  />
                  <span className="cp-product-zoom"><ZoomIn size={18} /></span>
                </button>
                <div className="customer-product-info">
                  <h3>{product.name}</h3>
                  <span className="cp-product-unit">
                    {[product.packagingDetails || product.unitSize, orderUnit].filter(Boolean).join(' - ')}
                  </span>
                </div>
                <div className="customer-product-actions">
                  <button
                    className="btn btn-secondary btn-icon"
                    type="button"
                    onClick={() => updateProductQuantity(product.id, getNextCaseQuantity(numericQuantity, -1))}
                    disabled={numericQuantity <= 0}
                    aria-label={`Decrease ${getProductDisplayName(product)}`}
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={quantity}
                    onChange={(event) => updateProductQuantity(product.id, event.target.value)}
                    aria-label={`${getProductDisplayName(product)} case quantity`}
                  />
                  <button className="btn btn-secondary btn-icon" type="button" onClick={() => updateProductQuantity(product.id, getNextCaseQuantity(numericQuantity, 1))} aria-label={`Increase ${getProductDisplayName(product)}`}>
                    <Plus size={16} />
                  </button>
                </div>
                {numericQuantity > 0 ? (
                  <div className="cp-product-unit">{formatCaseQuantityBreakdown(product, numericQuantity)}</div>
                ) : null}
              </article>
            );
          })
        ) : (
          <div className="customer-portal-panel customer-pending-panel">
            <Package size={34} />
            <h2>No Products Available</h2>
            <p>
              {activeProducts.length
                ? 'No products match the current search or category filter.'
                : 'Modhani staff has not enabled products for this company catalogue yet.'}
            </p>
          </div>
        )}
      </section>

      {/* Floating cart bar */}
      {showFloatingCart && (
        <div className="cp-floating-cart">
          <div className="cp-floating-cart-info">
            <ShoppingCart size={20} />
            <span>{formattedCartItemCount} case{cartItemCount !== 1 ? 's' : ''} in cart</span>
          </div>
          <div className="cp-floating-cart-actions">
            <Link to="/cart" className="btn btn-primary cp-floating-cart-btn">
              View Cart &rarr;
            </Link>
            <button
              className="cp-floating-cart-dismiss"
              type="button"
              onClick={() => setDismissedCartCount(cartItemCount)}
              aria-label="Dismiss cart bar"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Product Detail Modal */}
      {viewProduct && (
        <ProductDetailModal
          product={viewProduct}
          quantity={quantities[viewProduct.id] ?? ''}
          onQuantityChange={(val) => updateProductQuantity(viewProduct.id, val)}
          onClose={() => setViewProduct(null)}
        />
      )}
    </>
  );
}

function ProductDetailModal({ product, quantity, onQuantityChange, onClose }) {
  const imageUrl = getProductImageUrl(product, { fallback: true });
  const usesFallback = !hasProductImage(product);
  const orderUnit = getProductOrderUnitLabel(product);
  const numericQuantity = Number(quantity || 0);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="cp-detail-overlay" onClick={onClose}>
      <div className="cp-detail-modal" onClick={(e) => e.stopPropagation()}>
        <button className="cp-detail-close" type="button" onClick={onClose} aria-label="Close">
          <X size={22} />
        </button>

        <div className="cp-detail-image">
          <img
            className={usesFallback ? 'product-image-fallback' : ''}
            src={imageUrl}
            alt={usesFallback ? 'Modhani logo placeholder' : getProductDisplayName(product)}
          />
        </div>

        <div className="cp-detail-body">
          {product.category && <span className="cp-detail-category">{product.category}</span>}
          <h2 className="cp-detail-name">{getProductDisplayName(product)}</h2>

          <div className="cp-detail-meta">
            {product.packagingDetails || product.unitSize ? (
              <div className="cp-detail-meta-row">
                <span>Packaging</span>
                <strong>{product.packagingDetails || product.unitSize}</strong>
              </div>
            ) : null}
            {orderUnit ? (
              <div className="cp-detail-meta-row">
                <span>Order Unit</span>
                <strong>{orderUnit}</strong>
              </div>
            ) : null}
            {product.itemNumber ? (
              <div className="cp-detail-meta-row">
                <span>Item #</span>
                <strong>{product.itemNumber}</strong>
              </div>
            ) : null}
            {product.upc ? (
              <div className="cp-detail-meta-row">
                <span>UPC</span>
                <strong>{product.upc}</strong>
              </div>
            ) : null}
          </div>

          <div className="cp-detail-actions">
            <div className="cp-detail-qty">
              <button
                className="btn btn-secondary btn-icon"
                type="button"
                onClick={() => onQuantityChange(getNextCaseQuantity(numericQuantity, -1))}
                disabled={numericQuantity <= 0}
                aria-label="Decrease quantity"
              >
                <Minus size={18} />
              </button>
              <input
                className="form-input"
                type="number"
                min="0"
                step="0.01"
                value={quantity}
                onChange={(e) => onQuantityChange(e.target.value)}
                aria-label={`${getProductDisplayName(product)} case quantity`}
              />
              <button
                className="btn btn-secondary btn-icon"
                type="button"
                onClick={() => onQuantityChange(getNextCaseQuantity(numericQuantity, 1))}
                aria-label="Increase quantity"
              >
                <Plus size={18} />
              </button>
            </div>
            {numericQuantity > 0 && (
              <div className="cp-detail-line-total">
                <strong>{formatCaseQuantityBreakdown(product, numericQuantity)}</strong> in cart
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PortalMessages({ error, message }) {
  return (
    <>
      {error ? (
        <div className="alert alert-warning">
          <div className="alert-content">
            <div className="alert-title">Action needed</div>
            <div className="alert-description">{error}</div>
          </div>
        </div>
      ) : null}
      {message ? (
        <div className="alert alert-success">
          <div className="alert-content">
            <div className="alert-title">Saved</div>
            <div className="alert-description">{message}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
