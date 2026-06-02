import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { clearClientUser, getCachedClientUser, persistClientUser } from '../lib/auth-client';

export default function Home() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState('checking');
  const [showSignup, setShowSignup] = useState(false);
  const [signupUsername, setSignupUsername] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const cached = getCachedClientUser();

    if (cached) {
      router.replace('/dashboard');
    }

    (async () => {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        const data = await response.json();
        if (!active) return;
        if (response.ok && data.user) {
          persistClientUser(data.user);
          router.replace('/dashboard');
          return;
        }
      } catch (_) {
        // Ignore bootstrap session failures.
      }

      if (active) {
        clearClientUser();
        setSessionState('login');
      }
    })();

    return () => {
      active = false;
    };
  }, [router]);

  const toggleSignup = (enabled) => {
    setShowSignup(enabled);
    setError('');
  };

  const completeLogin = (user) => {
    persistClientUser(user);
    router.push('/dashboard');
  };

  const handleSignup = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: signupUsername,
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

  const handlePasswordLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        cache: 'no-store',
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

  if (sessionState === 'checking') {
    return (
      <div style={styles.checkingPage}>
        <div style={styles.checkingCard}>
          <div style={styles.checkingSpinner} aria-hidden="true" />
          <p style={styles.checkingText}>Signing you in…</p>
        </div>
        <style>{`
          @keyframes loginSpin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes cloudDrift {
          0% { transform: translateX(0px); }
          100% { transform: translateX(18px); }
        }

        @keyframes orbFloat {
          0% { transform: translate3d(0px, 0px, 0px) scale(1); }
          50% { transform: translate3d(18px, -20px, 0px) scale(1.04); }
          100% { transform: translate3d(-10px, 14px, 0px) scale(0.98); }
        }

        @keyframes particleDrift {
          0% { transform: translateX(0px) translateY(0px); }
          100% { transform: translateX(-28px) translateY(18px); }
        }

        @keyframes lightSweep {
          0% { transform: translateX(-18%) skewX(-8deg); opacity: 0.12; }
          50% { opacity: 0.22; }
          100% { transform: translateX(22%) skewX(-8deg); opacity: 0.12; }
        }

        @keyframes mistPulse {
          0% { opacity: 0.18; }
          50% { opacity: 0.28; }
          100% { opacity: 0.18; }
        }

        @keyframes laneShift {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -40; }
        }

        @keyframes runnerStride {
          0% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-4px) rotate(-1.2deg); }
          100% { transform: translateY(0px) rotate(0deg); }
        }

        @keyframes speedSweep {
          0% { stroke-dashoffset: 0; opacity: 0.18; }
          100% { stroke-dashoffset: -120; opacity: 0.34; }
        }

        @media (max-width: 560px) {
          .login-page {
            padding: 10px !important;
          }
          .login-form {
            padding: 16px !important;
          }
          .login-form h1 { font-size: 22px !important; }
          .login-form p { font-size: 12px !important; line-height: 1.4 !important; }
          .login-form input,
          .login-form button {
            min-height: 42px !important;
            font-size: 14px !important;
            border-radius: 12px !important;
          }
          .login-form label {
            margin-top: 10px !important;
            margin-bottom: 5px !important;
            font-size: 11px !important;
          }
          .login-meta-chip {
            font-size: 10px !important;
            padding: 5px 10px !important;
          }
          .login-form-header {
            margin-bottom: 12px !important;
          }
          .login-form-divider {
            margin-top: 14px !important;
            gap: 8px !important;
          }
          .login-footer-note {
            margin-top: 14px !important;
            font-size: 11px !important;
            line-height: 1.5 !important;
          }
          .login-banner {
            margin-top: 14px !important;
            padding: 10px 12px !important;
            font-size: 13px !important;
          }
        }
        @media (max-width: 420px) {
          .login-page { padding: 8px !important; }
          .login-form {
            padding: 14px !important;
          }
          .login-form h1 { font-size: 19px !important; }
          .login-form p { font-size: 11px !important; }
          .login-form input,
          .login-form button {
            min-height: 40px !important;
            font-size: 13px !important;
          }
        }
      `}</style>

      <div style={styles.bgLayer} aria-hidden="true">
        <svg viewBox="0 0 1400 900" style={styles.bgSvg}>
          <defs>
            <linearGradient id="skyA" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e8f2ff" />
              <stop offset="100%" stopColor="#fdf5e8" />
            </linearGradient>
            <linearGradient id="mountFar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(137,167,211,0.42)" />
              <stop offset="100%" stopColor="rgba(116,144,191,0.42)" />
            </linearGradient>
            <linearGradient id="mountNear" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(92,122,170,0.46)" />
              <stop offset="100%" stopColor="rgba(74,99,138,0.48)" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width="1400" height="900" fill="url(#skyA)" />
          <circle cx="1080" cy="140" r="96" fill="rgba(255,185,118,0.28)" />

          <ellipse cx="320" cy="190" rx="170" ry="42" fill="rgba(255,255,255,0.42)" style={{ animation: 'cloudDrift 12s ease-in-out infinite alternate' }} />
          <ellipse cx="920" cy="230" rx="130" ry="34" fill="rgba(255,255,255,0.38)" style={{ animation: 'cloudDrift 10s ease-in-out infinite alternate' }} />

          <polygon points="0,640 160,470 310,560 460,430 640,560 830,410 1020,560 1200,460 1400,620 1400,900 0,900" fill="url(#mountFar)" />
          <polygon points="0,740 180,610 360,700 520,580 720,700 910,560 1110,700 1290,620 1400,700 1400,900 0,900" fill="url(#mountNear)" />

          <ellipse cx="700" cy="760" rx="760" ry="160" fill="rgba(255,255,255,0.14)" style={{ animation: 'mistPulse 8s ease-in-out infinite' }} />

          <path d="M120 780 C 430 690, 960 700, 1280 790" fill="none" stroke="rgba(255,255,255,0.36)" strokeWidth="3" strokeDasharray="10 12" style={{ animation: 'laneShift 5s linear infinite' }} />

          <path d="M120 540 L500 494" fill="none" stroke="rgba(59,130,246,0.24)" strokeWidth="4" strokeDasharray="20 24" style={{ animation: 'speedSweep 2s linear infinite' }} />
          <path d="M160 590 L560 536" fill="none" stroke="rgba(59,130,246,0.18)" strokeWidth="4" strokeDasharray="20 24" style={{ animation: 'speedSweep 2.2s linear infinite' }} />

          <g style={{ animation: 'runnerStride 1.7s ease-in-out infinite', transformOrigin: '980px 510px' }}>
            <circle cx="980" cy="410" r="26" fill="rgba(15,23,42,0.62)" />
            <path d="M980 438 L944 520 L1020 556 L1078 500" fill="none" stroke="rgba(15,23,42,0.62)" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M944 520 L872 606" fill="none" stroke="rgba(15,23,42,0.62)" strokeWidth="20" strokeLinecap="round" />
            <path d="M1020 556 L1110 650" fill="none" stroke="rgba(15,23,42,0.62)" strokeWidth="20" strokeLinecap="round" />
            <path d="M974 474 L904 448" fill="none" stroke="rgba(15,23,42,0.62)" strokeWidth="16" strokeLinecap="round" />
            <path d="M1028 476 L1104 450" fill="none" stroke="rgba(15,23,42,0.62)" strokeWidth="16" strokeLinecap="round" />
          </g>
        </svg>
      </div>
      <div style={styles.liveGlowA} aria-hidden="true" />
      <div style={styles.liveGlowB} aria-hidden="true" />
      <div style={styles.liveParticles} aria-hidden="true" />
      <div style={styles.liveSweep} aria-hidden="true" />

      <div style={styles.shell} className="login-page login-shell">
        <section style={styles.formPanel} className="login-form">
          <div style={styles.formHeader} className="login-form-header">
            <h1 style={styles.formTitle}>{showSignup ? 'Create your account' : 'Login'}</h1>
          </div>

          {showSignup ? (
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

              <p style={styles.switchText}>
                Already have an account?{' '}
                <button type="button" style={styles.switchButton} onClick={() => toggleSignup(false)}>
                  Login
                </button>
              </p>
            </form>
          ) : (
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
                  {loading ? 'Logging in...' : 'Login'}
                </button>

                <p style={styles.switchText}>
                  Don't have an account?{' '}
                  <button type="button" style={styles.switchButton} onClick={() => toggleSignup(true)}>
                    Signup
                  </button>
                </p>
              </form>
            </div>
          )}

          {error ? <div style={styles.errorBanner} className="login-banner">{error}</div> : null}
        </section>
      </div>
    </div>
  );
}

const styles = {
  checkingPage: {
    minHeight: '100dvh',
    display: 'grid',
    placeItems: 'center',
    background: 'linear-gradient(165deg, #f2f6ff 0%, #f8fbff 50%, #fff5eb 100%)',
    fontFamily: "'Segoe UI', 'Trebuchet MS', Tahoma, sans-serif",
  },
  checkingCard: {
    display: 'grid',
    gap: '12px',
    justifyItems: 'center',
    padding: '24px',
    borderRadius: '16px',
    background: '#fff',
    border: '1px solid rgba(133,152,185,0.22)',
    boxShadow: '0 20px 48px rgba(26,39,67,0.10)',
  },
  checkingSpinner: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    border: '3px solid rgba(47,99,200,0.18)',
    borderTopColor: '#2f63c8',
    animation: 'loginSpin 0.8s linear infinite',
  },
  checkingText: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 700,
    color: '#425574',
  },
  page: {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    background: 'linear-gradient(165deg, #f2f6ff 0%, #f8fbff 50%, #fff5eb 100%)',
    fontFamily: "'Segoe UI', 'Trebuchet MS', Tahoma, sans-serif",
    position: 'relative',
    overflow: 'hidden',
  },
  bgLayer: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    opacity: 0.38,
  },
  bgSvg: {
    width: '100%',
    height: '100%',
    display: 'block',
  },
  liveGlowA: {
    position: 'absolute',
    width: '44vw',
    minWidth: '260px',
    maxWidth: '520px',
    aspectRatio: '1 / 1',
    borderRadius: '999px',
    left: '-10vw',
    top: '8vh',
    background: 'radial-gradient(circle, rgba(114,154,232,0.26) 0%, rgba(114,154,232,0.1) 44%, rgba(114,154,232,0) 72%)',
    filter: 'blur(2px)',
    animation: 'orbFloat 14s ease-in-out infinite',
    pointerEvents: 'none',
    zIndex: 1,
  },
  liveGlowB: {
    position: 'absolute',
    width: '38vw',
    minWidth: '240px',
    maxWidth: '470px',
    aspectRatio: '1 / 1',
    borderRadius: '999px',
    right: '-8vw',
    bottom: '6vh',
    background: 'radial-gradient(circle, rgba(255,168,124,0.24) 0%, rgba(255,168,124,0.08) 46%, rgba(255,168,124,0) 72%)',
    filter: 'blur(2px)',
    animation: 'orbFloat 16s ease-in-out infinite reverse',
    pointerEvents: 'none',
    zIndex: 1,
  },
  liveParticles: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 1.2px, transparent 1.2px), radial-gradient(rgba(127,158,206,0.24) 1px, transparent 1px)',
    backgroundSize: '34px 34px, 42px 42px',
    backgroundPosition: '0 0, 12px 8px',
    opacity: 0.28,
    animation: 'particleDrift 20s linear infinite alternate',
    pointerEvents: 'none',
    zIndex: 1,
  },
  liveSweep: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(96deg, rgba(255,255,255,0) 18%, rgba(255,255,255,0.34) 48%, rgba(255,255,255,0) 80%)',
    mixBlendMode: 'screen',
    animation: 'lightSweep 9s ease-in-out infinite',
    pointerEvents: 'none',
    zIndex: 1,
  },
  shell: {
    width: '100%',
    maxWidth: '420px',
    margin: '0 auto',
    position: 'relative',
    zIndex: 2,
    display: 'block',
    minHeight: 'auto',
    borderRadius: '16px',
    overflow: 'hidden',
    border: '1px solid rgba(133,152,185,0.22)',
    boxShadow: '0 20px 48px rgba(26,39,67,0.10)',
    background: '#fff',
  },
  formPanel: {
    padding: '18px',
    borderRadius: '16px',
    background: '#ffffff',
    border: 'none',
    boxShadow: 'none',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
  },
  formHeader: {
    marginBottom: '14px',
  },
  formTitle: {
    margin: 0,
    fontSize: '24px',
    color: '#18273f',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    marginTop: '12px',
    color: '#374151',
    fontSize: '12px',
    fontWeight: '700',
  },
  input: {
    width: '100%',
    minHeight: '46px',
    borderRadius: '12px',
    border: '1px solid rgba(132,156,194,0.34)',
    background: 'rgba(255,255,255,0.96)',
    padding: '11px 13px',
    fontSize: '14px',
    color: '#111827',
    outline: 'none',
    boxSizing: 'border-box',
  },
  primaryButton: {
    width: '100%',
    minHeight: '46px',
    marginTop: '16px',
    borderRadius: '12px',
    border: 'none',
    background: 'linear-gradient(135deg, #4477dc, #2f63c8)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '800',
    cursor: 'pointer',
  },
  switchText: {
    marginTop: '14px',
    marginBottom: 0,
    fontSize: '13px',
    color: '#425574',
    textAlign: 'center',
  },
  switchButton: {
    border: 'none',
    background: 'transparent',
    color: '#2f63c8',
    fontWeight: '800',
    cursor: 'pointer',
    padding: 0,
  },
  errorBanner: {
    marginTop: '16px',
    padding: '10px 12px',
    borderRadius: '12px',
    background: '#fff1f2',
    border: '1px solid #fecdd3',
    color: '#be123c',
    fontSize: '13px',
    fontWeight: '600',
  },
};
