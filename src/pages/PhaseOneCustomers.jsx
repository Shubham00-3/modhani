import { useMemo, useState } from 'react';
import { Check, Mail, Plus, Search, Settings2, UserPlus, UserRoundCheck, X } from 'lucide-react';
import { useApp } from '../context/useApp';
import { supabase } from '../lib/supabaseClient';

export default function PhaseOneCustomers() {
  const { state, dispatch, addToast } = useApp();
  const canManage = state.currentUser?.permissions?.manageSettings;
  const [customerSearch, setCustomerSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [contactDrafts, setContactDrafts] = useState({});

  const customers = useMemo(() => state.customerContacts ?? [], [state.customerContacts]);

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    if (!query) return customers;

    return customers.filter((contact) => {
      const searchable = [contact.fullName, contact.email, contact.clientId]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchable.includes(query);
    });
  }, [customerSearch, customers]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">
            Manage customer portal accounts. Add customers by email to send them an invitation.
          </p>
        </div>
        <div>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!canManage}
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={16} /> Add Customer
          </button>
        </div>
      </div>

      {!canManage ? (
        <div className="alert alert-warning">
          <Settings2 size={18} />
          <div className="alert-content">
            <div className="alert-title">Read-only customer management</div>
            <div className="alert-description">
              Only settings admins can add or modify customer accounts.
            </div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="client-directory-header">
          <div>
            <div className="card-title">
              <UserRoundCheck size={18} /> Customer Directory
            </div>
            <div className="client-directory-count">
              Showing {filteredCustomers.length.toLocaleString()} of {customers.length.toLocaleString()} customers
            </div>
          </div>
          <label className="client-directory-search">
            <Search size={16} />
            <input
              type="search"
              value={customerSearch}
              onChange={(event) => setCustomerSearch(event.target.value)}
              placeholder="Search customers by name or email..."
            />
          </label>
        </div>

        {filteredCustomers.length ? (
          <div className="customer-contact-list">
            {filteredCustomers.map((contact) => {
              const draft = contactDrafts[contact.userId] ?? contact;
              const isDirty =
                (draft.clientId ?? '') !== (contact.clientId ?? '') || draft.status !== contact.status;

              return (
                <div className="customer-contact-row" key={contact.userId}>
                  <div className="customer-contact-info">
                    <strong>{contact.fullName || contact.email}</strong>
                    <p>{contact.email}</p>
                  </div>
                  <div className="customer-contact-controls">
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
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <div className="empty-state-title">
              {customers.length ? 'No customers match that search' : 'No customers added yet'}
            </div>
            <div className="empty-state-description">
              {customers.length
                ? 'Try searching by name or email.'
                : 'Add your first customer using the button above. They will receive an invitation email to set their password.'}
            </div>
          </div>
        )}
      </div>

      {showAddModal ? (
        <AddCustomerModal
          clients={state.clients}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => addToast('Customer invited successfully! They will receive an email to set their password.')}
        />
      ) : null}
    </div>
  );
}

function AddCustomerModal({ clients, onClose, onSuccess }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [clientId, setClientId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      // Get the current user's session token for authentication.
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        setError('You must be signed in to invite customers.');
        setSubmitting(false);
        return;
      }

      const response = await fetch('/api/invite-customer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          email: email.trim(),
          fullName: fullName.trim(),
          clientId: clientId || null,
        }),
      });

      const data = await response.json();

      if (!data.ok && !data.warning) {
        setError(data.error || 'Failed to invite customer.');
        setSubmitting(false);
        return;
      }

      if (data.warning) {
        setError(data.warning);
      }

      onSuccess();

      // Force a page reload to pick up the new customer contact from the server.
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (fetchError) {
      setError(fetchError.message || 'Network error. Please try again.');
    }

    setSubmitting(false);
  }

  return (
    <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <UserPlus size={20} /> Add Customer
          </h2>
          <button className="btn btn-ghost btn-sm" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="modal-description">
              Enter the customer's details below. An invitation email will be sent so they can set their password and sign in to the Customer Portal.
            </p>

            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input
                className="form-input"
                placeholder="e.g. John Smith"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email *</label>
              <div className="auth-input-wrap" style={{ background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <Mail size={16} />
                <input
                  className="form-input"
                  type="email"
                  placeholder="customer@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Assign to Company (optional)</label>
              <select
                className="form-select"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
              >
                <option value="">No company (assign later)</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              <div className="form-hint">
                If a company is selected, the customer will be activated immediately. Otherwise, they'll need to be linked later.
              </div>
            </div>

            {error ? (
              <div className="alert alert-warning">
                <div className="alert-content">
                  <div className="alert-title">Could not invite</div>
                  <div className="alert-description">{error}</div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="modal-footer">
            <button className="btn btn-ghost" type="button" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              <Mail size={16} />
              {submitting ? 'Sending Invite...' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
