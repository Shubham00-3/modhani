import { X } from 'lucide-react';
import { getProductDisplayName, getProductImageUrl, hasProductImage } from '../data/phaseOneData';
import { useModalBehavior, handleOverlayClick } from '../hooks/useModalBehavior';

/**
 * Shared lightbox for previewing a product image at full size. Used by the
 * Products page and the Inventory page; could be used anywhere there's a
 * product card you want to zoom into.
 */
export default function ProductImageLightbox({ product, onClose }) {
  useModalBehavior(onClose);

  if (!product) return null;
  const imageUrl = getProductImageUrl(product, { fallback: true });
  const usesFallback = !hasProductImage(product);

  return (
    <div
      className="modal-overlay product-image-lightbox-overlay"
      onClick={handleOverlayClick(onClose)}
    >
      <div className="product-image-lightbox" onClick={(event) => event.stopPropagation()}>
        <div className="product-image-lightbox-header">
          <div>
            <div className="product-image-lightbox-title">{getProductDisplayName(product)}</div>
            <div className="product-image-lightbox-meta">
              {usesFallback
                ? 'No product photo yet. Showing Modhani logo placeholder.'
                : product.category || 'Product image'}
            </div>
          </div>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={onClose}
            aria-label="Close product image"
          >
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
