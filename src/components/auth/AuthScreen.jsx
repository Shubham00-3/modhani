import { useState } from 'react';
import { ArrowRight, Building2, LockKeyhole, UserRoundPlus } from 'lucide-react';
import { useApp } from '../../context/useApp';

export default function AuthScreen() {
  const { state, login, signUpCustomer } = useApp();
  const [accountType, setAccountType] = useState('staff');
  const [customerMode, setCustomerMode] = useState('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setNotice('');

    const result =
      accountType === 'customer' && customerMode === 'signup'
        ? await signUpCustomer({ email, password, fullName })
        : await login({ email, password });

    if (!result.ok) {
      setError(result.error ?? 'Unable to sign in.');
    } else if (result.needsEmailConfirmation) {
      setNotice('Account created. Check your email to confirm your login before signing in.');
    }

    setSubmitting(false);
  }

  return (
    <div
      className="auth-screen"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '32px',
        background:
          'radial-gradient(circle at top left, rgba(209,161,78,0.14), transparent 28%), linear-gradient(180deg, #f4f7f4 0%, #eef2ef 100%)',
      }}
    >
      <div
        className="auth-shell"
        style={{
          width: 'min(960px, 100%)',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
          gap: '24px',
        }}
      >
        <section
          className="card"
          style={{
            padding: '32px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '24px',
          }}
        >
          <div>
            <h1 className="auth-title" style={{ fontSize: '40px', lineHeight: 1.05, margin: '18px 0 10px' }}>
              {accountType === 'staff' ? 'Staff Sign In' : 'Customer Portal'}
            </h1>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '16px', maxWidth: '40ch' }}>
              {accountType === 'staff'
                ? 'Sign in with your internal staff account to access ModhaniOS.'
                : 'Customers can sign in or request access to place portal orders.'}
            </p>
          </div>
        </section>

        <section className="card" style={{ padding: '32px' }}>
          <div className="auth-choice-tabs" style={{ marginBottom: '20px' }}>
            <button
              className={`auth-choice-tab ${accountType === 'staff' ? 'active' : ''}`}
              type="button"
              onClick={() => {
                setAccountType('staff');
                setError('');
                setNotice('');
              }}
            >
              <LockKeyhole size={16} /> Staff Login
            </button>
            <button
              className={`auth-choice-tab ${accountType === 'customer' ? 'active' : ''}`}
              type="button"
              onClick={() => {
                setAccountType('customer');
                setError('');
                setNotice('');
              }}
            >
              <Building2 size={16} /> Customer Login
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                display: 'grid',
                placeItems: 'center',
                background: 'rgba(26,48,33,0.1)',
                color: 'var(--color-primary)',
              }}
            >
              {accountType === 'staff' ? <LockKeyhole size={18} /> : <UserRoundPlus size={18} />}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '18px' }}>
                {accountType === 'staff' ? 'Login' : customerMode === 'signin' ? 'Customer Sign In' : 'Customer Sign Up'}
              </div>
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>
                {accountType === 'staff' ? 'Internal staff access only' : 'Order portal access'}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {accountType === 'customer' ? (
              <div className="auth-mode-switch">
                <button
                  className={customerMode === 'signin' ? 'active' : ''}
                  type="button"
                  onClick={() => {
                    setCustomerMode('signin');
                    setError('');
                    setNotice('');
                  }}
                >
                  Sign In
                </button>
                <button
                  className={customerMode === 'signup' ? 'active' : ''}
                  type="button"
                  onClick={() => {
                    setCustomerMode('signup');
                    setError('');
                    setNotice('');
                  }}
                >
                  Sign Up
                </button>
              </div>
            ) : null}

            {accountType === 'customer' && customerMode === 'signup' ? (
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input className="form-input" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
              </div>
            ) : null}

            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>

            {error ? (
              <div className="alert alert-warning">
                <div className="alert-content">
                  <div className="alert-title">Sign-in failed</div>
                  <div className="alert-description">{error}</div>
                </div>
              </div>
            ) : null}

            {notice ? (
              <div className="alert alert-success">
                <div className="alert-content">
                  <div className="alert-title">Check your inbox</div>
                  <div className="alert-description">{notice}</div>
                </div>
              </div>
            ) : null}

            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting
                ? customerMode === 'signup' && accountType === 'customer'
                  ? 'Creating Account...'
                  : 'Signing In...'
                : customerMode === 'signup' && accountType === 'customer'
                  ? 'Create Account'
                  : 'Sign In'}
              {!submitting ? <ArrowRight size={16} /> : null}
            </button>
          </form>

          {state.authError ? (
            <div style={{ marginTop: '16px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
              {state.authError}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
