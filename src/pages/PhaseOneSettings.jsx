import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, Settings2 } from 'lucide-react';
import { useApp } from '../context/useApp';
import { formatDateTime } from '../data/phaseOneData';
import UserManagementSection from '../components/settings/UserManagementSection';

export default function PhaseOneSettings() {
  const { state, dispatch, addToast } = useApp();
  const [searchParams] = useSearchParams();
  const canManage = state.currentUser.permissions.manageSettings;
  const dashboardSearch = (searchParams.get('q') ?? '').trim().toLowerCase();
  const settingSearchMatches = (values) => {
    if (!dashboardSearch) return true;
    return values
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(dashboardSearch);
  };
  const visibleEmailClients = state.clients.filter((client) =>
    settingSearchMatches([
      'client email preferences packing slip invoice delivery method',
      client.name,
      client.qbCustomerName,
      client.invoiceEmail,
      client.packingSlipEmail,
      client.deliveryMethod,
    ])
  );
  const showQuickBooksSettings = settingSearchMatches([
    'quickbooks connection connector company sync desktop settings',
    state.quickBooks.companyName,
    state.quickBooks.connectorName,
    state.quickBooks.status,
  ]);
  const staffSummary = {
    fulfilment: state.users.filter((user) => user.permissions.fulfilOrders).length,
    pricing: state.users.filter((user) => user.permissions.overridePrices).length,
    invoiceEditing: state.users.filter((user) => user.permissions.editInvoices).length,
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
              Switch to an admin user from the top bar to change system settings.
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid-4">
        <SummaryCard label="Fulfilment Access" value={`${staffSummary.fulfilment} staff`} />
        <SummaryCard label="Override Access" value={`${staffSummary.pricing} staff`} />
        <SummaryCard label="Invoice Editors" value={`${staffSummary.invoiceEditing} staff`} />
        <SummaryCard label="Settings Admins" value={`${staffSummary.settings} staff`} />
      </div>

      <UserManagementSection canManage={canManage} />

      {showQuickBooksSettings ? (
        <QuickBooksSettingsCard
          key={`${state.quickBooks.companyName}:${state.quickBooks.connectorName}`}
          canManage={canManage}
          quickBooks={state.quickBooks}
          dispatch={dispatch}
          addToast={addToast}
        />
      ) : null}

      <div className="card">
        <div className="card-title">
          <Mail size={18} /> Client Email Preferences
        </div>
        <div className="table-scroll-wrapper">
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
              {visibleEmailClients.map((client) => (
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
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="report-info-card card">
      <div className="report-info-card-label">{label}</div>
      <div className="report-info-card-value">{value}</div>
    </div>
  );
}

function QbStat({ label, value, tone, dot }) {
  return (
    <div className={`qb-stat${tone ? ` qb-stat-${tone}` : ''}`}>
      <div className="qb-stat-label">{label}</div>
      <div className="qb-stat-value">
        {dot ? <span className="qb-stat-dot" /> : null}
        <span>{value}</span>
      </div>
    </div>
  );
}

function QuickBooksSettingsCard({ canManage, quickBooks, dispatch, addToast }) {
  const [qbDraft, setQbDraft] = useState({
    companyName: quickBooks.companyName,
    connectorName: quickBooks.connectorName,
  });

  const rawStatus = quickBooks.status?.replaceAll('_', ' ') ?? 'Not configured';
  const statusLabel = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);
  const isHealthy = quickBooks.connected && quickBooks.status === 'connected';
  const failedCount = quickBooks.failedSyncCount ?? 0;

  return (
    <div className="card">
      <div className="card-title">QuickBooks Connection</div>
      <div className="qb-stat-grid">
        <QbStat label="Connector Status" value={statusLabel} tone={isHealthy ? 'success' : 'warning'} dot />
        <QbStat label="Last Check-In" value={formatDateTime(quickBooks.connectorLastSeenAt) || '-'} />
        <QbStat label="Last Successful Sync" value={formatDateTime(quickBooks.lastSyncAt) || '-'} />
        <QbStat label="Failed Sync Count" value={String(failedCount)} tone={failedCount > 0 ? 'warning' : 'muted'} />
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
