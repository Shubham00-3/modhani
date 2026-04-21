import { useState } from 'react';
import { DollarSign, Plus, Settings2, Users } from 'lucide-react';
import { useApp } from '../context/useApp';
import { ClientModal, LocationModal, PricingModal } from '../components/settings/ManagementModals';

export default function PhaseOneClientsLocations() {
  const { state } = useApp();
  const canManage = state.currentUser.permissions.manageSettings;
  const [editingClient, setEditingClient] = useState(null);
  const [editingLocation, setEditingLocation] = useState(null);
  const [pricingClientId, setPricingClientId] = useState(null);
  const [showClientModal, setShowClientModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);

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
          <button className="btn btn-secondary" type="button" disabled={!canManage} onClick={() => setShowLocationModal(true)}>
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
        <div className="card-title">
          <Users size={18} /> Client Directory
        </div>
        {state.clients.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {state.clients.map((client) => (
              <div key={client.id} className="card" style={{ padding: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{client.name}</div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                      {state.locations.filter((location) => location.clientId === client.id).length} configured locations
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
                  {state.locations.filter((location) => location.clientId === client.id).length ? (
                    state.locations
                      .filter((location) => location.clientId === client.id)
                      .map((location) => (
                        <button
                          key={location.id}
                          className="btn btn-ghost btn-sm"
                          type="button"
                          disabled={!canManage}
                          onClick={() => setEditingLocation(location)}
                        >
                          {location.name}
                        </button>
                      ))
                  ) : (
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                      No locations configured yet.
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <div className="empty-state-title">No clients configured yet</div>
            <div className="empty-state-description">
              Add your first client to start building locations and negotiated pricing.
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
