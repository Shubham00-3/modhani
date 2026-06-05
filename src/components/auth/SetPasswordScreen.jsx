import { useState } from 'react';
import { ArrowRight, CheckCircle2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

export default function SetPasswordScreen({ authRole, onComplete }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    const { data: userResult, error: userError } = await supabase.auth.getUser();
    const user = userResult?.user;
    const accountType = user?.user_metadata?.account_type;
    const isValidSetupSession =
      ['customer', 'staff', 'driver'].includes(accountType)
      || ['customer', 'staff', 'driver'].includes(authRole);

    if (userError || !user || !isValidSetupSession) {
      await supabase.auth.signOut();
      setError('Password setup is only available from an account setup email link. Open that email and try again.');
      setSubmitting(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    });

    if (updateError) {
      setError(updateError.message);
      setSubmitting(false);
      return;
    }

    setSuccess(true);

    // Clear the hash from the URL so a refresh doesn't re-trigger.
    window.history.replaceState(null, '', window.location.pathname);

    // Give the user a moment to see the success message, then proceed.
    setTimeout(() => {
      onComplete();
    }, 1500);
  }

  return (
    <div className="auth-screen">
      <div className="auth-shell auth-portal-shell">
        <section className="auth-market-panel">
          <div className="auth-market-copy">
            <div className="auth-kicker">Almost There</div>
            <h1 className="auth-title">
              Set Your <span>Password</span>
            </h1>
            <p>
              Create a secure password to access your Modhani account.
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
          <div className="auth-card-title">SET PASSWORD</div>

          <div className="auth-form-heading">
            <div className="auth-form-icon">
              <ShieldCheck size={18} />
            </div>
            <div>
              <div className="auth-form-title">Create Your Password</div>
              <div className="auth-form-subtitle">
                You'll use this password to sign in to Modhani
              </div>
            </div>
          </div>

          {success ? (
            <div className="auth-form" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', alignItems: 'center', textAlign: 'center', padding: 'var(--space-6) 0' }}>
              <CheckCircle2 size={48} style={{ color: 'var(--color-success)' }} />
              <div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)' }}>
                Password Set Successfully!
              </div>
              <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                Redirecting you to the portal...
              </div>
            </div>
          ) : (
            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <div className="auth-input-wrap">
                  <LockKeyhole size={16} />
                  <input
                    className="form-input"
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoFocus
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <div className="auth-input-wrap">
                  <LockKeyhole size={16} />
                  <input
                    className="form-input"
                    type="password"
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
              </div>

              {error ? (
                <div className="alert alert-warning">
                  <div className="alert-content">
                    <div className="alert-title">Password error</div>
                    <div className="alert-description">{error}</div>
                  </div>
                </div>
              ) : null}

              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting ? 'Setting Password...' : 'Set Password & Continue'}
                {!submitting ? <ArrowRight size={16} /> : null}
              </button>

              <div className="auth-card-footer">
                <ShieldCheck size={15} />
                <span>Your password is encrypted and stored securely by Supabase.</span>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
