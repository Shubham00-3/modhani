import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CheckCircle2, Minus, Package, Plus, Search, ShoppingCart, X } from 'lucide-react';
import { useApp } from '../context/useApp';
import { useCart } from '../hooks/useCart';
import {
  formatCurrency,
  getProductDisplayName,
  getProductImageUrl,
  getProductOrderUnitLabel,
  hasProductImage,
} from '../data/phaseOneData';

export default function CustomerPortal() {
  const { state, completeCustomerProfile } = useApp();
  const portal = state.customerPortal;

  const {
    quantities,
    activeProducts,
    cartItemCount,
    orderTotal,
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
    return <div>Loading customer portal...</div>;
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
          Your customer account is created. Modhani staff still needs to link {portal.contact.email} to a company
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
        <div className="cp-hero-visual">
          {activeProducts.slice(0, 3).map((product, i) => {
            const imageUrl = getProductImageUrl(product, { fallback: true });
            return (
              <div
                key={product.id}
                className="cp-hero-product-card"
                style={{ '--card-index': i }}
              >
                <img src={imageUrl} alt={getProductDisplayName(product)} />
              </div>
            );
          })}
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
                <div className="customer-product-image">
                  <img
                    className={usesFallback ? 'product-image-fallback' : ''}
                    src={imageUrl}
                    alt={usesFallback ? 'Modhani logo placeholder' : getProductDisplayName(product)}
                  />
                </div>
                <div className="customer-product-info">
                  <h3>{product.name}</h3>
                  <span className="cp-product-unit">
                    {[product.packagingDetails || product.unitSize, orderUnit].filter(Boolean).join(' - ')}
                  </span>
                  <strong>{formatCurrency(product.clientPrice)}</strong>
                </div>
                <div className="customer-product-actions">
                  <button className="btn btn-secondary btn-icon" type="button" onClick={() => updateProductQuantity(product.id, numericQuantity - 1)} aria-label={`Decrease ${getProductDisplayName(product)}`}>
                    <Minus size={16} />
                  </button>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="1"
                    value={quantity}
                    onChange={(event) => updateProductQuantity(product.id, event.target.value)}
                    aria-label={`${getProductDisplayName(product)} quantity`}
                  />
                  <button className="btn btn-secondary btn-icon" type="button" onClick={() => updateProductQuantity(product.id, numericQuantity + 1)} aria-label={`Increase ${getProductDisplayName(product)}`}>
                    <Plus size={16} />
                  </button>
                </div>
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
            <span>{cartItemCount} item{cartItemCount !== 1 ? 's' : ''}</span>
            <strong>{formatCurrency(orderTotal)}</strong>
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
    </>
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
