import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  ChevronUp,
  DollarSign,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Settings2,
  Users,
} from 'lucide-react';
import { useApp } from '../context/useApp';
import { formatClientLocationScale } from '../data/phaseOneData';
import { ClientModal, LocationModal, PricingModal } from '../components/settings/ManagementModals';

export default function PhaseOneClientsLocations() {
  const { state } = useApp();
  const [searchParams] = useSearchParams();
  const canManage = state.currentUser.permissions.manageSettings;
  const [editingClient, setEditingClient] = useState(null);
  const [editingLocation, setEditingLocation] = useState(null);
  const [pricingClientId, setPricingClientId] = useState(null);
  const [clientSearch, setClientSearch] = useState('');
  const dashboardSearch = searchParams.get('q') ?? '';
  const [showClientModal, setShowClientModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [expandedClientIds, setExpandedClientIds] = useState(() => new Set());
  const [addLocationClientId, setAddLocationClientId] = useState(null);

  const query = (clientSearch || dashboardSearch).trim().toLowerCase();
  const searching = Boolean(query);

  const filteredClients = useMemo(() => {
    if (!query) return state.clients;
    return state.clients.filter((client) => {
      const clientLocations = state.locations.filter((l) => l.clientId === client.id);
      const searchableText = [
        client.name,
        client.operatingAs,
        client.qbCustomerName,
        ...clientLocations.flatMap((location) => [
          location.name,
          location.city,
          location.addressLine1,
          location.addressLine2,
          location.postalCode,
          location.repName,
          location.repEmail,
          location.repPhone,
        ]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchableText.includes(query);
    });
  }, [query, state.clients, state.locations]);

  function toggleClient(clientId) {
    setExpandedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  function isExpanded(clientId) {
    if (searching) return true;
    return expandedClientIds.has(clientId);
  }

  function handleAddLocationForClient(clientId) {
    setAddLocationClientId(clientId);
    setShowLocationModal(true);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Clients & Locations</h1>
          <p className="page-subtitle">
            Manage client accounts, store locations, pricing tiers, and visible products in one place.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={!canManage || state.clients.length === 0}
            onClick={() => { setAddLocationClientId(null); setShowLocationModal(true); }}
          >
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
          <div className="cl-list">
            {filteredClients.map((client) => {
              const clientLocations = state.locations.filter((l) => l.clientId === client.id);
              const enabledProductCount = state.clientPricing.filter(
                (pricing) => pricing.clientId === client.id && pricing.isActive
              ).length;
              const open = isExpanded(client.id);
              const displayName = client.operatingAs?.trim() || client.name;
              const hasOperatingAs = Boolean(client.operatingAs?.trim());

              return (
                <article key={client.id} className={`cl-card ${open ? 'is-open' : ''}`}>
                  <button
                    type="button"
                    className="cl-card-header"
                    onClick={() => toggleClient(client.id)}
                    aria-expanded={open}
                  >
                    <div className="cl-card-header-text">
                      <h3 className="cl-card-name">{displayName}</h3>
                      <div className="cl-card-subtitle">
                        {hasOperatingAs ? <span>{client.name}</span> : null}
                        {hasOperatingAs ? <span className="cl-dot" /> : null}
                        <span>
                          {clientLocations.length}{' '}
                          {clientLocations.length === 1 ? 'location' : 'locations'}
                        </span>
                        <span className="cl-dot" />
                        <span>Tier {client.priceTier ?? 1}</span>
                      </div>
                    </div>
                    <span className="cl-chev" aria-hidden="true">
                      {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </span>
                  </button>

                  {open ? (
                    <div className="cl-card-body">
                      {/* Quick-facts row + actions */}
                      <div className="cl-facts">
                        <div className="cl-fact">
                          <span className="cl-fact-label">Legal name</span>
                          <span className="cl-fact-value">{client.name}</span>
                        </div>
                        <div className="cl-fact">
                          <span className="cl-fact-label">QuickBooks customer</span>
                          <span className="cl-fact-value">{client.qbCustomerName || client.name}</span>
                        </div>
                        <div className="cl-fact">
                          <span className="cl-fact-label">Scale</span>
                          <span className="cl-fact-value">
                            {formatClientLocationScale(client, clientLocations.length)}
                          </span>
                        </div>
                        <div className="cl-fact">
                          <span className="cl-fact-label">Pricing</span>
                          <span className="cl-fact-value">
                            Tier {client.priceTier ?? 1} - {enabledProductCount.toLocaleString()} products
                          </span>
                        </div>
                      </div>

                      <div className="cl-actions">
                        <button
                          className="btn btn-secondary btn-sm"
                          type="button"
                          disabled={!canManage}
                          onClick={() => setPricingClientId(client.id)}
                        >
                          <DollarSign size={14} /> Pricing &amp; Products
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          disabled={!canManage}
                          onClick={() => setEditingClient(client)}
                        >
                          <Pencil size={14} /> Edit client info
                        </button>
                      </div>

                      {/* Locations */}
                      <div className="cl-locations">
                        <div className="cl-locations-header">
                          <h4>Locations</h4>
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            disabled={!canManage}
                            onClick={() => handleAddLocationForClient(client.id)}
                          >
                            <Plus size={14} /> Add Location
                          </button>
                        </div>

                        {clientLocations.length === 0 ? (
                          <p className="cl-locations-empty">
                            No locations yet. Use <em>Add Location</em> to create the first one.
                          </p>
                        ) : (
                          <ul className="cl-location-list">
                            {clientLocations.map((location) => (
                              <li key={location.id}>
                                <LocationRow
                                  location={location}
                                  canManage={canManage}
                                  onEdit={() => setEditingLocation(location)}
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ) : null}
                </article>
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
          location={editingLocation ?? (addLocationClientId ? { clientId: addLocationClientId } : null)}
          onClose={() => {
            setShowLocationModal(false);
            setEditingLocation(null);
            setAddLocationClientId(null);
          }}
        />
      ) : null}

      {pricingClientId ? <PricingModal clientId={pricingClientId} onClose={() => setPricingClientId(null)} /> : null}
    </div>
  );
}

/**
 * Single location rendered as a clean row: name + address + contact info
 * inline; edit pencil on the right. No nested boxed card.
 */
function LocationRow({ location, canManage, onEdit }) {
  const street = [location.addressLine1, location.addressLine2].filter(Boolean).join(' ');
  const cityPostal = [location.city, location.province, location.postalCode].filter(Boolean).join(' ');
  const fullAddress = [street, cityPostal].filter(Boolean).join(', ');
  const needsAddress = location.qbMappingStatus !== 'ready';
  const hasContact = Boolean(location.repName || location.repEmail || location.repPhone);

  return (
    <div className={`cl-location-row ${needsAddress ? 'is-warning' : ''}`}>
      <div className="cl-location-main">
        <div className="cl-location-name-row">
          <span className="cl-location-name">{location.name}</span>
          {needsAddress ? <span className="cl-tag cl-tag-warn">Needs address</span> : null}
        </div>
        <div className="cl-location-address">
          <MapPin size={13} />
          <span>{fullAddress || 'No address set yet'}</span>
        </div>
        {hasContact ? (
          <div className="cl-location-contact">
            {location.repName ? (
              <span className="cl-location-contact-item">
                <strong>{location.repName}</strong>
              </span>
            ) : null}
            {location.repPhone ? (
              <span className="cl-location-contact-item">
                <Phone size={12} /> {location.repPhone}
              </span>
            ) : null}
            {location.repEmail ? (
              <a
                className="cl-location-contact-item cl-location-contact-link"
                href={`mailto:${location.repEmail}`}
              >
                <Mail size={12} /> {location.repEmail}
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
      <button
        className="btn btn-ghost btn-sm cl-location-edit"
        type="button"
        disabled={!canManage}
        onClick={onEdit}
        aria-label={`Edit ${location.name}`}
        title={`Edit ${location.name}`}
      >
        <Pencil size={14} /> Edit
      </button>
    </div>
  );
}
