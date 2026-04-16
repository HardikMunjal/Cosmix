import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';

function createUserSession(payload) {
  const username = payload.username?.trim() || payload.email?.split('@')[0] || `User ${String(payload.mobile || '').slice(-4)}`;
  return {
    username,
    mobile: payload.mobile || '',
    email: payload.email || '',
    authMethod: payload.authMethod,
    quote: payload.quote || 'Building better decisions, one signal at a time.',
    avatar: payload.avatar || '',
  };
}

export default function Home() {
  const router = useRouter();
  const [loginMode, setLoginMode] = useState('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [gmailName, setGmailName] = useState('');
  const [gmailAddress, setGmailAddress] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      router.push('/dashboard');
    }
  }, [router]);

  const loginCardTitle = useMemo(() => (
    loginMode === 'mobile' ? 'Sign in with mobile number' : 'Sign in with Gmail'
  ), [loginMode]);

  const persistUser = (payload) => {
    localStorage.setItem('user', JSON.stringify(createUserSession(payload)));
    router.push('/dashboard');
  };

  const handleSendOtp = (event) => {
    event.preventDefault();
    const normalizedMobile = mobile.replace(/\D/g, '');
    if (normalizedMobile.length !== 10) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }

    const nextOtp = String(Math.floor(100000 + (Math.random() * 900000)));
    setGeneratedOtp(nextOtp);
    setOtpSent(true);
    setOtp('');
    setError('');
    setInfo(`OTP sent to +91 ${normalizedMobile}. Demo OTP: ${nextOtp}`);
  };

  const handleVerifyOtp = (event) => {
    event.preventDefault();
    const normalizedMobile = mobile.replace(/\D/g, '');
    if (!otpSent || !generatedOtp) {
      setError('Send the OTP first.');
      return;
    }
    if (otp.trim() !== generatedOtp) {
      setError('Invalid OTP. Please try again.');
      return;
    }

    persistUser({
      username: `User ${normalizedMobile.slice(-4)}`,
      mobile: normalizedMobile,
      authMethod: 'mobile-otp',
    });
  };

  const handleGmailSignIn = (event) => {
    event.preventDefault();
    const normalizedEmail = gmailAddress.trim().toLowerCase();
    const normalizedName = gmailName.trim();

    if (!normalizedName) {
      setError('Enter your name to continue with Gmail.');
      return;
    }
    if (!/^[^\s@]+@gmail\.com$/i.test(normalizedEmail)) {
      setError('Enter a valid Gmail address.');
      return;
    }

    setError('');
    setInfo('');
    persistUser({
      username: normalizedName,
      email: normalizedEmail,
      authMethod: 'gmail',
    });
  };

  const resetMode = (mode) => {
    setLoginMode(mode);
    setError('');
    setInfo('');
  };

  useEffect(() => {
    if (!otpSent || loginMode !== 'mobile' || typeof window === 'undefined') return undefined;
    if (!('OTPCredential' in window) || !navigator.credentials?.get) return undefined;

    const controller = new AbortController();

    navigator.credentials.get({
      otp: { transport: ['sms'] },
      signal: controller.signal,
    }).then((otpCredential) => {
      const code = String(otpCredential?.code || '').replace(/\D/g, '').slice(0, 6);
      if (!code) return;
      setOtp(code);
      setError('');
      setInfo('OTP picked automatically from your SMS inbox.');
    }).catch(() => {
      // Web OTP is best-effort only.
    });

    return () => controller.abort();
  }, [otpSent, loginMode]);

  return (
    <div style={styles.page}>
      <style>{`
        @media (max-width: 860px) {
          .login-shell { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 560px) {
          .login-page { padding: 14px !important; }
          .login-panel { padding: 22px !important; }
          .login-tab-row { grid-template-columns: 1fr !important; }
          .login-action-row { flex-direction: column !important; }
        }
      `}</style>

      <div style={styles.shell} className="login-shell login-page">
        <section style={styles.heroPanel} className="login-panel">
          <div style={styles.eyebrow}>Sunlit workspace</div>
          <h1 style={styles.heroTitle}>Cosmix access, tuned for mobile and trading flow.</h1>
          <p style={styles.heroText}>
            Use your mobile number with OTP or continue with Gmail. Your profile, theme, and workspace preferences will follow you after sign-in.
          </p>

          <div style={styles.heroHighlights}>
            <div style={styles.highlightCard}>
              <div style={styles.highlightLabel}>Fast access</div>
              <div style={styles.highlightValue}>Mobile OTP</div>
            </div>
            <div style={styles.highlightCard}>
              <div style={styles.highlightLabel}>Alternate sign-in</div>
              <div style={styles.highlightValue}>Gmail</div>
            </div>
            <div style={styles.highlightCard}>
              <div style={styles.highlightLabel}>Default look</div>
              <div style={styles.highlightValue}>Sunlit</div>
            </div>
          </div>
        </section>

        <section style={styles.formPanel} className="login-panel">
          <div style={styles.tabRow} className="login-tab-row">
            <button
              type="button"
              onClick={() => resetMode('mobile')}
              style={{ ...styles.tabButton, ...(loginMode === 'mobile' ? styles.activeTabButton : {}) }}
            >
              Mobile no. + OTP
            </button>
            <button
              type="button"
              onClick={() => resetMode('gmail')}
              style={{ ...styles.tabButton, ...(loginMode === 'gmail' ? styles.activeTabButton : {}) }}
            >
              Gmail
            </button>
          </div>

          <div style={styles.formHeader}>
            <h2 style={styles.formTitle}>{loginCardTitle}</h2>
            <p style={styles.formSubtitle}>
              {loginMode === 'mobile'
                ? 'Use your number to receive a one-time passcode.'
                : 'Use your Gmail identity for quick workspace access.'}
            </p>
          </div>

          {loginMode === 'mobile' ? (
            <form onSubmit={otpSent ? handleVerifyOtp : handleSendOtp}>
              <label style={styles.label} htmlFor="mobile-number">Mobile number</label>
              <input
                id="mobile-number"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="9876543210"
                value={mobile}
                onChange={(event) => {
                  setMobile(event.target.value.replace(/\D/g, '').slice(0, 10));
                  setError('');
                }}
                style={styles.input}
              />

              {otpSent ? (
                <>
                  <label style={styles.label} htmlFor="otp-code">Enter OTP</label>
                  <input
                    id="otp-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="6-digit OTP"
                    value={otp}
                    onChange={(event) => {
                      setOtp(event.target.value.replace(/\D/g, '').slice(0, 6));
                      setError('');
                    }}
                    style={styles.input}
                  />
                </>
              ) : null}

              <div style={styles.actionRow} className="login-action-row">
                <button type="submit" style={styles.primaryButton}>
                  {otpSent ? 'Verify OTP' : 'Send OTP'}
                </button>
                {otpSent ? (
                  <button type="button" onClick={handleSendOtp} style={styles.secondaryButton}>
                    Resend OTP
                  </button>
                ) : null}
              </div>

              {otpSent ? (
                <div style={styles.otpAssistText}>
                  On supported mobile browsers, the OTP will be auto-detected from SMS when it arrives.
                </div>
              ) : null}
            </form>
          ) : (
            <form onSubmit={handleGmailSignIn}>
              <label style={styles.label} htmlFor="gmail-name">Full name</label>
              <input
                id="gmail-name"
                type="text"
                placeholder="Your name"
                value={gmailName}
                onChange={(event) => {
                  setGmailName(event.target.value);
                  setError('');
                }}
                style={styles.input}
              />

              <label style={styles.label} htmlFor="gmail-address">Gmail address</label>
              <input
                id="gmail-address"
                type="email"
                placeholder="name@gmail.com"
                value={gmailAddress}
                onChange={(event) => {
                  setGmailAddress(event.target.value);
                  setError('');
                }}
                style={styles.input}
              />

              <button type="submit" style={styles.googleButton}>Continue with Gmail</button>
            </form>
          )}

          {error ? <div style={styles.errorBanner}>{error}</div> : null}
          {info ? <div style={styles.infoBanner}>{info}</div> : null}

          <div style={styles.helperText}>
            By continuing, you keep your profile photo, quote, and workspace preferences on this device.
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
    maxWidth: '1120px',
    display: 'grid',
    gridTemplateColumns: '1.1fr 0.9fr',
    gap: '18px',
  },
  heroPanel: {
    padding: '34px',
    borderRadius: '28px',
    background: 'linear-gradient(145deg, rgba(255,253,248,0.96), rgba(255,242,221,0.95))',
    border: '1px solid #f3d2b1',
    boxShadow: '0 24px 70px rgba(217, 119, 6, 0.12)',
  },
  formPanel: {
    padding: '30px',
    borderRadius: '28px',
    background: 'rgba(255,253,248,0.98)',
    border: '1px solid #f3d2b1',
    boxShadow: '0 24px 70px rgba(217, 119, 6, 0.12)',
  },
  eyebrow: {
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
  heroTitle: {
    margin: '18px 0 12px',
    fontSize: '40px',
    lineHeight: '1.08',
    color: '#111827',
  },
  heroText: {
    margin: 0,
    color: '#5b6472',
    fontSize: '15px',
    lineHeight: '1.8',
    maxWidth: '560px',
  },
  heroHighlights: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '12px',
    marginTop: '26px',
  },
  highlightCard: {
    padding: '16px',
    borderRadius: '18px',
    background: '#fff7ed',
    border: '1px solid #fdba74',
  },
  highlightLabel: {
    color: '#8b98ab',
    fontSize: '11px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    fontWeight: '700',
    marginBottom: '8px',
  },
  highlightValue: {
    color: '#1f2937',
    fontSize: '18px',
    fontWeight: '800',
  },
  tabRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
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
    fontSize: '14px',
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
    fontSize: '28px',
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
  actionRow: {
    display: 'flex',
    gap: '12px',
    marginTop: '22px',
  },
  primaryButton: {
    flex: 1,
    minHeight: '50px',
    borderRadius: '14px',
    border: 'none',
    background: 'linear-gradient(135deg, #f97316, #ea580c)',
    color: '#fff',
    fontSize: '15px',
    fontWeight: '800',
    cursor: 'pointer',
  },
  secondaryButton: {
    minHeight: '50px',
    borderRadius: '14px',
    border: '1px solid #fdba74',
    background: '#fff7ed',
    color: '#9a3412',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    padding: '0 16px',
  },
  googleButton: {
    width: '100%',
    minHeight: '52px',
    marginTop: '22px',
    borderRadius: '14px',
    border: '1px solid #f3d2b1',
    background: '#fff',
    color: '#111827',
    fontSize: '15px',
    fontWeight: '800',
    cursor: 'pointer',
    boxShadow: '0 14px 24px rgba(15, 23, 42, 0.05)',
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
  otpAssistText: {
    marginTop: '12px',
    color: '#7c5b3b',
    fontSize: '12px',
    lineHeight: '1.6',
  },
};
