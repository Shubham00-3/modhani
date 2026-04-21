import { useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../../context/useApp';
import { getProductDisplayName } from '../../data/phaseOneData';

export function ProductModal({ product, onClose }) {
  const { state, dispatch, addToast } = useApp();
  const [form, setForm] = useState(product ?? { name: '', unitSize: '', category: '', baseCataloguePrice: '' });

  return (
    <SimpleModal
      title={product ? 'Edit Product' : 'Add Product'}
      onClose={onClose}
      onSave={async () => {
        const name = form.name.trim();
        const unitSize = form.unitSize.trim();
        const baseCataloguePrice = Number(form.baseCataloguePrice);

        if (!name || !unitSize) {
          addToast('Enter product name and unit size.', 'warning');
          return false;
        }

        if (Number.isNaN(baseCataloguePrice) || baseCataloguePrice < 0) {
          addToast('Base catalogue price must be zero or greater.', 'warning');
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

        const result = await dispatch({
          type: product ? 'UPDATE_PRODUCT' : 'ADD_PRODUCT',
          payload: {
            ...product,
            ...form,
            name,
            unitSize,
            id: product?.id ?? `prod-${Date.now()}`,
            baseCataloguePrice,
          },
        });

        if (result.ok) {
          onClose();
        }

        return result.ok;
      }}
    >
      <FormInput label="Product Name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
      <FormInput label="Unit Size" value={form.unitSize} onChange={(value) => setForm((current) => ({ ...current, unitSize: value }))} />
      <FormInput label="Category" value={form.category} onChange={(value) => setForm((current) => ({ ...current, category: value }))} />
      <FormInput label="Base Catalogue Price" type="number" value={form.baseCataloguePrice} onChange={(value) => setForm((current) => ({ ...current, baseCataloguePrice: value }))} />
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
    </SimpleModal>
  );
}

export function LocationModal({ location, onClose }) {
  const { state, dispatch, addToast } = useApp();
  const [form, setForm] = useState(location ?? { clientId: state.clients[0]?.id ?? '', code: '', city: '', name: '' });

  return (
    <SimpleModal
      title={location ? 'Edit Location' : 'Add Location'}
      onClose={onClose}
      onSave={async () => {
        const name = form.name.trim();
        const code = form.code?.trim() ?? '';
        const city = form.city?.trim() ?? '';

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
      <FormInput label="City" value={form.city} onChange={(value) => setForm((current) => ({ ...current, city: value }))} />
      <FormInput label="Display Name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
    </SimpleModal>
  );
}

export function PricingModal({ clientId, onClose }) {
  const { state, dispatch, addToast } = useApp();
  const client = state.clients.find((entry) => entry.id === clientId);
  const [prices, setPrices] = useState(() =>
    Object.fromEntries(
      state.products.map((product) => {
        const existing = state.clientPricing.find((pricing) => pricing.clientId === clientId && pricing.productId === product.id);
        return [product.id, existing?.price ?? product.baseCataloguePrice];
      })
    )
  );

  return (
    <SimpleModal
      title={`Pricing - ${client?.name}`}
      onClose={onClose}
      onSave={async () => {
        const invalid = Object.values(prices).some((price) => Number.isNaN(Number(price)) || Number(price) < 0);

        if (invalid) {
          addToast('All negotiated prices must be zero or greater.', 'warning');
          return false;
        }

        const results = await Promise.all(
          Object.entries(prices).map(([productId, price]) =>
            dispatch({
            type: 'SET_CLIENT_PRICING',
            payload: {
              id: `cp-${clientId}-${productId}`,
              clientId,
              productId,
              price: Number(price),
            },
            })
          )
        );

        const failed = results.find((result) => !result.ok);
        if (!failed) {
          onClose();
        }

        return !failed;
      }}
    >
      {state.products.map((product) => (
        <FormInput
          key={product.id}
          label={getProductDisplayName(product)}
          type="number"
          value={prices[product.id]}
          onChange={(value) => setPrices((current) => ({ ...current, [product.id]: value }))}
        />
      ))}
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

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
