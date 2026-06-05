import { useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../../context/useApp';
import { useModalBehavior, handleOverlayClick } from '../../hooks/useModalBehavior';
import { getProductImageUrl } from '../../data/phaseOneData';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';

export function ProductModal({ product, onClose }) {
  const { state, dispatch, addToast } = useApp();
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(getProductImageUrl(product, { fallback: true }));
  const [form, setForm] = useState(
    product
      ? {
          ...product,
          baseCataloguePrice:
            product.baseCataloguePrice == null ? '' : String(product.baseCataloguePrice),
        }
      : {
          name: '',
          unitSize: '',
          category: '',
          baseCataloguePrice: '',
          itemNumber: '',
          upc: '',
          packagingDetails: '',
          unitsPerCase: '',
          shelfLifeDays: '',
          leadTimeDays: '',
          orderUnitLabel: '',
          qbItemName: '',
          hstApplicable: false,
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
        const rawBasePrice = String(form.baseCataloguePrice ?? '').trim();
        const baseCataloguePrice = rawBasePrice === '' ? 0 : Number(rawBasePrice);
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

        if (!Number.isFinite(baseCataloguePrice) || baseCataloguePrice < 0) {
          addToast('Base catalogue price must be zero or greater.', 'warning');
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
            itemNumber: String(form.itemNumber ?? '').trim(),
            upc: String(form.upc ?? '').trim(),
            packagingDetails: String(form.packagingDetails ?? '').trim(),
            unitsPerCase,
            shelfLifeDays,
            leadTimeDays,
            orderUnitLabel: String(form.orderUnitLabel ?? '').trim(),
            qbItemName,
            qbMappingStatus: qbItemName ? 'ready' : 'needs_mapping',
            hstApplicable: Boolean(form.hstApplicable),
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
      <FormInput
        label="Base Catalogue Price"
        type="number"
        value={form.baseCataloguePrice ?? ''}
        onChange={(value) => setForm((current) => ({ ...current, baseCataloguePrice: value }))}
      />
      <FormInput label="QuickBooks Item Name" value={form.qbItemName ?? ''} onChange={(value) => setForm((current) => ({ ...current, qbItemName: value }))} />
      <FormCheckbox
        label="HST applicable (13%)"
        hint="When checked, 13% HST is added to this product's line total on invoices."
        checked={Boolean(form.hstApplicable)}
        onChange={(checked) => setForm((current) => ({ ...current, hstApplicable: checked }))}
      />
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
      operatingAs: '',
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
            operatingAs: form.operatingAs?.trim() || '',
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
      <FormInput
        label="Client Name (Legal)"
        value={form.name}
        onChange={(value) => setForm((current) => ({ ...current, name: value }))}
      />
      <FormInput
        label="Operating As (Friendly Name)"
        placeholder="e.g. Bharat Bazaar"
        value={form.operatingAs ?? ''}
        onChange={(value) => setForm((current) => ({ ...current, operatingAs: value }))}
      />
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
      repName: '',
      repEmail: '',
      repPhone: '',
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
        const repName = form.repName?.trim() ?? '';
        const repEmail = form.repEmail?.trim() ?? '';
        const repPhone = form.repPhone?.trim() ?? '';

        if (!form.clientId || !name) {
          addToast('Select a client and location name.', 'warning');
          return false;
        }

        if (repEmail && !isValidEmail(repEmail)) {
          addToast('Enter a valid representative email address.', 'warning');
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
            repName,
            repEmail,
            repPhone,
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

      <div className="form-section-divider" />
      <div className="form-section-title">Location Representative <span className="form-section-hint">(optional)</span></div>
      <FormInput
        label="Representative Name"
        placeholder="Person to contact for this location"
        value={form.repName ?? ''}
        onChange={(value) => setForm((current) => ({ ...current, repName: value }))}
      />
      <FormInput
        label="Representative Email"
        type="email"
        value={form.repEmail ?? ''}
        onChange={(value) => setForm((current) => ({ ...current, repEmail: value }))}
      />
      <FormInput
        label="Representative Phone"
        type="tel"
        placeholder="e.g. (905) 555-0123"
        value={form.repPhone ?? ''}
        onChange={(value) => setForm((current) => ({ ...current, repPhone: value }))}
      />
    </SimpleModal>
  );
}

function SimpleModal({ title, children, onClose, onSave }) {
  const [saving, setSaving] = useState(false);
  useModalBehavior(onClose, { enabled: !saving });

  return (
    <div className="modal-overlay" onClick={saving ? undefined : handleOverlayClick(onClose)}>
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
            className={`btn btn-primary${saving ? ' btn-loading' : ''}`}
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

function FormInput({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function FormCheckbox({ label, hint, checked, onChange }) {
  return (
    <div className="form-group">
      <label className="form-checkbox" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="form-label" style={{ margin: 0 }}>{label}</span>
      </label>
      {hint ? (
        <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-1)' }}>
          {hint}
        </div>
      ) : null}
    </div>
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
