import { useEffect, useState } from 'react';
import {
  bindInstallPrompt,
  canShowInstallPrompt,
  dismissInstallPrompt,
  getManualInstallHint,
  hasNativeInstallPrompt,
  isIosDevice,
  isStandaloneApp,
  promptInstallApp,
} from './pwa';

function markStandaloneIfNeeded() {
  if (typeof window === 'undefined' || !isStandaloneApp()) return;
  try {
    localStorage.setItem('cosmix-pwa-was-installed', '1');
    localStorage.removeItem('cosmix-pwa-install-dismissed-at');
  } catch (_) { /* ignore */ }
}

export function InstallAppPrompt() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState('chromium');
  const [installing, setInstalling] = useState(false);
  const [hint, setHint] = useState('');

  useEffect(() => {
    markStandaloneIfNeeded();
    if (!canShowInstallPrompt() || isStandaloneApp()) return undefined;

    return bindInstallPrompt((event) => {
      if (event.type === 'installed') {
        setVisible(false);
        return;
      }
      if (event.type === 'ready') {
        setPlatform(event.platform || 'chromium');
        setVisible(true);
      }
    });
  }, []);

  if (!visible) return null;

  const isIos = platform === 'ios' || isIosDevice();
  const needsManual = platform === 'manual' || (!isIos && !hasNativeInstallPrompt());

  async function handleInstall() {
    if (isIos) return;
    setInstalling(true);
    try {
      const result = await promptInstallApp();
      if (!result.ok) {
        setHint(getManualInstallHint());
      }
    } finally {
      setInstalling(false);
    }
  }

  function handleDismiss() {
    dismissInstallPrompt();
    setVisible(false);
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: '12px',
        right: '12px',
        bottom: 'calc(78px + env(safe-area-inset-bottom, 0px))',
        zIndex: 950,
        maxWidth: '520px',
        margin: '0 auto',
        padding: '14px 16px',
        borderRadius: '18px',
        border: '1px solid rgba(148,163,184,0.28)',
        background: 'linear-gradient(135deg, rgba(15,23,42,0.97), rgba(30,41,59,0.96))',
        boxShadow: '0 18px 40px rgba(0,0,0,0.35)',
        color: '#e2e8f0',
        fontFamily: 'system-ui, sans-serif',
      }}
      role="region"
      aria-label="Install Cosmix app"
    >
      <div style={{ display: 'grid', gap: '8px' }}>
        <div style={{ fontSize: '14px', fontWeight: 800, color: '#f8fafc' }}>Install Cosmix</div>
        <div style={{ fontSize: '12px', lineHeight: 1.45, color: '#94a3b8' }}>
          {isIos
            ? 'Add Cosmix to your home screen: tap Share, then “Add to Home Screen”. Opens full-screen like a native app.'
            : needsManual
              ? `Install Cosmix again from this browser. ${getManualInstallHint()}`
              : 'Install Cosmix on your device for quick access, full-screen mode, and push reminders — same features as the website.'}
        </div>
        {hint ? (
          <div style={{ fontSize: '12px', color: '#7dd3fc', lineHeight: 1.4 }}>{hint}</div>
        ) : null}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
          {!isIos ? (
            <button
              type="button"
              onClick={handleInstall}
              disabled={installing}
              style={{
                border: 'none',
                borderRadius: '12px',
                padding: '10px 14px',
                background: 'linear-gradient(135deg, #22c55e, #06b6d4)',
                color: '#0f172a',
                fontWeight: 800,
                fontSize: '12px',
                cursor: installing ? 'wait' : 'pointer',
              }}
            >
              {installing ? 'Installing…' : 'Download app'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleDismiss}
            style={{
              border: '1px solid rgba(148,163,184,0.3)',
              borderRadius: '12px',
              padding: '10px 14px',
              background: 'transparent',
              color: '#cbd5e1',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

/** Always-available download control after login when Cosmix is not installed. */
export function InstallAppHeaderButton() {
  const [show, setShow] = useState(false);
  const [hint, setHint] = useState('');
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    markStandaloneIfNeeded();
    setShow(!isStandaloneApp());
  }, []);

  if (!show) return null;

  async function handleClick() {
    setInstalling(true);
    try {
      const result = await promptInstallApp();
      if (result.ok) {
        setShow(false);
        setHint('');
        return;
      }
      setHint(getManualInstallHint());
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={installing}
        style={{
          appearance: 'none',
          border: '1px solid rgba(34,197,94,0.4)',
          background: 'rgba(34,197,94,0.14)',
          color: '#bbf7d0',
          borderRadius: 999,
          padding: '5px 10px',
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.04em',
          cursor: installing ? 'wait' : 'pointer',
        }}
      >
        {installing ? 'Installing…' : 'Download app'}
      </button>
      {hint ? (
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, lineHeight: 1.4, maxWidth: 280 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}
