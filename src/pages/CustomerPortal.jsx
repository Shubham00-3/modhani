import { useMemo, useState } from 'react';
import { Building2, CheckCircle2, Minus, Package, Plus, Search } from 'lucide-react';
import { useApp } from '../context/useApp';
import { formatCurrency, formatDateTime, getProductDisplayName, getProductImageUrl, hasProductImage } from '../data/phaseOneData';

export default function CustomerPortal() {
  const { state, logout, completeCustomerProfile, submitPortalOrder } = useApp();
  const portal = state.customerPortal;
  const [fullName, setFullName] = useState('');
  const [locationId, setLocationId] = useState('');
  const [quantities, setQuantities] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [orderSubmitted, setOrderSubmitted] = useState(false);
  const [selectedRecentOrderId, setSelectedRecentOrderId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Multi-client support: if customer has multiple clients, show a company selector.
  const portalClients = useMemo(() => portal?.clients ?? [], [portal?.clients]);
  const portalProducts = useMemo(() => portal?.products ?? [], [portal?.products]);
  const portalClientCount = portalClients.length;
  const hasMultipleClients = portalClients.length > 1;
  const [selectedClientId, setSelectedClientId] = useState('');

  // Determine the active client.
  const activeClient = useMemo(() => {
    if (!portal) return null;
    if (hasMultipleClients) {
      return portalClients.find((c) => c.id === selectedClientId) || portalClients[0] || null;
    }
    // Single client or backward compat.
    return portal.client ?? portalClients[0] ?? null;
  }, [portal, hasMultipleClients, portalClients, selectedClientId]);

  const activeClientId = activeClient?.id ?? '';

  // Filter locations to the active client.
  const activeLocations = useMemo(
    () => (portal?.locations ?? []).filter((loc) => loc.clientId === activeClientId),
    [portal?.locations, activeClientId]
  );

  const activeLocationId = locationId || activeLocations[0]?.id || '';
  const activeLocationName = activeLocations.find((loc) => loc.id === activeLocationId)?.name ?? 'No location';

  // Filter products to those priced for the active client.
  const activeProducts = useMemo(() => {
    if (!portalProducts.length || !activeClientId) return [];
    return portalProducts.filter(
      (p) => p.pricingClientId === activeClientId || (!p.pricingClientId && portalClientCount <= 1)
    );
  }, [portalProducts, activeClientId, portalClientCount]);

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
      filtered = filtered.filter((p) => getProductDisplayName(p).toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q));
    }
    return filtered;
  }, [activeProducts, selectedCategory, searchQuery]);

  const selectedLines = useMemo(
    () =>
      activeProducts
        .map((product) => ({
          product,
          quantity: Number(quantities[product.id] ?? 0),
        }))
        .filter((line) => line.quantity > 0),
    [activeProducts, quantities]
  );
  const orderTotal = selectedLines.reduce((total, line) => total + line.quantity * line.product.clientPrice, 0);
  const productsById = useMemo(() => new Map(portalProducts.map((product) => [product.id, product])), [portalProducts]);
  const selectedRecentOrder = selectedRecentOrderId
    ? portal?.recentOrders.find((order) => order.id === selectedRecentOrderId) ?? null
    : null;

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

  async function handleSubmitOrder(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');

    if (!activeLocationId) {
      setError('Select a delivery location.');
      setSubmitting(false);
      return;
    }

    if (!selectedLines.length) {
      setError('Enter a quantity for at least one product.');
      setSubmitting(false);
      return;
    }

    const result = await submitPortalOrder({
      clientId: activeClientId,
      locationId: activeLocationId,
      items: selectedLines.map((line) => ({
        productId: line.product.id,
        quantity: line.quantity,
      })),
    });

    if (!result.ok) {
      setError(result.error ?? 'Unable to submit order.');
      setOrderSubmitted(false);
    } else {
      setMessage('Thank you, your order has been submitted.');
      setQuantities({});
      setOrderSubmitted(true);
    }

    setSubmitting(false);
  }

  function handleClientChange(newClientId) {
    setSelectedClientId(newClientId);
    setLocationId('');
    setQuantities({});
    setError('');
    setMessage('');
    setOrderSubmitted(false);
  }

  function updateProductQuantity(productId, nextValue) {
    const nextQuantity = Math.max(0, Number(nextValue) || 0);
    setOrderSubmitted(false);
    setQuantities((current) => ({
      ...current,
      [productId]: nextQuantity ? String(nextQuantity) : '',
    }));
  }

  if (!portal) {
    return <PortalShell onLogout={logout}>Loading customer portal...</PortalShell>;
  }

  if (!portal.contact) {
    return (
      <PortalShell onLogout={logout}>
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
      </PortalShell>
    );
  }

  if (portal.contact.status !== 'active' || (!portal.client && portalClients.length === 0)) {
    return (
      <PortalShell onLogout={logout}>
        <section className="customer-portal-panel customer-pending-panel">
          <CheckCircle2 size={34} />
          <h1>Pending Staff Approval</h1>
          <p>
            Your customer account is created. Modhani staff still needs to link {portal.contact.email} to a company
            before you can place orders.
          </p>
        </section>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      onLogout={logout}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
    >
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

      {/* Catalogue Header */}
      <section className="cp-catalogue-header">
        <h2 className="cp-catalogue-title">Catalogue</h2>
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

      <form className="customer-order-layout" onSubmit={handleSubmitOrder}>
        {/* Product Grid */}
        <section className="customer-products-list">
          {filteredProducts.length ? (
            filteredProducts.map((product) => {
              const imageUrl = getProductImageUrl(product, { fallback: true });
              const usesFallback = !hasProductImage(product);
              const quantity = quantities[product.id] ?? '';
              const numericQuantity = Number(quantity || 0);

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
                    <span className="cp-product-unit">{product.unitSize} {product.category ? `- ${product.category}` : ''}</span>
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

        {/* Order Summary Sidebar */}
        <aside className="cp-order-summary">
          <div className="cp-summary-header">
            <div>
              <h2>Order summary</h2>
              <p>Review selected products before sending to Modhani.</p>
            </div>
            <span className="cp-live-badge"><span className="cp-live-dot" /> Live cart</span>
          </div>

          {/* Delivery Location */}
          <div className="cp-delivery-location">
            <div className="cp-delivery-label">
              <span>DELIVERY LOCATION</span>
              {activeLocations.length > 1 && (
                <select
                  className="cp-delivery-edit"
                  value={activeLocationId}
                  onChange={(event) => {
                    setLocationId(event.target.value);
                    setOrderSubmitted(false);
                  }}
                >
                  {activeLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <strong>{activeLocationName}</strong>
          </div>

          {hasMultipleClients ? (
            <div className="cp-delivery-location">
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
          ) : null}

          <PortalMessages error={error} />

          {/* Cart Lines */}
          <div className="cp-cart-lines">
            {selectedLines.length ? (
              selectedLines.map((line) => (
                <div key={line.product.id} className="cp-cart-line">
                  <span className="cp-cart-dot" style={{ background: getCategoryColor(line.product.category) }} />
                  <div className="cp-cart-line-info">
                    <strong>{getProductDisplayName(line.product)}</strong>
                    <span>{line.quantity} {line.quantity === 1 ? 'case' : 'cases'}</span>
                  </div>
                  <span className="cp-cart-line-price">{formatCurrency(line.quantity * line.product.clientPrice)}</span>
                </div>
              ))
            ) : (
              <div className="customer-empty-cart">No quantities entered yet</div>
            )}
          </div>

          {/* Total */}
          <div className="cp-estimated-total">
            <span>Estimated total</span>
            <strong>{formatCurrency(orderTotal)}</strong>
          </div>

          {/* Submit */}
          <button className="cp-submit-btn" type="submit" disabled={submitting || !activeProducts.length || !selectedLines.length}>
            {submitting ? 'Submitting...' : 'Submit Order'}
          </button>

          {orderSubmitted && (
            <div className="cp-success-message animate-entrance">
              <CheckCircle2 size={16} />
              <span>Thank you, your order has been submitted.</span>
            </div>
          )}
        </aside>
      </form>

      {/* Recent Orders - Compact Inline */}
      {portal.recentOrders.length ? (
        <section id="recent-orders" className="cp-recent-orders-bar">
          <span className="cp-recent-label">Recent orders</span>
          <div className="cp-recent-pills">
            {portal.recentOrders.slice(0, 5).map((order) => (
              <button
                key={order.id}
                type="button"
                className={`cp-recent-pill ${selectedRecentOrderId === order.id ? 'active' : ''}`}
                onClick={() => setSelectedRecentOrderId((current) => (current === order.id ? '' : order.id))}
              >
                <span className="cp-recent-pill-number">#{order.orderNumber}</span>
                <span className={`cp-recent-pill-status status-${order.status.toLowerCase().replace(/\s+/g, '-')}`}>{order.status}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Expanded Recent Order Detail */}
      {selectedRecentOrder ? (
        <section className="cp-recent-detail animate-entrance">
          <div className="cp-recent-detail-header">
            <strong>Order #{selectedRecentOrder.orderNumber}</strong>
            <span>{formatDateTime(selectedRecentOrder.createdAt)}</span>
          </div>
          {(selectedRecentOrder.items ?? []).length ? (
            <div className="cp-recent-detail-lines">
              {selectedRecentOrder.items.map((item) => {
                const product = productsById.get(item.productId);
                const unitPrice = item.clientPrice ?? product?.clientPrice ?? 0;
                return (
                  <div className="cp-recent-detail-line" key={item.id}>
                    <span>{product ? getProductDisplayName(product) : item.productId}</span>
                    <span className="cp-detail-qty">{Number(item.quantity).toLocaleString()} units</span>
                    <span className="cp-detail-price">{formatCurrency(Number(item.quantity) * unitPrice)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="customer-empty-cart">No line details available</div>
          )}
        </section>
      ) : null}
    </PortalShell>
  );
}

/* Utility to get a color for each product category */
function getCategoryColor(category) {
  const colors = {
    'Dahi': '#D4B896',
    'Milk': '#B5CDB6',
    'Yogurt': '#C5D8C5',
    'Butter': '#E8D5A3',
    'Paneer': '#BDDBB5',
    'Lassi': '#EBC48E',
  };
  return colors[category] || '#C5CCC7';
}

function PortalShell({ children, onLogout, searchQuery, onSearchChange }) {
  return (
    <main className="customer-portal-page">
      <header className="cp-nav">
        <div className="cp-nav-inner">
          {/* Left: Logo */}
          <div className="cp-nav-brand">
            <img className="cp-brand-logo" src="/modhani-logo.svg" alt="Modhani" />
            <div>
              <strong className="cp-brand-name">Modhani</strong>
              <span className="cp-brand-sub">Customer ordering portal</span>
            </div>
          </div>

          {/* Center: Search */}
          <div className="cp-nav-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search products, cases, SKUs..."
              value={searchQuery ?? ''}
              onChange={(e) => onSearchChange?.(e.target.value)}
            />
          </div>

          {/* Right: Client/Location pills + Sign Out */}
          <div className="cp-nav-right">
            <button className="cp-signout-btn" type="button" onClick={onLogout}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <div className="customer-portal-content">{children}</div>
    </main>
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
