import { useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, LockKeyhole, Mail, ShoppingCart, Truck } from 'lucide-react';
import { useApp } from '../../context/useApp';
import { supabase } from '../../lib/supabaseClient';

export default function AuthScreen() {
  const { state, login } = useApp();
  const [accountType, setAccountType] = useState('staff');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('login'); // 'login' | 'forgot'
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    const result = await login({ email, password });

    if (!result.ok) {
      setError(result.error ?? 'Unable to sign in.');
    }

    setSubmitting(false);
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    if (!supabase) {
      setError(state.authError ?? 'Supabase environment variables are not configured.');
      setSubmitting(false);
      return;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}`,
    });

    if (resetError) {
      setError(resetError.message);
    } else {
      setResetSent(true);
    }

    setSubmitting(false);
  }

  function switchToForgot() {
    setMode('forgot');
    setError('');
    setResetSent(false);
  }

  function switchToLogin() {
    setMode('login');
    setError('');
    setResetSent(false);
  }

  return (
    <div className="auth-screen">
      <div className="auth-shell auth-portal-shell">
        <section className="auth-market-panel">
          <div className="auth-market-copy">
            <div className="auth-kicker">Welcome</div>
            <h1 className="auth-title">
              Wholesome Dairy &amp; Jams, Delivered <span>Fresh.</span>
            </h1>
            <p>
              Access Modhani portals for staff operations, delivery proof, and customer order placement.
            </p>
          </div>

          <div className="auth-product-stage" aria-hidden="true">
            <div className="auth-product-card auth-product-ghee">
              <div className="auth-product-card-visual">
                <img className="auth-product" src="/product-images/desi-ghee-800gms.jpg" alt="" />
              </div>
            </div>
            <div className="auth-product-card auth-product-yogurt">
              <div className="auth-product-card-visual">
                <img className="auth-product" src="/product-images/balkan-yogurt-750g-6.jpg" alt="" />
              </div>
            </div>
            <div className="auth-product-card auth-product-milk">
              <div className="auth-product-card-visual">
                <img className="auth-product" src="/product-images/a2-milk-4l-2.jpg" alt="" />
              </div>
            </div>
            <div className="auth-product-card auth-product-lassi">
              <div className="auth-product-card-visual">
                <img className="auth-product" src="/product-images/3-mango-lassi-350ml.jpg" alt="" />
              </div>
            </div>
            <div className="auth-product-card auth-product-jam">
              <div className="auth-product-card-visual">
                <img className="auth-product" src="/product-images/clarite-strawberry-fruit-jam-500g.jpg" alt="" />
              </div>
            </div>
          </div>
        </section>

        <section className="auth-form-card auth-portal-card">
          <img className="auth-card-logo" src="/modhani-logo.png" alt="Modhani" />
          <div className="auth-card-title">{mode === 'login' ? 'LOGIN' : 'RESET PASSWORD'}</div>

          {mode === 'login' ? (
            <div className="auth-choice-tabs">
              <button
                className={`auth-choice-tab ${accountType === 'staff' ? 'active' : ''}`}
                type="button"
                onClick={() => {
                  setAccountType('staff');
                  setError('');
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
                }}
              >
                <Building2 size={16} /> Customer Portal
              </button>
              <button
                className={`auth-choice-tab ${accountType === 'driver' ? 'active' : ''}`}
                type="button"
                onClick={() => {
                  setAccountType('driver');
                  setError('');
                }}
              >
                <Truck size={16} /> Driver Portal
              </button>
            </div>
          ) : null}

          {mode === 'login' ? (
            <>
              <div className="auth-form-heading">
                <div className="auth-form-icon">
                  <LockKeyhole size={18} />
                </div>
                <div>
                  <div className="auth-form-title">
                    {accountType === 'staff'
                      ? 'Staff Login'
                      : accountType === 'driver'
                        ? 'Driver Sign In'
                        : 'Customer Sign In'}
                  </div>
                  <div className="auth-form-subtitle">
                    {accountType === 'staff'
                      ? 'Internal access only'
                      : accountType === 'driver'
                        ? 'Delivery and POD access'
                        : 'Order portal access'}
                  </div>
                </div>
              </div>

              <form className="auth-form" onSubmit={handleSubmit}>
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

                <button className="btn btn-primary" type="submit" disabled={submitting}>
                  {submitting ? 'Signing In...' : 'Sign In'}
                  {!submitting ? <ArrowRight size={16} /> : null}
                </button>

                <button className="auth-forgot-link" type="button" onClick={switchToForgot}>
                  Forgot your password?
                </button>

                <div className="auth-card-footer">
                  {accountType === 'customer' ? (
                    <>
                      <ShoppingCart size={15} />
                      <span>Customer accounts are created by Modhani admins.</span>
                    </>
                  ) : accountType === 'driver' ? (
                    <>
                      <Truck size={15} />
                      <span>Driver accounts are managed by Modhani admins.</span>
                    </>
                  ) : (
                    <>
                      <LockKeyhole size={15} />
                      <span>Staff accounts are managed by Modhani admins.</span>
                    </>
                  )}
                </div>
              </form>
            </>
          ) : (
            <>
              <div className="auth-form-heading">
                <div className="auth-form-icon">
                  <Mail size={18} />
                </div>
                <div>
                  <div className="auth-form-title">Reset Password</div>
                  <div className="auth-form-subtitle">
                    We'll send a password reset link to your email
                  </div>
                </div>
              </div>

              {resetSent ? (
                <div className="auth-form" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  <div className="alert alert-success">
                    <div className="alert-content">
                      <div className="alert-title">Reset link sent!</div>
                      <div className="alert-description">
                        We've sent a password reset link to <strong>{email}</strong>. Check your inbox and click the link to set a new password.
                      </div>
                    </div>
                  </div>
                  <button className="btn btn-ghost" type="button" onClick={switchToLogin}>
                    <ArrowLeft size={16} /> Back to Sign In
                  </button>
                </div>
              ) : (
                <form className="auth-form" onSubmit={handleForgotPassword}>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <div className="auth-input-wrap">
                      <Mail size={16} />
                      <input
                        className="form-input"
                        type="email"
                        placeholder="Enter your email address"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  {error ? (
                    <div className="alert alert-warning">
                      <div className="alert-content">
                        <div className="alert-title">Reset failed</div>
                        <div className="alert-description">{error}</div>
                      </div>
                    </div>
                  ) : null}

                  <button className="btn btn-primary" type="submit" disabled={submitting}>
                    {submitting ? 'Sending...' : 'Send Reset Link'}
                    {!submitting ? <ArrowRight size={16} /> : null}
                  </button>

                  <button className="auth-forgot-link" type="button" onClick={switchToLogin}>
                    <ArrowLeft size={14} /> Back to Sign In
                  </button>
                </form>
              )}
            </>
          )}

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
