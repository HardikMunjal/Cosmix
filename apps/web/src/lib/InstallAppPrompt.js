import { useEffect, useState } from 'react';
import {
  bindInstallPrompt,
  canShowInstallPrompt,
  dismissInstallPrompt,
  isIosDevice,
  isStandaloneApp,
  promptInstallApp,
} from './pwa';

export function InstallAppPrompt() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState('chromium');
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
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

  async function handleInstall() {
    if (platform === 'ios') return;
    setInstalling(true);
    try {
      await promptInstallApp();
    } finally {
      setInstalling(false);
    }
  }

  function handleDismiss() {
    dismissInstallPrompt();
    setVisible(false);
  }

  const isIos = platform === 'ios' || isIosDevice();

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
            : 'Install Cosmix on your device for quick access, full-screen mode, and push reminders — same features as the website.'}
        </div>
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
