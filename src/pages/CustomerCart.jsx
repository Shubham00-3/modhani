import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { useApp } from '../context/useApp';
import { useCart } from '../hooks/useCart';
import {
  getProductDisplayName,
  getProductImageUrl,
  getProductOrderUnitLabel,
  formatCaseQuantity,
  formatCaseQuantityBreakdown,
  getNextCaseQuantity,
  hasProductImage,
  isValidCaseQuantityStep,
} from '../data/phaseOneData';
import { useModalBehavior, handleOverlayClick } from '../hooks/useModalBehavior';

export default function CustomerCart() {
  const navigate = useNavigate();
  const { submitPortalOrder } = useApp();
  const {
    selectedLines,
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
    formattedCartItemCount,
  } = useCart();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Show a confirmation modal before actually posting the order, so the
  // customer can double-check items + delivery location.
  const [showConfirm, setShowConfirm] = useState(false);

  function handleStartCheckout(event) {
    event.preventDefault();
    setError('');

    if (!activeLocationId) {
      setError('Select a delivery location.');
      return;
    }
    if (!selectedLines.length) {
      setError('Your cart is empty. Add products before submitting.');
      return;
    }
    if (selectedLines.some((line) => !isValidCaseQuantityStep(line.quantity))) {
      setError('Use quarter-case quantities only: 0.25, 0.5, 0.75, 1, and so on.');
      return;
    }

    setShowConfirm(true);
  }

  async function handleConfirmedSubmit() {
    setSubmitting(true);
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
      setShowConfirm(false);
    } else {
      clearCart();
      setSubmitting(false);
      setShowConfirm(false);
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
        <h1>Your Cart ({formattedCartItemCount} case{cartItemCount !== 1 ? 's' : ''})</h1>
        <Link to="/" className="cp-cart-continue">
          &larr; Continue Shopping
        </Link>
      </div>

      <form onSubmit={handleStartCheckout}>
        {/* Cart line items */}
        <div className="cp-cart-items">
          {selectedLines.map((line) => {
            const { product, quantity } = line;
            const imageUrl = getProductImageUrl(product, { fallback: true });
            const usesFallback = !hasProductImage(product);
            const orderUnit = getProductOrderUnitLabel(product);

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
                      .join(' - ')}
                  </span>
                  {quantity > 0 ? (
                    <span>{formatCaseQuantityBreakdown(product, quantity)}</span>
                  ) : null}
                </div>

                <div className="cp-cart-item-qty">
                  <button
                    className="btn btn-secondary btn-icon"
                    type="button"
                    onClick={() => {
                      if (quantity <= 0.25) {
                        const ok = window.confirm(
                          `Remove ${getProductDisplayName(product)} from your cart?`
                        );
                        if (!ok) return;
                      }
                      updateProductQuantity(product.id, getNextCaseQuantity(quantity, -1));
                    }}
                    aria-label={`Decrease ${getProductDisplayName(product)}`}
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    className="form-input"
                    type="number"
                    min="0.25"
                    step="0.25"
                    value={quantity}
                    onChange={(e) => updateProductQuantity(product.id, e.target.value)}
                    aria-label={`${getProductDisplayName(product)} case quantity`}
                  />
                  <button
                    className="btn btn-secondary btn-icon"
                    type="button"
                    onClick={() => updateProductQuantity(product.id, getNextCaseQuantity(quantity, 1))}
                    aria-label={`Increase ${getProductDisplayName(product)}`}
                  >
                    <Plus size={16} />
                  </button>
                </div>

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
                <option key={loc.id} value={loc.id}>{loc.name}</option>
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
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Order summary - items only, no prices */}
        <div className="cp-cart-summary-card">
          <h2>Order Summary</h2>
          {selectedLines.map((line) => (
            <div key={line.product.id} className="cp-cart-summary-row">
              <span>{getProductDisplayName(line.product)}</span>
              <span>{formatCaseQuantityBreakdown(line.product, line.quantity) || `x ${formatCaseQuantity(line.quantity)}`}</span>
            </div>
          ))}
          <div className="cp-cart-summary-total">
            <span>Total cases</span>
            <span>{formattedCartItemCount}</span>
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
            Review &amp; Submit Order
          </button>
        </div>
      </form>

      {showConfirm ? (
        <ConfirmOrderModal
          lines={selectedLines}
          locationName={activeLocationName}
          companyName={portalClients.find((c) => c.id === activeClientId)?.name || ''}
          submitting={submitting}
          onCancel={() => setShowConfirm(false)}
          onConfirm={handleConfirmedSubmit}
        />
      ) : null}
    </section>
  );
}

function ConfirmOrderModal({ lines, locationName, companyName, submitting, onCancel, onConfirm }) {
  useModalBehavior(onCancel, { enabled: !submitting });
  return (
    <div className="modal-overlay" onClick={submitting ? undefined : handleOverlayClick(onCancel)}>
      <div className="modal modal-order" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Are you sure you want to submit this order?</h3>
          <button className="btn btn-ghost" type="button" onClick={onCancel} disabled={submitting} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <p style={{ marginTop: 0, color: 'var(--color-text-secondary)' }}>
            Please double-check your selections. Once submitted, the order goes to Modhani for fulfilment.
          </p>

          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Company</div>
            <div style={{ fontWeight: 600 }}>{companyName || '-'}</div>
          </div>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Delivery location</div>
            <div style={{ fontWeight: 600 }}>{locationName || '-'}</div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Items ({formatCaseQuantity(lines.reduce((sum, l) => sum + l.quantity, 0))} cases)
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid var(--color-border-light, #f1f1ef)' }}>
            {lines.map((line) => (
              <li
                key={line.product.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--color-border-light, #f1f1ef)',
                  fontSize: 14,
                }}
              >
                <span>{getProductDisplayName(line.product)}</span>
                <strong>{formatCaseQuantityBreakdown(line.product, line.quantity) || `x ${formatCaseQuantity(line.quantity)}`}</strong>
              </li>
            ))}
          </ul>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" type="button" onClick={onCancel} disabled={submitting}>
            Back to cart
          </button>
          <button className="btn btn-primary" type="button" onClick={onConfirm} disabled={submitting}>
            <CheckCircle2 size={16} /> {submitting ? 'Submitting...' : 'Yes, submit order'}
          </button>
        </div>
      </div>
    </div>
  );
}
