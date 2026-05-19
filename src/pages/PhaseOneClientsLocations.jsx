import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  DollarSign,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Settings2,
  User,
  Users,
} from 'lucide-react';
import { useApp } from '../context/useApp';
import { formatClientLocationScale } from '../data/phaseOneData';
import { ClientModal, LocationModal, PricingModal } from '../components/settings/ManagementModals';

function initialsOf(name) {
  if (!name) return '?';
  const parts = name.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Stable pastel accent so each client has its own subtle identity color
// while staying within the brand palette. Deterministic so the same client
// keeps the same color on every page load.
const ACCENT_PALETTE = [
  { bg: '#dde7d7', fg: '#2e5a1c' }, // sage
  { bg: '#e7d9c4', fg: '#7a4e1a' }, // wheat
  { bg: '#d4dfe6', fg: '#1e4e6b' }, // dusty blue
  { bg: '#e9d5d5', fg: '#8a3530' }, // rose
  { bg: '#dcd9e9', fg: '#473a7a' }, // lavender
  { bg: '#e2e2cd', fg: '#5c6020' }, // olive
];
function accentFor(id) {
  let hash = 0;
  for (let i = 0; i < (id ?? '').length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return ACCENT_PALETTE[hash % ACCENT_PALETTE.length];
}

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
          location.name, location.city, location.addressLine1, location.addressLine2,
          location.postalCode, location.repName, location.repEmail, location.repPhone,
        ]),
      ].filter(Boolean).join(' ').toLowerCase();
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

      <div className="clients-directory">
        <div className="clients-toolbar">
          <div>
            <div className="clients-toolbar-title">
              <Users size={18} />
              <span>Client Directory</span>
            </div>
            <div className="clients-toolbar-count">
              {filteredClients.length.toLocaleString()} of {state.clients.length.toLocaleString()}
            </div>
          </div>
          <label className="clients-toolbar-search">
            <Search size={15} />
            <input
              type="search"
              value={clientSearch}
              onChange={(event) => setClientSearch(event.target.value)}
              placeholder="Search clients, locations, contacts..."
            />
          </label>
        </div>

        {filteredClients.length ? (
          <div className="clients-list">
            {filteredClients.map((client) => {
              const clientLocations = state.locations.filter((l) => l.clientId === client.id);
              const enabledProductCount = state.clientPricing.filter(
                (pricing) => pricing.clientId === client.id && pricing.isActive
              ).length;
              const open = isExpanded(client.id);
              const displayName = client.operatingAs?.trim() || client.name;
              const hasOperatingAs = Boolean(client.operatingAs?.trim());
              const accent = accentFor(client.id);

              return (
                <article key={client.id} className={`client-row ${open ? 'is-open' : ''}`}>
                  <button
                    type="button"
                    className="client-row-header"
                    onClick={() => toggleClient(client.id)}
                    aria-expanded={open}
                  >
                    <span
                      className="client-avatar"
                      style={{ background: accent.bg, color: accent.fg }}
                      aria-hidden="true"
                    >
                      {initialsOf(displayName)}
                    </span>

                    <div className="client-row-text">
                      <div className="client-row-title">
                        <span className="client-row-name">{displayName}</span>
                        {hasOperatingAs ? (
                          <span className="client-row-legal">{client.name}</span>
                        ) : null}
                      </div>
                      <div className="client-row-meta">
                        <span>
                          <MapPin size={12} />
                          {clientLocations.length} {clientLocations.length === 1 ? 'location' : 'locations'}
                        </span>
                        <span className="client-row-divider" />
                        <span>Tier {client.priceTier ?? 1}</span>
                        <span className="client-row-divider" />
                        <span>{enabledProductCount.toLocaleString()} products</span>
                      </div>
                    </div>

                    <span className={`client-row-chev ${open ? 'is-open' : ''}`} aria-hidden="true">
                      <ChevronRight size={18} />
                    </span>
                  </button>

                  {open ? (
                    <div className="client-row-detail">
                      {/* Primary actions, prominent */}
                      <div className="client-detail-actions">
                        <button
                          className="btn btn-primary btn-sm"
                          type="button"
                          disabled={!canManage}
                          onClick={() => setPricingClientId(client.id)}
                        >
                          <DollarSign size={14} /> Pricing &amp; Products
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          type="button"
                          disabled={!canManage}
                          onClick={() => setEditingClient(client)}
                        >
                          <Pencil size={14} /> Edit details
                        </button>
                      </div>

                      {/* Clean key/value details with no shouty caps */}
                      <dl className="client-detail-meta">
                        <div>
                          <dt>Legal name</dt>
                          <dd>{client.name}</dd>
                        </div>
                        <div>
                          <dt>QuickBooks customer</dt>
                          <dd>{client.qbCustomerName || client.name}</dd>
                        </div>
                        <div>
                          <dt>Scale</dt>
                          <dd>{formatClientLocationScale(client, clientLocations.length)}</dd>
                        </div>
                        <div>
                          <dt>Pricing tier</dt>
                          <dd>
                            Tier {client.priceTier ?? 1} - {enabledProductCount.toLocaleString()} visible products
                          </dd>
                        </div>
                      </dl>

                      <div className="client-locations-block">
                        <div className="client-locations-heading">
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
                          <div className="client-locations-empty">
                            No locations yet for this client.
                          </div>
                        ) : (
                          <div className="client-locations-grid">
                            {clientLocations.map((location) => (
                              <LocationTile
                                key={location.id}
                                location={location}
                                canManage={canManage}
                                onEdit={() => setEditingLocation(location)}
                              />
                            ))}
                          </div>
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
            <div className="empty-state-title">
              {state.clients.length ? 'No clients match that search' : 'No clients configured yet'}
            </div>
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
          onClose={() => { setShowClientModal(false); setEditingClient(null); }}
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
 * Compact, visually distinct tile for a single delivery location. Includes
 * the address and (optionally) the on-site representative contact. Designed
 * to read at a glance; edit is an explicit pencil button.
 */
function LocationTile({ location, canManage, onEdit }) {
  const street = [location.addressLine1, location.addressLine2].filter(Boolean).join(' ');
  const cityPostal = [location.city, location.province, location.postalCode].filter(Boolean).join(' ');
  const fullAddress = [street, cityPostal].filter(Boolean).join(', ');
  const needsAddress = location.qbMappingStatus !== 'ready';
  const hasContact = Boolean(location.repName || location.repEmail || location.repPhone);

  return (
    <div className={`location-tile ${needsAddress ? 'is-warning' : ''}`}>
      <header className="location-tile-header">
        <div className="location-tile-title">
          <span className="location-tile-name">{location.name}</span>
          {needsAddress ? <span className="location-tile-tag">Needs address</span> : null}
        </div>
        <button
          className="location-tile-edit"
          type="button"
          disabled={!canManage}
          onClick={onEdit}
          aria-label={`Edit ${location.name}`}
          title="Edit location"
        >
          <Pencil size={13} />
        </button>
      </header>

      <p className="location-tile-address">
        <MapPin size={13} />
        <span>{fullAddress || 'No address set yet'}</span>
      </p>

      {hasContact ? (
        <div className="location-tile-contact">
          {location.repName ? (
            <div className="location-tile-contact-name">
              <User size={12} />
              {location.repName}
            </div>
          ) : null}
          {(location.repPhone || location.repEmail) ? (
            <div className="location-tile-contact-lines">
              {location.repPhone ? (
                <a href={`tel:${location.repPhone}`} className="location-tile-contact-link">
                  <Phone size={11} /> {location.repPhone}
                </a>
              ) : null}
              {location.repEmail ? (
                <a href={`mailto:${location.repEmail}`} className="location-tile-contact-link">
                  <Mail size={11} /> {location.repEmail}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
