import { useState } from 'react';
import { Mail, Settings2, Users } from 'lucide-react';
import { useApp } from '../context/useApp';
import { formatDateTime } from '../data/phaseOneData';

export default function PhaseOneSettings() {
  const { state, dispatch, addToast } = useApp();
  const canManage = state.currentUser.permissions.manageSettings;
  const staffSummary = {
    fulfilment: state.users.filter((user) => user.permissions.fulfilOrders).length,
    pricing: state.users.filter((user) => user.permissions.overridePrices).length,
    settings: state.users.filter((user) => user.permissions.manageSettings).length,
    emailEnabled: state.clients.filter((client) => client.emailInvoice || client.emailPackingSlip).length,
    failedQbSyncs: state.quickBooksJobs.filter((job) => job.status === 'failed').length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">
            Manage staff permissions, QuickBooks connection details, and client communication defaults.
          </p>
        </div>
      </div>

      {!canManage ? (
        <div className="alert alert-warning">
          <Settings2 size={18} />
          <div className="alert-content">
            <div className="alert-title">Read-only for this user</div>
            <div className="alert-description">
              Switch to an admin user from the top bar to change Phase 1 settings.
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid-4">
        <SummaryCard label="Fulfilment Access" value={`${staffSummary.fulfilment} staff`} />
        <SummaryCard label="Override Access" value={`${staffSummary.pricing} staff`} />
        <SummaryCard label="Settings Admins" value={`${staffSummary.settings} staff`} />
        <SummaryCard label="Failed QB Syncs" value={`${staffSummary.failedQbSyncs} jobs`} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">
            <Users size={18} /> User Roles
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Fulfil Orders</th>
                <th>Override Prices</th>
                <th>Manage Settings</th>
              </tr>
            </thead>
            <tbody>
              {state.users.map((user) => (
                <tr key={user.id}>
                  <td style={{ fontWeight: 600 }}>{user.name}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={user.permissions.fulfilOrders}
                      disabled={!canManage}
                      onChange={(event) =>
                        dispatch({
                          type: 'UPDATE_USER',
                          payload: { id: user.id, permissions: { fulfilOrders: event.target.checked } },
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={user.permissions.overridePrices}
                      disabled={!canManage}
                      onChange={(event) =>
                        dispatch({
                          type: 'UPDATE_USER',
                          payload: { id: user.id, permissions: { overridePrices: event.target.checked } },
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={user.permissions.manageSettings}
                      disabled={!canManage}
                      onChange={(event) =>
                        dispatch({
                          type: 'UPDATE_USER',
                          payload: { id: user.id, permissions: { manageSettings: event.target.checked } },
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <QuickBooksSettingsCard
          key={`${state.quickBooks.companyName}:${state.quickBooks.connectorName}`}
          canManage={canManage}
          quickBooks={state.quickBooks}
          dispatch={dispatch}
          addToast={addToast}
        />
      </div>

      <div className="card">
        <div className="card-title">
          <Mail size={18} /> Client Email Preferences
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Packing Slip Email</th>
              <th>Invoice Email</th>
              <th>Delivery Method</th>
            </tr>
          </thead>
          <tbody>
            {state.clients.map((client) => (
              <tr key={client.id}>
                <td style={{ fontWeight: 600 }}>{client.name}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={client.emailPackingSlip}
                    disabled={!canManage}
                    onChange={(event) => dispatch({ type: 'UPDATE_CLIENT', payload: { id: client.id, emailPackingSlip: event.target.checked } })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={client.emailInvoice}
                    disabled={!canManage}
                    onChange={(event) => dispatch({ type: 'UPDATE_CLIENT', payload: { id: client.id, emailInvoice: event.target.checked } })}
                  />
                </td>
                <td>
                  <select
                    className="form-select"
                    value={client.deliveryMethod}
                    disabled={!canManage}
                    onChange={(event) => dispatch({ type: 'UPDATE_CLIENT', payload: { id: client.id, deliveryMethod: event.target.value } })}
                  >
                    <option value="email">Email</option>
                    <option value="edi">EDI</option>
                    <option value="both">Both</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <div style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
        {label}
      </div>
      <div style={{ marginTop: 6, fontWeight: 700, fontSize: 'var(--font-size-lg)' }}>{value}</div>
    </div>
  );
}

function QuickBooksSettingsCard({ canManage, quickBooks, dispatch, addToast }) {
  const [qbDraft, setQbDraft] = useState({
    companyName: quickBooks.companyName,
    connectorName: quickBooks.connectorName,
  });

  return (
      <div className="card">
        <div className="card-title">QuickBooks Connection</div>
      <div className="grid-2" style={{ marginBottom: 'var(--space-4)' }}>
        <SummaryCard label="Connector Status" value={quickBooks.status?.replaceAll('_', ' ') ?? 'Not configured'} />
        <SummaryCard label="Last Check-In" value={formatDateTime(quickBooks.connectorLastSeenAt)} />
        <SummaryCard label="Last Successful Sync" value={formatDateTime(quickBooks.lastSyncAt)} />
        <SummaryCard label="Failed Sync Count" value={String(quickBooks.failedSyncCount ?? 0)} />
      </div>
      <div className="form-group">
        <label className="form-label">Company Name</label>
        <input
          className="form-input"
          disabled={!canManage}
          value={qbDraft.companyName}
          onChange={(event) => setQbDraft((current) => ({ ...current, companyName: event.target.value }))}
        />
      </div>
      <div className="form-group">
        <label className="form-label">Connector Name</label>
        <input
          className="form-input"
          disabled={!canManage}
          value={qbDraft.connectorName}
          onChange={(event) => setQbDraft((current) => ({ ...current, connectorName: event.target.value }))}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
        <button
          className="btn btn-primary"
          type="button"
          disabled={
            !canManage ||
            (qbDraft.companyName === quickBooks.companyName &&
              qbDraft.connectorName === quickBooks.connectorName)
          }
          onClick={() =>
            {
              const companyName = qbDraft.companyName.trim();
              const connectorName = qbDraft.connectorName.trim();

              if (!companyName || !connectorName) {
                addToast('Enter both company name and connector name.', 'warning');
                return;
              }

              dispatch({
                type: 'UPDATE_QB_SETTINGS',
                payload: {
                  companyName,
                  connectorName,
                },
              });
            }
          }
        >
          Save Connection Settings
        </button>
      </div>
    </div>
  );
}
