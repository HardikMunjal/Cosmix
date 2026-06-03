import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { logoutClientSession, restoreUserSession } from '../lib/auth-client';
import { LogoutIcon, SettingsIcon, isAdminUser } from '../lib/appIcons';
import { MobileBottomNav } from '../lib/MobileNav';
import { useTheme } from '../lib/ThemePicker';

function SettingsLinkRow({ icon, label, hint, onClick, theme }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: '14px',
        background: theme.panelBg,
        color: theme.textHeading,
        padding: '14px 16px',
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <span style={{ fontSize: '20px', lineHeight: 1 }} aria-hidden="true">{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '14px', fontWeight: 800 }}>{label}</span>
        {hint ? <span style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>{hint}</span> : null}
      </span>
      <span style={{ opacity: 0.45, fontWeight: 800 }} aria-hidden="true">›</span>
    </button>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    restoreUserSession(router, setUser).finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: theme.textMuted }}>Loading settings…</div>;
  }

  if (!user) return null;

  const admin = isAdminUser(user);

  return (
    <div style={{ minHeight: '100vh', background: theme.pageBg, color: theme.textHeading, padding: '18px 16px 0' }}>
      <div style={{ maxWidth: '560px', margin: '0 auto', display: 'grid', gap: '16px' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            style={{
              border: `1px solid ${theme.cardBorder}`,
              borderRadius: '12px',
              background: theme.panelBg,
              color: theme.textHeading,
              padding: '10px 12px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            ← Home
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <SettingsIcon color={theme.textHeading} size={20} />
              <h1 style={{ margin: 0, fontSize: '24px' }}>Settings</h1>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: theme.textMuted }}>Signed in as {user.username}</p>
          </div>
        </header>

        <div style={{ display: 'grid', gap: '10px' }}>
          <SettingsLinkRow icon="👤" label="Profile" hint="Avatar, theme, and account details" onClick={() => router.push('/profile')} theme={theme} />
          <SettingsLinkRow icon="🔔" label="Notifications" hint="Push alerts and mute preferences" onClick={() => router.push('/push-settings')} theme={theme} />
          {admin ? (
            <SettingsLinkRow icon="📊" label="Wellness scoring admin" hint="Manage activity scoring rules" onClick={() => router.push('/wellness-admin')} theme={theme} />
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => logoutClientSession(router)}
          style={{
            width: '100%',
            border: 'none',
            borderRadius: '14px',
            background: 'rgba(239,68,68,0.14)',
            color: '#b91c1c',
            padding: '14px 16px',
            fontSize: '14px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
          }}
        >
          <LogoutIcon color="#b91c1c" size={18} />
          Sign out
        </button>
      </div>

      <MobileBottomNav
        theme={theme}
        activeId="settings"
        items={[
          { id: 'home', label: 'Home', icon: '🏠', href: '/dashboard' },
          { id: 'wellness', label: 'Henna', icon: '🌿', href: '/wellness' },
          { id: 'board', label: 'Ranks', icon: '🏆', href: '/leaderboard' },
          { id: 'settings', label: 'Settings', icon: '⚙️', href: '/settings' },
        ]}
      />
    </div>
  );
}
