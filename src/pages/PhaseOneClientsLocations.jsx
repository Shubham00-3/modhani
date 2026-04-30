import { useMemo, useState } from 'react';
import { Check, DollarSign, Plus, Search, Settings2, UserRoundCheck, Users } from 'lucide-react';
import { useApp } from '../context/useApp';
import { formatClientLocationScale } from '../data/phaseOneData';
import { ClientModal, LocationModal, PricingModal } from '../components/settings/ManagementModals';

export default function PhaseOneClientsLocations() {
  const { state, dispatch, addToast } = useApp();
  const canManage = state.currentUser.permissions.manageSettings;
  const [editingClient, setEditingClient] = useState(null);
  const [editingLocation, setEditingLocation] = useState(null);
  const [pricingClientId, setPricingClientId] = useState(null);
  const [contactDrafts, setContactDrafts] = useState({});
  const [clientSearch, setClientSearch] = useState('');
  const [showClientModal, setShowClientModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const filteredClients = useMemo(() => {
    const query = clientSearch.trim().toLowerCase();
    if (!query) return state.clients;

    return state.clients.filter((client) => {
      const clientLocations = state.locations.filter((location) => location.clientId === client.id);
      const searchableText = [
        client.name,
        client.qbCustomerName,
        ...clientLocations.flatMap((location) => [
          location.name,
          location.city,
          location.addressLine1,
          location.addressLine2,
          location.postalCode,
        ]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [clientSearch, state.clients, state.locations]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Clients & Locations</h1>
          <p className="page-subtitle">
            Manage client accounts, store locations, and negotiated pricing in one place.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button className="btn btn-secondary" type="button" disabled={!canManage || state.clients.length === 0} onClick={() => setShowLocationModal(true)}>
            <Plus size={16} /> Add Location
          </button>
          <button className="btn btn-primary" type="button" disabled={!canManage} onClick={() => setShowClientModal(true)}>
            <Plus size={16} /> Add Client
          </button>
        </div>
      </div>

      {!canManage ? (
        <div className="alert alert-warning">
          <Settings2 size={18} />
          <div className="alert-content">
            <div className="alert-title">Read-only client management</div>
            <div className="alert-description">
              This user can review client setup, but only settings admins can add or change clients, locations, and pricing.
            </div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="client-directory-header">
          <div>
            <div className="card-title">
              <Users size={18} /> Client Directory
            </div>
            <div className="client-directory-count">
              Showing {filteredClients.length.toLocaleString()} of {state.clients.length.toLocaleString()} clients
            </div>
          </div>
          <label className="client-directory-search">
            <Search size={16} />
            <input
              type="search"
              value={clientSearch}
              onChange={(event) => setClientSearch(event.target.value)}
              placeholder="Search clients or locations..."
            />
          </label>
        </div>
        {filteredClients.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {filteredClients.map((client) => {
              const clientLocations = state.locations.filter((location) => location.clientId === client.id);

              return (
                <div key={client.id} className="card" style={{ padding: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{client.name}</div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                      {formatClientLocationScale(client, clientLocations.length)}
                    </div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', marginTop: 4 }}>
                      QB Customer: {client.qbCustomerName || client.name}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                    <button className="btn btn-secondary btn-sm" type="button" disabled={!canManage} onClick={() => setPricingClientId(client.id)}>
                      <DollarSign size={14} /> Pricing
                    </button>
                    <button className="btn btn-ghost btn-sm" type="button" disabled={!canManage} onClick={() => setEditingClient(client)}>
                      Edit
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {clientLocations.length ? (
                    clientLocations
                      .map((location) => (
                        <button
                          key={location.id}
                          className="btn btn-ghost btn-sm"
                          type="button"
                          disabled={!canManage}
                          onClick={() => setEditingLocation(location)}
                        >
                          {location.name}
                          {location.qbMappingStatus !== 'ready' ? ' - needs address' : ''}
                        </button>
                      ))
                  ) : (
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                      No locations configured yet. Add them as the rollout progresses.
                    </span>
                  )}
                </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <div className="empty-state-title">{state.clients.length ? 'No clients match that search' : 'No clients configured yet'}</div>
            <div className="empty-state-description">
              {state.clients.length
                ? 'Try searching by customer name, location, city, address, or postal code.'
                : 'Add your first client to start building locations and negotiated pricing.'}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <UserRoundCheck size={18} /> Customer Portal Contacts
        </div>
        {(state.customerContacts ?? []).length ? (
          <div className="customer-contact-list">
            {state.customerContacts.map((contact) => {
              const draft = contactDrafts[contact.userId] ?? contact;
              const isDirty =
                (draft.clientId ?? '') !== (contact.clientId ?? '') || draft.status !== contact.status;

              return (
                <div className="customer-contact-row" key={contact.userId}>
                  <div>
                    <strong>{contact.fullName || contact.email}</strong>
                    <p>{contact.email}</p>
                  </div>
                  <select
                    className="form-select"
                    value={draft.clientId ?? ''}
                    disabled={!canManage}
                    onChange={(event) =>
                      setContactDrafts((current) => ({
                        ...current,
                        [contact.userId]: {
                          ...draft,
                          clientId: event.target.value,
                          status: event.target.value && draft.status === 'pending' ? 'active' : draft.status,
                        },
                      }))
                    }
                  >
                    <option value="">Select company</option>
                    {state.clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="form-select"
                    value={draft.status}
                    disabled={!canManage}
                    onChange={(event) =>
                      setContactDrafts((current) => ({
                        ...current,
                        [contact.userId]: { ...draft, status: event.target.value },
                      }))
                    }
                  >
                    <option value="pending">Pending</option>
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                  <button
                    className="btn btn-secondary btn-sm"
                    type="button"
                    disabled={!canManage || !isDirty}
                    onClick={async () => {
                      const payload = {
                        ...contact,
                        ...draft,
                        status: draft.clientId && draft.status === 'pending' ? 'active' : draft.status,
                      };
                      const result = await dispatch({ type: 'UPDATE_CUSTOMER_CONTACT', payload });
                      if (result.ok) {
                        setContactDrafts((current) => {
                          const next = { ...current };
                          delete next[contact.userId];
                          return next;
                        });
                        addToast('Customer contact updated.');
                      }
                    }}
                  >
                    <Check size={14} /> {isDirty ? 'Save' : 'Saved'}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <div className="empty-state-title">No customer signups yet</div>
            <div className="empty-state-description">
              Customer self-signups will appear here for company linking and approval.
            </div>
          </div>
        )}
      </div>

      {showClientModal || editingClient ? (
        <ClientModal
          client={editingClient}
          onClose={() => {
            setShowClientModal(false);
            setEditingClient(null);
          }}
        />
      ) : null}

      {showLocationModal || editingLocation ? (
        <LocationModal
          location={editingLocation}
          onClose={() => {
            setShowLocationModal(false);
            setEditingLocation(null);
          }}
        />
      ) : null}

      {pricingClientId ? <PricingModal clientId={pricingClientId} onClose={() => setPricingClientId(null)} /> : null}
    </div>
  );
}
