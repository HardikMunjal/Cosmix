import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { ThemePicker, useTheme } from '../lib/ThemePicker';
import { applyTheme } from '../lib/themes';

const modules = [
  { icon: 'AN', title: 'Analytics', desc: 'Portfolio and market analysis live in one focused workspace.', path: '/analytics', accent: '#f59e0b' },
  { icon: 'WL', title: 'Wellness Tracker', desc: 'Daily routines, recovery signals, and wellness prompts.', path: '/wellness', accent: '#34d399' },
  { icon: 'CH', title: 'Chat', desc: 'Theme-aware realtime chat for fast coordination and direct messages.', path: '/chat', accent: '#818cf8' },
  { icon: 'MD', title: 'Media Manager', desc: 'Upload, sort, and browse image and video collections.', path: '/media', accent: '#fb923c' },
  { icon: 'PF', title: 'Profile', desc: 'Account identity, avatar, and personal preferences.', path: '/profile', accent: '#94a3b8' },
];

const focusCards = [
  {
    label: 'Today',
    title: 'Keep the dashboard lean',
    body: 'Nifty-specific cards are removed here so this page stays a general control hub. Use Analytics for market views.',
    accent: '#38bdf8',
  },
  {
    label: 'Flow',
    title: 'Move faster between tools',
    body: 'Chat, analytics, wellness, and media now sit together as the core daily surfaces.',
    accent: '#22c55e',
  },
  {
    label: 'Focus',
    title: 'One place for launch points',
    body: 'This page is now about navigation and status, not duplicated analysis widgets.',
    accent: '#f97316',
  },
];

export default function Dashboard() {
  const router = useRouter();
  const { theme, themeId, setTheme } = useTheme();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.push('/');
      return;
    }
    setUser(JSON.parse(storedUser));
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    router.push('/');
  };

  const styles = useMemo(() => applyTheme(baseStyles, themeId, theme), [themeId, theme]);

  if (!user) return <div style={styles.loading}>Loading...</div>;

  return (
    <div style={styles.container} className="dash-page">
      <style>{`
        .dash-card { transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease; }
        .dash-card:hover { transform: translateY(-4px); box-shadow: 0 14px 36px rgba(0,0,0,0.28); }
        .focus-card { transition: transform 0.2s ease, border-color 0.2s ease; }
        .focus-card:hover { transform: translateY(-3px); }
        @media (max-width: 1180px) {
          .dash-page { padding: 22px !important; }
          .dash-focus { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 820px) {
          .dash-page { padding: 16px !important; }
          .dash-header { flex-direction: column !important; align-items: flex-start !important; }
          .dash-focus { grid-template-columns: 1fr !important; }
          .dash-grid { grid-template-columns: 1fr !important; }
          .dash-hero { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 520px) {
          .dash-page { padding: 12px !important; }
        }
      `}</style>

      <div style={styles.header} className="dash-header">
        <div>
          <div style={styles.eyebrow}>Cosmix home</div>
          <h1 style={styles.title}>Welcome, {user.username}</h1>
          <p style={styles.subtitle}>General control hub for the app. Market-specific analysis stays inside Analytics.</p>
        </div>
        <div style={styles.headerActions}>
          <ThemePicker theme={theme} themeId={themeId} setTheme={setTheme} />
          <button onClick={handleLogout} style={styles.logoutBtn}>Logout</button>
        </div>
      </div>

      <div style={styles.hero} className="dash-hero">
        <div style={styles.heroMain}>
          <div style={styles.heroLabel}>Workspace focus</div>
          <div style={styles.heroTitle}>Cleaner launch surface, less duplicated market noise.</div>
          <div style={styles.heroText}>Analytics remains the single place for Nifty and strategy-heavy views. This dashboard now points you to the right tool without repeating those widgets.</div>
          <div style={styles.heroActions}>
            <button onClick={() => router.push('/analytics')} style={styles.primaryBtn}>Open Analytics</button>
            <button onClick={() => router.push('/chat')} style={styles.secondaryBtn}>Open Chat</button>
          </div>
        </div>

        <div style={styles.heroAside}>
          <div style={styles.heroStatCard}>
            <div style={styles.heroStatLabel}>Best next move</div>
            <div style={styles.heroStatValue}>Use Analytics for market views</div>
          </div>
          <div style={styles.heroStatCard}>
            <div style={styles.heroStatLabel}>Fast lane</div>
            <div style={styles.heroStatValue}>Chat now has themes and a richer layout</div>
          </div>
        </div>
      </div>

      <div style={styles.focusGrid} className="dash-focus">
        {focusCards.map((card) => (
          <div key={card.title} className="focus-card" style={{ ...styles.focusCard, borderTopColor: card.accent }}>
            <div style={styles.focusLabel}>{card.label}</div>
            <div style={styles.focusTitle}>{card.title}</div>
            <div style={styles.focusText}>{card.body}</div>
          </div>
        ))}
      </div>

      <div style={styles.grid} className="dash-grid">
        {modules.map((module) => (
          <div
            key={module.path}
            className="dash-card"
            style={{ ...styles.card, borderColor: `${module.accent}33` }}
            onClick={() => router.push(module.path)}
            onMouseEnter={(event) => {
              event.currentTarget.style.borderColor = module.accent;
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.borderColor = `${module.accent}33`;
            }}
          >
            <div style={{ ...styles.cardIcon, color: module.accent }}>{module.icon}</div>
            <div style={styles.cardTitle}>{module.title}</div>
            <div style={styles.cardDesc}>{module.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const baseStyles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #020617, #0f172a)',
    color: '#e2e8f0',
    padding: '32px',
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  },
  loading: {
    minHeight: '100vh',
    background: '#020617',
    color: '#e2e8f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    gap: '16px',
    flexWrap: 'wrap',
  },
  eyebrow: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: '#64748b',
    marginBottom: '8px',
    fontWeight: '800',
  },
  title: {
    margin: 0,
    fontSize: '30px',
    fontWeight: '800',
    color: '#f8fafc',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: '14px',
    marginTop: '6px',
    maxWidth: '660px',
    lineHeight: '1.6',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  logoutBtn: {
    background: '#1e293b',
    border: '1px solid #334155',
    color: '#f87171',
    padding: '10px 18px',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '700',
  },
  hero: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, 0.8fr)',
    gap: '16px',
    marginBottom: '24px',
  },
  heroMain: {
    background: 'linear-gradient(135deg, rgba(15,23,42,0.96), rgba(30,41,59,0.78))',
    border: '1px solid #1e293b',
    borderRadius: '22px',
    padding: '24px',
  },
  heroAside: {
    display: 'grid',
    gap: '12px',
  },
  heroLabel: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: '#64748b',
    fontWeight: '800',
    marginBottom: '10px',
  },
  heroTitle: {
    fontSize: '28px',
    color: '#f8fafc',
    fontWeight: '800',
    lineHeight: '1.2',
    maxWidth: '620px',
  },
  heroText: {
    marginTop: '12px',
    color: '#94a3b8',
    fontSize: '14px',
    lineHeight: '1.7',
    maxWidth: '620px',
  },
  heroActions: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginTop: '18px',
  },
  primaryBtn: {
    background: '#3b82f6',
    color: '#f8fafc',
    border: 'none',
    borderRadius: '12px',
    padding: '12px 16px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '800',
  },
  secondaryBtn: {
    background: '#0f172a',
    color: '#e2e8f0',
    border: '1px solid #334155',
    borderRadius: '12px',
    padding: '12px 16px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '700',
  },
  heroStatCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '18px',
    padding: '18px',
  },
  heroStatLabel: {
    color: '#64748b',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    fontWeight: '800',
    marginBottom: '8px',
  },
  heroStatValue: {
    color: '#f8fafc',
    fontSize: '18px',
    lineHeight: '1.4',
    fontWeight: '800',
  },
  focusGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '14px',
    marginBottom: '24px',
  },
  focusCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderTop: '3px solid #38bdf8',
    borderRadius: '18px',
    padding: '18px',
  },
  focusLabel: {
    color: '#64748b',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    fontWeight: '800',
    marginBottom: '10px',
  },
  focusTitle: {
    color: '#f8fafc',
    fontSize: '19px',
    fontWeight: '800',
    marginBottom: '8px',
  },
  focusText: {
    color: '#94a3b8',
    fontSize: '13px',
    lineHeight: '1.6',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: '16px',
  },
  card: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '18px',
    padding: '22px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  cardIcon: {
    fontSize: '13px',
    fontWeight: '900',
    width: '42px',
    height: '42px',
    borderRadius: '12px',
    display: 'grid',
    placeItems: 'center',
    background: '#08111f',
    letterSpacing: '0.08em',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: '800',
    color: '#f8fafc',
  },
  cardDesc: {
    fontSize: '13px',
    color: '#94a3b8',
    lineHeight: '1.6',
  },
};
