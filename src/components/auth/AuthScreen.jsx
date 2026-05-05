import { useState } from 'react';
import { ArrowRight, Building2, LockKeyhole, Mail, ShoppingCart, UserRoundPlus } from 'lucide-react';
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
    <div className="auth-screen">
      <div className="auth-shell auth-portal-shell">
        <section className="auth-market-panel">
          <div className="auth-market-copy">
            <div className="auth-kicker">Welcome</div>
            <h1 className="auth-title">
              Wholesome Dairy & Jams, Delivered <span>Fresh.</span>
            </h1>
            <p>
              Access Modhani portals for staff operations and customer order placement.
            </p>
          </div>

          <div className="auth-product-stage" aria-hidden="true">
            <img className="auth-product auth-product-ghee" src="/product-images/desi-ghee-800gms.jpg" alt="" />
            <img className="auth-product auth-product-yogurt" src="/product-images/balkan-yogurt-750g-6.jpg" alt="" />
            <img className="auth-product auth-product-milk" src="/product-images/a2-milk-4l-2.jpg" alt="" />
            <img className="auth-product auth-product-lassi" src="/product-images/3-mango-lassi-350ml.jpg" alt="" />
            <img className="auth-product auth-product-jam" src="/product-images/clarite-strawberry-fruit-jam-500g.jpg" alt="" />
          </div>
        </section>

        <section className="auth-form-card auth-portal-card">
          <img className="auth-card-logo" src="/modhani-logo.svg" alt="Modhani" />
          <div className="auth-card-title">LOGIN / SIGNUP</div>

          <div className="auth-choice-tabs">
            <button
              className={`auth-choice-tab ${accountType === 'staff' ? 'active' : ''}`}
              type="button"
              onClick={() => {
                setAccountType('staff');
                setError('');
                setNotice('');
              }}
            >
              <LockKeyhole size={16} /> Staff Portal
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
              <Building2 size={16} /> Customer Portal
            </button>
          </div>

          <div className="auth-form-heading">
            <div className="auth-form-icon">
              {accountType === 'staff' ? <LockKeyhole size={18} /> : <UserRoundPlus size={18} />}
            </div>
            <div>
              <div className="auth-form-title">
                {accountType === 'staff' ? 'Login' : customerMode === 'signin' ? 'Customer Sign In' : 'Customer Sign Up'}
              </div>
              <div className="auth-form-subtitle">
                {accountType === 'staff' ? 'Internal access only' : 'Order portal access'}
              </div>
            </div>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
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
                <div className="auth-input-wrap">
                  <UserRoundPlus size={16} />
                  <input className="form-input" placeholder="Full name" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
                </div>
              </div>
            ) : null}

            <div className="form-group">
              <label className="form-label">Email</label>
              <div className="auth-input-wrap">
                <Mail size={16} />
                <input className="form-input" type="email" placeholder="Email address" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div className="auth-input-wrap">
                <LockKeyhole size={16} />
                <input className="form-input" type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              </div>
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

            <div className="auth-card-footer">
              {accountType === 'customer' ? (
                <>
                  <ShoppingCart size={15} />
                  <span>Customer accounts need staff approval before ordering.</span>
                </>
              ) : (
                <>
                  <LockKeyhole size={15} />
                  <span>Staff accounts are managed by Modhani admins.</span>
                </>
              )}
            </div>
          </form>

          {state.authError ? (
            <div className="auth-config-note">
              {state.authError}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
