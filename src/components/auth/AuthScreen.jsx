import { useState } from 'react';
import { LockKeyhole, ArrowRight } from 'lucide-react';
import { useApp } from '../../context/useApp';

export default function AuthScreen() {
  const { state, login } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
              Staff Sign In
            </h1>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '16px', maxWidth: '40ch' }}>
              Sign in with your internal staff account to access ModhaniOS.
            </p>
          </div>
        </section>

        <section className="card" style={{ padding: '32px' }}>
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
              <LockKeyhole size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '18px' }}>Login</div>
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>
                Internal staff access only
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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

            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Signing In...' : 'Sign In'}
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
