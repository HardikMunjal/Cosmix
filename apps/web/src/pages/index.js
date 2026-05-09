import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { clearClientUser, persistClientUser } from '../lib/auth-client';

const AUTH_MODES = {
  signup: 'signup',
  login: 'login',
};

export default function Home() {
  const router = useRouter();
  const [authMode, setAuthMode] = useState(AUTH_MODES.signup);
  const [signupUsername, setSignupUsername] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [gmailEmail, setGmailEmail] = useState('');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const response = await fetch('/api/auth/session');
        const data = await response.json();
        if (!active) return;
        if (response.ok && data.user) {
          persistClientUser(data.user);
          router.push('/dashboard');
          return;
        }
      } catch (_) {
        // Ignore bootstrap session failures.
      }

      if (active) {
        clearClientUser();
      }
    })();

    return () => {
      active = false;
    };
  }, [router]);

  const formTitle = useMemo(() => {
    if (authMode === AUTH_MODES.signup) return 'Create your account';
    return 'Login';
  }, [authMode]);

  const formSubtitle = useMemo(() => {
    if (authMode === AUTH_MODES.signup) return 'Username is required. Gmail is optional. Set a password now for future logins.';
    return 'Use your username and password, or log in with the Gmail already linked to your account.';
  }, [authMode]);

  const resetMessages = (mode) => {
    setAuthMode(mode);
    setError('');
    setInfo('');
  };

  const completeLogin = (user) => {
    persistClientUser(user);
    router.push('/dashboard');
  };

  const handleSignup = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: signupUsername,
          email: signupEmail,
          password: signupPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.user) {
        throw new Error(data.error || 'Unable to create account.');
      }
      completeLogin(data.user);
    } catch (signupError) {
      setError(signupError.message || 'Unable to create account.');
    } finally {
      setLoading(false);
    }
  };

  const handleGmailLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');

    try {
      const response = await fetch('/api/auth/gmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: gmailEmail }),
      });
      const data = await response.json();
      if (!response.ok || !data.user) {
        throw new Error(data.error || 'Unable to log in with Gmail.');
      }
      completeLogin(data.user);
    } catch (loginError) {
      setError(loginError.message || 'Unable to log in with Gmail.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: loginIdentifier,
          password: loginPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.user) {
        throw new Error(data.error || 'Unable to log in.');
      }
      completeLogin(data.user);
    } catch (loginError) {
      setError(loginError.message || 'Unable to log in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <style>{`
        @media (max-width: 560px) {
          .login-page { padding: 14px !important; }
          .login-panel { padding: 22px !important; }
          .login-tab-row { grid-template-columns: 1fr !important; }
          .login-panel h1 { font-size: 24px !important; }
          .login-panel p { font-size: 13px !important; line-height: 1.45 !important; }
          .login-panel input,
          .login-panel button {
            min-height: 44px !important;
            font-size: 14px !important;
            border-radius: 12px !important;
          }
          .login-panel label {
            margin-top: 12px !important;
            margin-bottom: 6px !important;
            font-size: 12px !important;
          }
        }
        @media (max-width: 420px) {
          .login-page { padding: 10px !important; }
          .login-panel { padding: 16px !important; border-radius: 18px !important; }
          .login-panel h1 { font-size: 20px !important; }
        }
      `}</style>

      <div style={styles.shell} className="login-page">
        <section style={styles.formPanel} className="login-panel">
          <div style={styles.topMeta}>Free signup and login</div>

          <div style={styles.tabRow} className="login-tab-row">
            <button
              type="button"
              onClick={() => resetMessages(AUTH_MODES.signup)}
              style={{ ...styles.tabButton, ...(authMode === AUTH_MODES.signup ? styles.activeTabButton : {}) }}
            >
              Sign up
            </button>
            <button
              type="button"
              onClick={() => resetMessages(AUTH_MODES.login)}
              style={{ ...styles.tabButton, ...(authMode === AUTH_MODES.login ? styles.activeTabButton : {}) }}
            >
              Login
            </button>
          </div>

          <div style={styles.formHeader}>
            <h1 style={styles.formTitle}>{formTitle}</h1>
            <p style={styles.formSubtitle}>{formSubtitle}</p>
          </div>

          {authMode === AUTH_MODES.signup ? (
            <form onSubmit={handleSignup}>
              <label style={styles.label} htmlFor="signup-username">Username</label>
              <input
                id="signup-username"
                type="text"
                placeholder="Choose a unique username"
                value={signupUsername}
                onChange={(event) => {
                  setSignupUsername(event.target.value);
                  setError('');
                }}
                style={styles.input}
              />

              <label style={styles.label} htmlFor="signup-email">Gmail address (optional)</label>
              <input
                id="signup-email"
                type="email"
                placeholder="name@gmail.com"
                value={signupEmail}
                onChange={(event) => {
                  setSignupEmail(event.target.value);
                  setError('');
                }}
                style={styles.input}
              />

              <label style={styles.label} htmlFor="signup-password">Password</label>
              <input
                id="signup-password"
                type="password"
                placeholder="Set your password"
                value={signupPassword}
                onChange={(event) => {
                  setSignupPassword(event.target.value);
                  setError('');
                }}
                style={styles.input}
              />

              <button type="submit" style={styles.primaryButton} disabled={loading}>
                {loading ? 'Creating account...' : 'Create account'}
              </button>
            </form>
          ) : null}

          {authMode === AUTH_MODES.login ? (
            <div>
              <form onSubmit={handlePasswordLogin}>
                <label style={styles.label} htmlFor="login-identifier">Username or Gmail</label>
                <input
                  id="login-identifier"
                  type="text"
                  placeholder="Enter your username or Gmail"
                  value={loginIdentifier}
                  onChange={(event) => {
                    setLoginIdentifier(event.target.value);
                    setError('');
                  }}
                  style={styles.input}
                />

                <label style={styles.label} htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  type="password"
                  placeholder="Enter your password"
                  value={loginPassword}
                  onChange={(event) => {
                    setLoginPassword(event.target.value);
                    setError('');
                  }}
                  style={styles.input}
                />

                <button type="submit" style={styles.primaryButton} disabled={loading}>
                  {loading ? 'Logging in...' : 'Login with password'}
                </button>
              </form>

              <div style={styles.dividerRow}>
                <span style={styles.dividerLine} />
                <span style={styles.dividerText}>or</span>
                <span style={styles.dividerLine} />
              </div>

              <form onSubmit={handleGmailLogin}>
                <label style={styles.label} htmlFor="gmail-email">Linked Gmail address</label>
              <input
                id="gmail-email"
                type="email"
                placeholder="name@gmail.com"
                value={gmailEmail}
                onChange={(event) => {
                  setGmailEmail(event.target.value);
                  setError('');
                }}
                style={styles.input}
              />

              <button type="submit" style={styles.googleButton} disabled={loading}>
                {loading ? 'Logging in...' : 'Login with Gmail'}
              </button>
              </form>
            </div>
          ) : null}

          {error ? <div style={styles.errorBanner}>{error}</div> : null}
          {info ? <div style={styles.infoBanner}>{info}</div> : null}

          <div style={styles.helperText}>
            Sessions stay active for 30 days and extend automatically while you keep using the app.
          </div>
        </section>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: 'radial-gradient(circle at top left, #ffe0b8, transparent 28%), linear-gradient(180deg, #fff8ef, #fff1e6)',
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  },
  shell: {
    width: '100%',
    maxWidth: '560px',
    margin: '0 auto',
  },
  formPanel: {
    padding: '30px',
    borderRadius: '28px',
    background: 'rgba(255,253,248,0.98)',
    border: '1px solid #f3d2b1',
    boxShadow: '0 24px 70px rgba(217, 119, 6, 0.12)',
  },
  topMeta: {
    display: 'inline-flex',
    padding: '6px 12px',
    borderRadius: '999px',
    background: '#fff1e6',
    border: '1px solid #fdba74',
    color: '#9a3412',
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  tabRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '10px',
    marginTop: '20px',
    marginBottom: '24px',
  },
  tabButton: {
    minHeight: '48px',
    borderRadius: '14px',
    border: '1px solid #f3d2b1',
    background: '#fff7ed',
    color: '#7c5b3b',
    cursor: 'pointer',
    fontWeight: '700',
    fontSize: '13px',
    padding: '0 12px',
  },
  activeTabButton: {
    background: '#f97316',
    color: '#fff',
    borderColor: '#f97316',
    boxShadow: '0 16px 30px rgba(249, 115, 22, 0.18)',
  },
  formHeader: {
    marginBottom: '18px',
  },
  formTitle: {
    margin: 0,
    fontSize: '30px',
    color: '#111827',
  },
  formSubtitle: {
    margin: '8px 0 0',
    color: '#5b6472',
    fontSize: '14px',
    lineHeight: '1.6',
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    marginTop: '16px',
    color: '#374151',
    fontSize: '13px',
    fontWeight: '700',
  },
  input: {
    width: '100%',
    minHeight: '50px',
    borderRadius: '14px',
    border: '1px solid #fdba74',
    background: '#fffdf8',
    padding: '12px 14px',
    fontSize: '15px',
    color: '#111827',
    outline: 'none',
    boxSizing: 'border-box',
  },
  primaryButton: {
    width: '100%',
    minHeight: '50px',
    marginTop: '22px',
    borderRadius: '14px',
    border: 'none',
    background: 'linear-gradient(135deg, #f97316, #ea580c)',
    color: '#fff',
    fontSize: '15px',
    fontWeight: '800',
    cursor: 'pointer',
  },
  googleButton: {
    width: '100%',
    minHeight: '52px',
    marginTop: '18px',
    borderRadius: '14px',
    border: '1px solid #f3d2b1',
    background: '#fff',
    color: '#111827',
    fontSize: '15px',
    fontWeight: '800',
    cursor: 'pointer',
    boxShadow: '0 14px 24px rgba(15, 23, 42, 0.05)',
  },
  dividerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginTop: '20px',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: '#f3d2b1',
  },
  dividerText: {
    color: '#8b98ab',
    fontSize: '12px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  errorBanner: {
    marginTop: '18px',
    padding: '12px 14px',
    borderRadius: '14px',
    background: '#fff1f2',
    border: '1px solid #fecdd3',
    color: '#be123c',
    fontSize: '14px',
    fontWeight: '600',
  },
  infoBanner: {
    marginTop: '18px',
    padding: '12px 14px',
    borderRadius: '14px',
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    color: '#1d4ed8',
    fontSize: '14px',
    fontWeight: '600',
  },
  helperText: {
    marginTop: '18px',
    color: '#8b98ab',
    fontSize: '12px',
    lineHeight: '1.7',
  },
};
