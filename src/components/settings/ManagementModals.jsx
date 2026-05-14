import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { useApp } from '../../context/useApp';
import {
  PRICE_TIERS,
  formatCurrency,
  getProductDisplayName,
  getProductImageUrl,
  getProductTierPrice,
  hasProductImage,
  normalizePriceTier,
} from '../../data/phaseOneData';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';

export function ProductModal({ product, onClose }) {
  const { state, dispatch, addToast } = useApp();
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(getProductImageUrl(product, { fallback: true }));
  const [form, setForm] = useState(
    product
      ? {
          ...product,
          tierPrices: buildTierPriceForm(product),
        }
      : {
          name: '',
          unitSize: '',
          category: '',
          baseCataloguePrice: '',
          tierPrices: buildTierPriceForm(null),
          itemNumber: '',
          upc: '',
          packagingDetails: '',
          unitsPerCase: '',
          shelfLifeDays: '',
          leadTimeDays: '',
          orderUnitLabel: '',
          qbItemName: '',
          imageUrl: '',
          imagePath: '',
        }
  );

  return (
    <SimpleModal
      title={product ? 'Edit Product' : 'Add Product'}
      onClose={onClose}
      onSave={async () => {
        const name = form.name.trim();
        const unitSize = String(form.unitSize ?? '').trim();
        const qbItemName = (form.qbItemName || `${name} ${unitSize}`).trim();
        const tierPrices = buildTierPricesFromForm(form.tierPrices);
        const baseCataloguePrice = tierPrices[1];
        const productId = product?.id ?? `prod-${Date.now()}`;
        const unitsPerCase = parseOptionalNumber(form.unitsPerCase);
        const shelfLifeDays = parseOptionalInteger(form.shelfLifeDays);
        const leadTimeDays = parseOptionalInteger(form.leadTimeDays);
        let imageUrl = form.imageUrl ?? '';
        let imagePath = form.imagePath ?? '';

        if (!name) {
          addToast('Enter product name.', 'warning');
          return false;
        }

        if (!unitSize) {
          addToast('Enter product size or packaging unit.', 'warning');
          return false;
        }

        const hasInvalidTierPrice = PRICE_TIERS.some(
          (tier) => Number.isNaN(Number(form.tierPrices?.[tier])) || Number(form.tierPrices?.[tier]) < 0
        );

        if (hasInvalidTierPrice) {
          addToast('Tier prices must be zero or greater.', 'warning');
          return false;
        }

        if (Number.isNaN(unitsPerCase) || Number.isNaN(shelfLifeDays) || Number.isNaN(leadTimeDays)) {
          addToast('Units per case, shelf life, and lead time must be zero or greater.', 'warning');
          return false;
        }

        const duplicate = state.products.find(
          (entry) =>
            entry.id !== product?.id &&
            entry.name.trim().toLowerCase() === name.toLowerCase() &&
            entry.unitSize.trim().toLowerCase() === unitSize.toLowerCase()
        );

        if (duplicate) {
          addToast('A product with the same name and unit size already exists.', 'warning');
          return false;
        }

        if (imageFile) {
          if (!isSupabaseConfigured || !supabase) {
            addToast('Image upload needs Supabase Storage. Save a public image URL instead for demo mode.', 'warning');
            return false;
          }

          const extension = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg';
          imagePath = `${productId}/${Date.now()}.${extension}`;
          const { error: uploadError } = await supabase.storage
            .from('product-images')
            .upload(imagePath, imageFile, {
              cacheControl: '3600',
              upsert: true,
            });

          if (uploadError) {
            addToast(`Image upload failed: ${uploadError.message}`, 'warning');
            return false;
          }

          const { data } = supabase.storage.from('product-images').getPublicUrl(imagePath);
          imageUrl = data.publicUrl;
        }

        const result = await dispatch({
          type: product ? 'UPDATE_PRODUCT' : 'ADD_PRODUCT',
          payload: {
            ...product,
            ...form,
            name,
            unitSize,
            id: productId,
            baseCataloguePrice,
            tierPrices,
            itemNumber: String(form.itemNumber ?? '').trim(),
            upc: String(form.upc ?? '').trim(),
            packagingDetails: String(form.packagingDetails ?? '').trim(),
            unitsPerCase,
            shelfLifeDays,
            leadTimeDays,
            orderUnitLabel: String(form.orderUnitLabel ?? '').trim(),
            qbItemName,
            qbMappingStatus: qbItemName ? 'ready' : 'needs_mapping',
            imageUrl,
            imagePath,
          },
        });

        if (result.ok) {
          onClose();
        }

        return result.ok;
      }}
    >
      <FormInput label="Product Name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
      <FormInput
        label="Product Size / Retail Unit"
        value={form.unitSize}
        onChange={(value) => setForm((current) => ({ ...current, unitSize: value }))}
      />
      <FormInput label="Category" value={form.category} onChange={(value) => setForm((current) => ({ ...current, category: value }))} />
      <FormInput label="Modhani Item #" value={form.itemNumber ?? ''} onChange={(value) => setForm((current) => ({ ...current, itemNumber: value }))} />
      <FormInput label="UPC" value={form.upc ?? ''} onChange={(value) => setForm((current) => ({ ...current, upc: value }))} />
      <FormInput label="Packaging Details" value={form.packagingDetails ?? ''} onChange={(value) => setForm((current) => ({ ...current, packagingDetails: value }))} />
      <FormInput label="Units Per Case" type="number" value={form.unitsPerCase ?? ''} onChange={(value) => setForm((current) => ({ ...current, unitsPerCase: value }))} />
      <FormInput label="Shelf Life Days" type="number" value={form.shelfLifeDays ?? ''} onChange={(value) => setForm((current) => ({ ...current, shelfLifeDays: value }))} />
      <FormInput label="Lead Time Days" type="number" value={form.leadTimeDays ?? ''} onChange={(value) => setForm((current) => ({ ...current, leadTimeDays: value }))} />
      <FormInput label="Order Unit Label" value={form.orderUnitLabel ?? ''} onChange={(value) => setForm((current) => ({ ...current, orderUnitLabel: value }))} />
      <div className="form-group">
        <label className="form-label">Tier Prices</label>
        <div className="tier-price-grid">
          {PRICE_TIERS.map((tier) => (
            <label key={tier} className="tier-price-field">
              <span>{tier === 1 ? 'Tier 1 / Base' : `Tier ${tier}`}</span>
              <input
                className="form-input"
                type="number"
                min="0"
                step="0.01"
                value={form.tierPrices?.[tier] ?? ''}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    tierPrices: {
                      ...current.tierPrices,
                      [tier]: event.target.value,
                    },
                  }))
                }
              />
            </label>
          ))}
        </div>
      </div>
      <FormInput label="QuickBooks Item Name" value={form.qbItemName ?? ''} onChange={(value) => setForm((current) => ({ ...current, qbItemName: value }))} />
      <div className="form-group">
        <label className="form-label">Product Image</label>
        <div className="product-image-editor">
          <div className="product-image-preview">
            <img
              className={!form.imageUrl && !form.imagePath && !imageFile ? 'product-image-fallback' : ''}
              src={imagePreview || getProductImageUrl(null, { fallback: true })}
              alt={form.name || 'Modhani logo placeholder'}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', minWidth: 0 }}>
            <input
              className="form-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                setImageFile(nextFile);
                if (nextFile) {
                  setImagePreview(URL.createObjectURL(nextFile));
                }
              }}
            />
            <input
              className="form-input"
              value={form.imageUrl ?? ''}
              onChange={(event) => {
                setForm((current) => ({ ...current, imageUrl: event.target.value, imagePath: '' }));
                setImagePreview(event.target.value || getProductImageUrl(null, { fallback: true }));
              }}
              placeholder="Or paste a public image URL"
            />
          </div>
        </div>
      </div>
    </SimpleModal>
  );
}

export function ClientModal({ client, onClose }) {
  const { state, dispatch, addToast } = useApp();
  const [form, setForm] = useState(
    client ?? {
      name: '',
      locationCount: 1,
      deliveryMethod: 'email',
      emailPackingSlip: true,
      emailInvoice: true,
      packingSlipEmail: '',
      invoiceEmail: '',
      qbCustomerName: '',
    }
  );

  return (
    <SimpleModal
      title={client ? 'Edit Client' : 'Add Client'}
      onClose={onClose}
      onSave={async () => {
        const name = form.name.trim();
        const locationCount = Number(form.locationCount);
        const packingSlipEmail = form.packingSlipEmail?.trim() ?? '';
        const invoiceEmail = form.invoiceEmail?.trim() ?? '';
        const qbCustomerName = (form.qbCustomerName || name).trim();

        if (!name) {
          addToast('Enter a client name.', 'warning');
          return false;
        }

        if (Number.isNaN(locationCount) || locationCount < 0) {
          addToast('Location count must be zero or greater.', 'warning');
          return false;
        }

        if (packingSlipEmail && !isValidEmail(packingSlipEmail)) {
          addToast('Enter a valid packing slip email.', 'warning');
          return false;
        }

        if (invoiceEmail && !isValidEmail(invoiceEmail)) {
          addToast('Enter a valid invoice email.', 'warning');
          return false;
        }

        const duplicate = state.clients.find(
          (entry) => entry.id !== client?.id && entry.name.trim().toLowerCase() === name.toLowerCase()
        );

        if (duplicate) {
          addToast('A client with that name already exists.', 'warning');
          return false;
        }

        const result = await dispatch({
          type: client ? 'UPDATE_CLIENT' : 'ADD_CLIENT',
          payload: {
            ...client,
            ...form,
            id: client?.id ?? `client-${Date.now()}`,
            name,
            locationCount,
            packingSlipEmail,
            invoiceEmail,
            qbCustomerName,
            qbMappingStatus: qbCustomerName ? 'ready' : 'needs_mapping',
          },
        });

        if (result.ok) {
          onClose();
        }

        return result.ok;
      }}
    >
      <FormInput label="Client Name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
      <FormInput label="Location Count" type="number" value={form.locationCount} onChange={(value) => setForm((current) => ({ ...current, locationCount: Number(value) }))} />
      <FormInput label="Packing Slip Email" value={form.packingSlipEmail ?? ''} onChange={(value) => setForm((current) => ({ ...current, packingSlipEmail: value }))} />
      <FormInput label="Invoice Email" value={form.invoiceEmail ?? ''} onChange={(value) => setForm((current) => ({ ...current, invoiceEmail: value }))} />
      <FormInput label="QuickBooks Customer Name" value={form.qbCustomerName ?? ''} onChange={(value) => setForm((current) => ({ ...current, qbCustomerName: value }))} />
    </SimpleModal>
  );
}

export function LocationModal({ location, onClose }) {
  const { state, dispatch, addToast } = useApp();
  const [form, setForm] = useState(
    location ?? {
      clientId: state.clients[0]?.id ?? '',
      code: '',
      city: '',
      name: '',
      addressLine1: '',
      addressLine2: '',
      province: '',
      postalCode: '',
      country: 'Canada',
      qbShipToName: '',
    }
  );

  return (
    <SimpleModal
      title={location ? 'Edit Location' : 'Add Location'}
      onClose={onClose}
      onSave={async () => {
        const name = form.name.trim();
        const code = form.code?.trim() ?? '';
        const city = form.city?.trim() ?? '';
        const addressLine1 = form.addressLine1?.trim() ?? '';
        const addressLine2 = form.addressLine2?.trim() ?? '';
        const province = form.province?.trim() ?? '';
        const postalCode = form.postalCode?.trim() ?? '';
        const country = (form.country || 'Canada').trim();
        const qbShipToName = (form.qbShipToName || name).trim();

        if (!form.clientId || !name) {
          addToast('Select a client and location name.', 'warning');
          return false;
        }

        const duplicate = state.locations.find(
          (entry) =>
            entry.id !== location?.id &&
            entry.clientId === form.clientId &&
            entry.name.trim().toLowerCase() === name.toLowerCase()
        );

        if (duplicate) {
          addToast('This client already has a location with that name.', 'warning');
          return false;
        }

        const result = await dispatch({
          type: location ? 'UPDATE_LOCATION' : 'ADD_LOCATION',
          payload: {
            ...location,
            ...form,
            id: location?.id ?? `loc-${Date.now()}`,
            name,
            code,
            city,
            addressLine1,
            addressLine2,
            province,
            postalCode,
            country,
            qbShipToName,
            qbMappingStatus: addressLine1 && city && province && postalCode ? 'ready' : 'needs_address',
          },
        });

        if (result.ok) {
          onClose();
        }

        return result.ok;
      }}
    >
      <div className="form-group">
        <label className="form-label">Client</label>
        <select className="form-select" value={form.clientId} onChange={(event) => setForm((current) => ({ ...current, clientId: event.target.value }))}>
          {state.clients.map((client) => (
            <option key={client.id} value={client.id}>{client.name}</option>
          ))}
        </select>
      </div>
      <FormInput label="Location Code" value={form.code} onChange={(value) => setForm((current) => ({ ...current, code: value }))} />
      <FormInput label="Display Name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
      <FormInput label="QuickBooks Ship-To Name" value={form.qbShipToName ?? ''} onChange={(value) => setForm((current) => ({ ...current, qbShipToName: value }))} />
      <FormInput label="Address Line 1" value={form.addressLine1 ?? ''} onChange={(value) => setForm((current) => ({ ...current, addressLine1: value }))} />
      <FormInput label="Address Line 2" value={form.addressLine2 ?? ''} onChange={(value) => setForm((current) => ({ ...current, addressLine2: value }))} />
      <FormInput label="City" value={form.city} onChange={(value) => setForm((current) => ({ ...current, city: value }))} />
      <FormInput label="Province" value={form.province ?? ''} onChange={(value) => setForm((current) => ({ ...current, province: value }))} />
      <FormInput label="Postal Code" value={form.postalCode ?? ''} onChange={(value) => setForm((current) => ({ ...current, postalCode: value }))} />
      <FormInput label="Country" value={form.country ?? 'Canada'} onChange={(value) => setForm((current) => ({ ...current, country: value }))} />
    </SimpleModal>
  );
}

export function PricingModal({ clientId, onClose }) {
  const { state, dispatch, addToast } = useApp();
  const client = state.clients.find((entry) => entry.id === clientId);
  const [selectedTier, setSelectedTier] = useState(normalizePriceTier(client?.priceTier));
  const [searchQuery, setSearchQuery] = useState('');
  const [enabledProductIds, setEnabledProductIds] = useState(
    () =>
      new Set(
        state.clientPricing
          .filter((pricing) => pricing.clientId === clientId && pricing.isActive)
          .map((pricing) => pricing.productId)
      )
  );
  const filteredProducts = state.products.filter((product) =>
    [
      getProductDisplayName(product),
      product.category,
      product.itemNumber,
      product.upc,
      product.packagingDetails,
      product.orderUnitLabel,
      product.qbItemName,
      getProductTierPrice(product, selectedTier),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(searchQuery.trim().toLowerCase())
  );

  function toggleProduct(productId) {
    setEnabledProductIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }

  return (
    <SimpleModal
      title={`Pricing & Products - ${client?.name}`}
      onClose={onClose}
      onSave={async () => {
        if (!client) {
          addToast('Client not found.', 'warning');
          return false;
        }

        const result = await dispatch({
          type: 'SAVE_CLIENT_CATALOGUE',
          payload: {
            clientId,
            priceTier: selectedTier,
            enabledProductIds: Array.from(enabledProductIds),
          },
        });

        if (result.ok) {
          onClose();
        }

        return result.ok;
      }}
    >
      <div className="form-group">
        <label className="form-label">Client Pricing Tier</label>
        <select
          className="form-select"
          value={selectedTier}
          onChange={(event) => setSelectedTier(normalizePriceTier(event.target.value))}
        >
          {PRICE_TIERS.map((tier) => (
            <option key={tier} value={tier}>
              Tier {tier}
            </option>
          ))}
        </select>
      </div>

      <label className="pricing-product-search">
        <Search size={16} />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search products..."
        />
      </label>

      <div className="pricing-product-list">
        {filteredProducts.length ? (
          filteredProducts.map((product) => {
            const checked = enabledProductIds.has(product.id);
            const imageUrl = getProductImageUrl(product, { fallback: true });
            const usesFallback = !hasProductImage(product);

            return (
              <label key={product.id} className={`pricing-product-row ${checked ? 'is-enabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleProduct(product.id)}
                />
                <span className={`product-thumb product-thumb-sm ${usesFallback ? 'product-thumb-fallback' : ''}`}>
                  <img src={imageUrl} alt={usesFallback ? 'Modhani logo placeholder' : getProductDisplayName(product)} />
                </span>
                <span className="pricing-product-main">
                  <strong>{getProductDisplayName(product)}</strong>
                  <span className="pricing-product-meta">
                    {[product.category, product.itemNumber ? `Item ${product.itemNumber}` : '', product.packagingDetails].filter(Boolean).join(' - ') || 'Catalogue item'}
                  </span>
                </span>
                <span className="pricing-product-price">
                  {formatCurrency(getProductTierPrice(product, selectedTier))}
                </span>
              </label>
            );
          })
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-6)' }}>
            <div className="empty-state-title">No products match that search</div>
            <div className="empty-state-description">Clear the search to review the full catalogue.</div>
          </div>
        )}
      </div>
    </SimpleModal>
  );
}

function SimpleModal({ title, children, onClose, onSave }) {
  const [saving, setSaving] = useState(false);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave();
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormInput({ label, value, onChange, type = 'text' }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function buildTierPriceForm(product) {
  return Object.fromEntries(
    PRICE_TIERS.map((tier) => [tier, product ? String(getProductTierPrice(product, tier)) : ''])
  );
}

function buildTierPricesFromForm(tierPrices) {
  return Object.fromEntries(
    PRICE_TIERS.map((tier) => {
      const value = Number(tierPrices?.[tier] ?? 0);
      return [tier, Number.isFinite(value) && value >= 0 ? value : 0];
    })
  );
}

function parseOptionalNumber(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;

  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : NaN;
}

function parseOptionalInteger(value) {
  const number = parseOptionalNumber(value);
  if (number == null || Number.isNaN(number)) return number;
  return Number.isInteger(number) ? number : NaN;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
