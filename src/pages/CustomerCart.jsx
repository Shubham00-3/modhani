import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Minus, Package, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { useApp } from '../context/useApp';
import { useCart } from '../hooks/useCart';
import {
  formatCurrency,
  getProductDisplayName,
  getProductImageUrl,
  getProductOrderUnitLabel,
  hasProductImage,
} from '../data/phaseOneData';

export default function CustomerCart() {
  const navigate = useNavigate();
  const { submitPortalOrder } = useApp();
  const {
    selectedLines,
    orderTotal,
    cartItemCount,
    activeLocations,
    activeLocationId,
    activeLocationName,
    setLocationId,
    activeClientId,
    portalClients,
    hasMultipleClients,
    handleClientChange,
    updateProductQuantity,
    clearCart,
  } = useCart();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmitOrder(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    if (!activeLocationId) {
      setError('Select a delivery location.');
      setSubmitting(false);
      return;
    }

    if (!selectedLines.length) {
      setError('Your cart is empty. Add products before submitting.');
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
      setSubmitting(false);
    } else {
      clearCart();
      // Reset before navigating so if the user hits browser back the
      // submit button isn't stuck in a permanently disabled state.
      setSubmitting(false);
      navigate('/thank-you');
    }
  }

  if (cartItemCount === 0) {
    return (
      <section className="cp-cart-page">
        <div className="cp-cart-empty">
          <ShoppingCart size={48} />
          <h2>Your cart is empty</h2>
          <p>Browse the catalogue and add products to get started.</p>
          <Link to="/" className="btn btn-primary">
            Continue Shopping
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="cp-cart-page">
      <div className="cp-cart-header">
        <h1>Your Cart ({cartItemCount} item{cartItemCount !== 1 ? 's' : ''})</h1>
        <Link to="/" className="cp-cart-continue">
          &larr; Continue Shopping
        </Link>
      </div>

      <form onSubmit={handleSubmitOrder}>
        {/* Cart line items */}
        <div className="cp-cart-items">
          {selectedLines.map((line) => {
            const { product, quantity } = line;
            const imageUrl = getProductImageUrl(product, { fallback: true });
            const usesFallback = !hasProductImage(product);
            const orderUnit = getProductOrderUnitLabel(product);
            const lineTotal = quantity * product.clientPrice;

            return (
              <div key={product.id} className="cp-cart-item">
                <div className="cp-cart-item-image">
                  <img
                    className={usesFallback ? 'product-image-fallback' : ''}
                    src={imageUrl}
                    alt={usesFallback ? 'Modhani logo placeholder' : getProductDisplayName(product)}
                  />
                </div>

                <div className="cp-cart-item-info">
                  <h3>{getProductDisplayName(product)}</h3>
                  <span>
                    {[product.packagingDetails || product.unitSize, orderUnit]
                      .filter(Boolean)
                      .join(' - ')}{' '}
                    &middot; {formatCurrency(product.clientPrice)} each
                  </span>
                </div>

                <div className="cp-cart-item-qty">
                  <button
                    className="btn btn-secondary btn-icon"
                    type="button"
                    onClick={() => {
                      if (quantity <= 1) {
                        // Confirm before silently removing the line from the cart.
                        const ok = window.confirm(
                          `Remove ${getProductDisplayName(product)} from your cart?`
                        );
                        if (!ok) return;
                      }
                      updateProductQuantity(product.id, quantity - 1);
                    }}
                    aria-label={`Decrease ${getProductDisplayName(product)}`}
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    className="form-input"
                    type="number"
                    min="1"
                    step="1"
                    value={quantity}
                    onChange={(e) => updateProductQuantity(product.id, e.target.value)}
                    aria-label={`${getProductDisplayName(product)} quantity`}
                  />
                  <button
                    className="btn btn-secondary btn-icon"
                    type="button"
                    onClick={() => updateProductQuantity(product.id, quantity + 1)}
                    aria-label={`Increase ${getProductDisplayName(product)}`}
                  >
                    <Plus size={16} />
                  </button>
                </div>

                <div className="cp-cart-item-price">{formatCurrency(lineTotal)}</div>

                <button
                  className="cp-cart-item-remove"
                  type="button"
                  onClick={() => {
                    const ok = window.confirm(
                      `Remove ${getProductDisplayName(product)} from your cart?`
                    );
                    if (ok) updateProductQuantity(product.id, 0);
                  }}
                  aria-label={`Remove ${getProductDisplayName(product)}`}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Delivery location */}
        {activeLocations.length > 1 && (
          <div className="cp-cart-summary-card" style={{ marginBottom: 'var(--space-4)' }}>
            <h2>Delivery Location</h2>
            <select
              className="form-select"
              value={activeLocationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              {activeLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {activeLocations.length === 1 && (
          <div className="cp-cart-summary-card" style={{ marginBottom: 'var(--space-4)' }}>
            <h2>Delivery Location</h2>
            <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>{activeLocationName}</p>
          </div>
        )}

        {/* Company selector */}
        {hasMultipleClients && (
          <div className="cp-cart-summary-card" style={{ marginBottom: 'var(--space-4)' }}>
            <h2>Company</h2>
            <select
              className="form-select"
              value={activeClientId}
              onChange={(e) => handleClientChange(e.target.value)}
            >
              {portalClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Order summary */}
        <div className="cp-cart-summary-card">
          <h2>Order Summary</h2>
          {selectedLines.map((line) => (
            <div key={line.product.id} className="cp-cart-summary-row">
              <span>
                {getProductDisplayName(line.product)} x {line.quantity}
              </span>
              <span>{formatCurrency(line.quantity * line.product.clientPrice)}</span>
            </div>
          ))}
          <div className="cp-cart-summary-total">
            <span>Total</span>
            <span>{formatCurrency(orderTotal)}</span>
          </div>

          {error && (
            <div className="alert alert-warning" style={{ marginTop: 'var(--space-4)' }}>
              <div className="alert-content">
                <div className="alert-title">Action needed</div>
                <div className="alert-description">{error}</div>
              </div>
            </div>
          )}

          <button
            className="btn btn-primary cp-cart-checkout-btn"
            type="submit"
            disabled={submitting || !selectedLines.length}
          >
            {submitting ? 'Submitting...' : 'Submit Order'}
          </button>
        </div>
      </form>
    </section>
  );
}
