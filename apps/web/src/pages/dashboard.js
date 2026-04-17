import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { logoutClientSession, restoreUserSession } from '../lib/auth-client';
import { useTheme } from '../lib/ThemePicker';
import { buildProfileInsights, buildStrategySummary, buildWellnessSummary, formatCurrency, formatPace } from '../lib/userInsights';

const tradingDeskModules = [
  { icon: 'NT', title: 'Nifty Tracker', desc: 'Track saved strategies, live payoff movement, and execution snapshots.', path: '/nifty-strategies', accent: '#22c55e' },
  { icon: 'SB', title: 'Strategy Builder', desc: 'Build option structures and save them back into your running book.', path: '/options-strategy', accent: '#2563eb' },
  { icon: 'AN', title: 'Analytics', desc: 'Review portfolio behavior, exits, and strategy-level performance.', path: '/analytics', accent: '#f59e0b' },
  { icon: 'OP', title: 'Option Pricing', desc: 'Compare expected option prices across models and expiries.', path: '/expected-option-prices', accent: '#e11d48' },
];

const workspaceModules = [
  { icon: 'WL', title: 'Wellness', desc: 'Track recovery, fitness score, and routine consistency.', path: '/wellness', accent: '#10b981' },
  { icon: 'CH', title: 'Chat', desc: 'Message live users directly and keep the conversation flow simple.', path: '/chat', accent: '#8b5cf6' },
  { icon: 'MD', title: 'Media', desc: 'Manage your saved screenshots, images, and visual references.', path: '/media', accent: '#fb923c' },
];

function SettingsIcon({ color }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6Z" />
    </svg>
  );
}

function Avatar({ user, size, theme }) {
  const fallback = String(user?.username || 'U').slice(0, 1).toUpperCase();

  return user?.avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={user.avatar} alt={user.username || 'Profile'} style={{ width: size, height: size, borderRadius: size / 2, objectFit: 'cover', border: `1px solid ${theme.cardBorder}` }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: size / 2, display: 'grid', placeItems: 'center', fontSize: size * 0.38, fontWeight: 800, color: '#fff', background: `linear-gradient(135deg, ${theme.orange}, ${theme.blue})`, border: `1px solid ${theme.cardBorder}` }}>{fallback}</div>
  );
}

function LineChart({ points, theme, height = 220, emptyLabel = 'No data yet', valueAccessor = (point) => Number(point.value || 0), labelAccessor = (point, index) => point.label || String(index + 1), color, gradientId }) {
  if (!points.length) {
    return <div style={{ minHeight: `${height}px`, display: 'grid', placeItems: 'center', color: theme.textSecondary, fontSize: '14px' }}>{emptyLabel}</div>;
  }

  const width = 520;
  const pad = { left: 18, right: 12, top: 16, bottom: 26 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const values = points.map((point) => valueAccessor(point));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;
  const xFor = (index) => pad.left + ((points.length === 1 ? 0 : index / (points.length - 1)) * plotWidth);
  const yFor = (value) => pad.top + plotHeight - (((value - min) / range) * plotHeight);
  const stroke = color || (values[values.length - 1] >= 0 ? theme.green : theme.red);
  const polyline = points.map((point, index) => `${xFor(index)},${yFor(valueAccessor(point))}`).join(' ');
  const zeroY = yFor(0);
  const fillId = gradientId || 'dashboard-line-fill';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: `${height}px`, display: 'block' }}>
      <defs>
        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.24" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <line x1={pad.left} y1={zeroY} x2={width - pad.right} y2={zeroY} stroke={theme.graphGridLine} strokeDasharray="5 4" />
      {points.map((point, index) => (
        <g key={`${labelAccessor(point, index)}-${index}`}>
          <line x1={xFor(index)} y1={pad.top} x2={xFor(index)} y2={height - pad.bottom} stroke={theme.graphGridLine} strokeOpacity="0.45" />
          <text x={xFor(index)} y={height - 6} textAnchor="middle" fill={theme.textMuted} fontSize="10">{labelAccessor(point, index)}</text>
        </g>
      ))}
      <polygon fill={`url(#${fillId})`} points={`${pad.left},${zeroY} ${polyline} ${width - pad.right},${zeroY}`} />
      <polyline fill="none" stroke={stroke} strokeWidth="3" points={polyline} />
      {points.map((point, index) => (
        <circle key={`dot-${labelAccessor(point, index)}-${index}`} cx={xFor(index)} cy={yFor(valueAccessor(point))} r="3.6" fill={stroke} />
      ))}
    </svg>
  );
}

function BarsChart({ items, theme }) {
  if (!items.length) {
    return <div style={{ minHeight: '220px', display: 'grid', placeItems: 'center', color: theme.textSecondary, fontSize: '14px' }}>No saved strategy profit and loss yet</div>;
  }

  const scale = Math.max(...items.map((item) => Math.abs(Number(item.value || 0))), 1);

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      {items.map((item) => {
        const positive = Number(item.value || 0) >= 0;
        return (
          <div key={item.label} style={{ display: 'grid', gridTemplateColumns: '112px minmax(0, 1fr) 120px', gap: '12px', alignItems: 'center' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: theme.textPrimary }}>{item.label}</div>
            <div style={{ height: '10px', borderRadius: '999px', background: theme.graphGridLine, overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(8, (Math.abs(Number(item.value || 0)) / scale) * 100)}%`, height: '100%', borderRadius: '999px', background: positive ? theme.green : theme.red }} />
            </div>
            <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 800, color: positive ? theme.green : theme.red }}>{formatCurrency(item.value)}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { theme } = useTheme();
  const [user, setUser] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [tradingDeskExpanded, setTradingDeskExpanded] = useState(false);

  useEffect(() => {
    restoreUserSession(router, setUser);
  }, [router]);

  const loadStrategies = useCallback(async () => {
    try {
      const response = await fetch('/api/options-strategies');
      const data = await response.json();
      if (response.ok) {
        setStrategies(data.strategies || []);
        return;
      }
      setStrategies([]);
    } catch (_) {
      setStrategies([]);
    }
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    loadStrategies();
    const interval = setInterval(loadStrategies, 30000);
    return () => clearInterval(interval);
  }, [user, loadStrategies]);

  const strategySummary = useMemo(() => buildStrategySummary(strategies), [strategies]);
  const wellnessSummary = useMemo(() => buildWellnessSummary(user?.id), [user?.id]);
  const profileInsights = useMemo(() => buildProfileInsights({ strategies, userId: user?.id }), [strategies, user?.id]);

  const scorecardItems = useMemo(() => ([
    { label: 'Total profit', value: formatCurrency(profileInsights.totalProfit), accent: profileInsights.totalProfit >= 0 ? theme.green : theme.red },
    { label: 'Fitness score', value: String(profileInsights.totalFitnessScore), accent: theme.blue },
    { label: 'Friends', value: String(profileInsights.totalFriends), accent: theme.orange },
    { label: 'Running streak', value: `${profileInsights.runningStreak}d`, accent: theme.emerald },
    { label: 'Highest run', value: `${profileInsights.highestRunKm.toFixed(2)} km`, accent: theme.cyan },
    { label: 'Strategies', value: String(strategySummary.totalStrategies), accent: theme.textHeading },
  ]), [profileInsights, strategySummary.totalStrategies, theme]);

  const performanceCards = useMemo(() => ([
    { label: 'Running streak', value: `${profileInsights.runningStreak} day${profileInsights.runningStreak === 1 ? '' : 's'}`, hint: `${profileInsights.weeklyRunningKm} km this week` },
    { label: 'Fastest run', value: formatPace(profileInsights.fastestRunPace), hint: 'Based on runs above 2 km' },
    { label: 'Highest run', value: `${profileInsights.highestRunKm.toFixed(2)} km`, hint: `${profileInsights.activeDays} active day${profileInsights.activeDays === 1 ? '' : 's'} in the last week` },
  ]), [profileInsights]);

  const handleLogout = async () => {
    await logoutClientSession(router);
  };

  if (!user) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: theme.pageBgSolid, color: theme.textPrimary, fontFamily: theme.font }}>Loading...</div>;
  }

  return (
    <div style={{ minHeight: '100vh', padding: '28px', background: theme.pageBg, color: theme.textPrimary, fontFamily: theme.font }} className="dashboard-page">
      <style>{`
        * { box-sizing: border-box; }
        html, body, #__next { min-height: 100%; margin: 0; }
        @media (max-width: 1024px) {
          .dashboard-top-grid, .dashboard-chart-grid, .dashboard-lower-grid { grid-template-columns: 1fr !important; }
          .dashboard-header { align-items: flex-start !important; }
          .dashboard-profile-shell { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 720px) {
          .dashboard-page { padding: 14px !important; }
          .dashboard-header { flex-direction: column !important; }
          .dashboard-header-actions { width: 100%; justify-content: space-between; }
          .dashboard-chip-grid, .dashboard-desk-grid, .dashboard-module-grid, .dashboard-scorecard-grid { grid-template-columns: 1fr !important; }
          .dashboard-hero-actions { width: 100%; }
          .dashboard-hero-actions button { width: 100%; }
        }
      `}</style>

      <div style={{ maxWidth: '1320px', margin: '0 auto', display: 'grid', gap: '22px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }} className="dashboard-header">
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.14em', color: theme.textMuted, fontWeight: 800, marginBottom: '8px' }}>Cosmix dashboard</div>
            <h1 style={{ margin: 0, fontSize: '34px', color: theme.textHeading }}>Welcome back, {user.username}</h1>
            <p style={{ margin: '8px 0 0', color: theme.textSecondary, fontSize: '15px', lineHeight: 1.6, maxWidth: '680px' }}>Your trading desk, wellness momentum, and live conversations are now surfaced without the empty filler blocks.</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }} className="dashboard-header-actions">
            <button type="button" onClick={() => router.push('/profile')} style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', borderRadius: '999px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, color: theme.textPrimary, padding: '8px 10px 8px 8px', cursor: 'pointer', boxShadow: `0 14px 32px ${theme.shadow}` }}>
              <Avatar user={user} size={36} theme={theme} />
              <span style={{ display: 'grid', justifyItems: 'start', gap: '2px' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: theme.textMuted, fontWeight: 800 }}>Settings</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 700, color: theme.textHeading }}><SettingsIcon color={theme.textHeading} />Profile</span>
              </span>
            </button>
            <button type="button" onClick={handleLogout} style={{ borderRadius: '14px', border: `1px solid ${theme.cardBorder}`, background: theme.btnSecondaryBg, color: theme.red, padding: '12px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 800 }}>Logout</button>
          </div>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.12fr) minmax(320px, 0.88fr)', gap: '18px' }} className="dashboard-top-grid">
          <div style={{ borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: `linear-gradient(135deg, ${theme.cardBg}, ${theme.cyan}14, ${theme.orange}14)`, padding: '24px', boxShadow: `0 20px 56px ${theme.shadow}`, display: 'grid', gap: '22px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: '20px', alignItems: 'stretch' }} className="dashboard-profile-shell">
              <div style={{ borderRadius: '24px', padding: '20px', background: `linear-gradient(180deg, ${theme.panelBg}, ${theme.cardBg})`, border: `1px solid ${theme.cardBorder}`, display: 'grid', justifyItems: 'center', alignContent: 'center', gap: '14px' }}>
                <Avatar user={user} size={140} theme={theme} />
                <div style={{ textAlign: 'center', display: 'grid', gap: '6px' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800 }}>Profile pulse</div>
                  <div style={{ fontSize: '26px', fontWeight: 800, color: theme.textHeading }}>{user.username}</div>
                  <div style={{ fontSize: '14px', lineHeight: 1.6, color: theme.textSecondary }}>{user.quote || 'Building better decisions, one signal at a time.'}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '18px' }}>
                <div style={{ display: 'grid', gap: '10px' }}>
                  <div style={{ fontSize: '30px', lineHeight: 1.15, fontWeight: 800, color: theme.textHeading }}>Your personal scorecard and trading shortcuts are now on the same surface.</div>
                  <div style={{ color: theme.textSecondary, fontSize: '14px', lineHeight: 1.6, maxWidth: '620px' }}>Open settings, review core stats, and move into wellness or chat without leaving the dashboard.</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }} className="dashboard-scorecard-grid">
                  {scorecardItems.map((item) => (
                    <div key={item.label} style={{ borderRadius: '18px', padding: '16px', background: theme.panelBg, border: `1px solid ${theme.cardBorder}` }}>
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: theme.textMuted, fontWeight: 800, marginBottom: '8px' }}>{item.label}</div>
                      <div style={{ fontSize: '22px', fontWeight: 800, color: item.accent }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }} className="dashboard-hero-actions">
                  <button type="button" onClick={() => router.push('/profile')} style={{ borderRadius: '14px', border: 'none', background: theme.orange, color: '#fff', padding: '12px 16px', cursor: 'pointer', fontSize: '14px', fontWeight: 800 }}>Open profile settings</button>
                  <button type="button" onClick={() => router.push('/wellness')} style={{ borderRadius: '14px', border: `1px solid ${theme.cardBorder}`, background: theme.btnSecondaryBg, color: theme.textPrimary, padding: '12px 16px', cursor: 'pointer', fontSize: '14px', fontWeight: 700 }}>Wellness log</button>
                  <button type="button" onClick={() => router.push('/chat')} style={{ borderRadius: '14px', border: `1px solid ${theme.cardBorder}`, background: theme.btnSecondaryBg, color: theme.textPrimary, padding: '12px 16px', cursor: 'pointer', fontSize: '14px', fontWeight: 700 }}>Open chat</button>
                </div>
              </div>
            </div>
          </div>

          <div style={{ borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '22px', boxShadow: `0 20px 56px ${theme.shadow}`, display: 'grid', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800, marginBottom: '8px' }}>Wellness momentum</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: theme.textHeading }}>Body score trend</div>
              <div style={{ marginTop: '6px', color: theme.textSecondary, fontSize: '14px', lineHeight: 1.6 }}>Seven-day score flow based on your logged routines, sleep, and workout load.</div>
            </div>

            <LineChart points={wellnessSummary.trendPoints} theme={theme} emptyLabel="Add wellness entries to see your trend" color={theme.blue} gradientId="wellness-line-fill" />

            <div style={{ display: 'grid', gap: '10px' }}>
              {performanceCards.map((item) => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', borderRadius: '18px', padding: '14px 16px', background: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>
                  <div>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: theme.textMuted, fontWeight: 800 }}>{item.label}</div>
                    <div style={{ marginTop: '6px', color: theme.textSecondary, fontSize: '13px' }}>{item.hint}</div>
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: theme.textHeading, textAlign: 'right' }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '22px', boxShadow: `0 20px 56px ${theme.shadow}`, display: 'grid', gap: '18px' }}>
          <button
            type="button"
            onClick={() => setTradingDeskExpanded((value) => !value)}
            style={{ textAlign: 'left', borderRadius: '24px', border: `1px solid ${theme.cardBorder}`, background: `linear-gradient(135deg, ${theme.cardBg}, ${theme.cyan}12, ${theme.orange}10)`, padding: '20px', cursor: 'pointer', display: 'grid', gap: '16px', color: theme.textPrimary }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: '8px' }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800 }}>Trading desk</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: theme.textHeading }}>All Nifty tools in one box</div>
                <div style={{ fontSize: '14px', lineHeight: 1.6, color: theme.textSecondary, maxWidth: '780px' }}>Click to {tradingDeskExpanded ? 'collapse' : 'expand'} your market workspace. Tracker, builder, analytics, and option pricing stay grouped together instead of occupying separate tiles.</div>
              </div>
              <div style={{ minWidth: '140px', display: 'grid', justifyItems: 'end', gap: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: theme.orange }}>{tradingDeskModules.length} tools</div>
                <div style={{ fontSize: '30px', lineHeight: 1, fontWeight: 800, color: theme.textHeading }}>{tradingDeskExpanded ? '−' : '+'}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }} className="dashboard-chip-grid">
              <div style={{ borderRadius: '18px', padding: '14px 16px', background: theme.panelBg, border: `1px solid ${theme.cardBorder}` }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: theme.textMuted, fontWeight: 800, marginBottom: '8px' }}>Net strategy P/L</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: strategySummary.totalPnl >= 0 ? theme.green : theme.red }}>{formatCurrency(strategySummary.totalPnl)}</div>
              </div>
              <div style={{ borderRadius: '18px', padding: '14px 16px', background: theme.panelBg, border: `1px solid ${theme.cardBorder}` }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: theme.textMuted, fontWeight: 800, marginBottom: '8px' }}>Live strategies</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: theme.textHeading }}>{strategySummary.activeCount}</div>
              </div>
              <div style={{ borderRadius: '18px', padding: '14px 16px', background: theme.panelBg, border: `1px solid ${theme.cardBorder}` }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: theme.textMuted, fontWeight: 800, marginBottom: '8px' }}>Closed strategies</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: theme.textHeading }}>{strategySummary.closedCount}</div>
              </div>
            </div>
          </button>

          {tradingDeskExpanded ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '14px' }} className="dashboard-desk-grid">
              {tradingDeskModules.map((module) => (
                <button key={module.path} type="button" onClick={() => router.push(module.path)} style={{ textAlign: 'left', borderRadius: '22px', border: `1px solid ${module.accent}55`, background: `linear-gradient(135deg, ${theme.cardBg}, ${module.accent}14)`, padding: '18px', cursor: 'pointer', display: 'grid', gap: '12px', color: theme.textPrimary }}>
                  <div style={{ width: '46px', height: '46px', borderRadius: '14px', display: 'grid', placeItems: 'center', fontSize: '14px', fontWeight: 800, color: module.accent, background: `${module.accent}18`, border: `1px solid ${module.accent}30` }}>{module.icon}</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: theme.textHeading }}>{module.title}</div>
                  <div style={{ fontSize: '13px', lineHeight: 1.6, color: theme.textSecondary }}>{module.desc}</div>
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '18px' }} className="dashboard-chart-grid">
          <div style={{ borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '22px', boxShadow: `0 20px 56px ${theme.shadow}`, display: 'grid', gap: '14px' }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800, marginBottom: '8px' }}>Strategy curve</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: theme.textHeading }}>{strategySummary.trackerSource ? `${strategySummary.trackerSource.name || 'Strategy'} outlook` : 'Saved payoff outlook'}</div>
              <div style={{ marginTop: '6px', color: theme.textSecondary, fontSize: '14px', lineHeight: 1.6 }}>{strategySummary.trackerSource ? `Spot ${Math.round(Number(strategySummary.trackerSource.currentSpot || strategySummary.trackerSource.savedAtSpot || 0)).toLocaleString('en-IN')} with live or saved payoff points.` : 'Save a strategy to surface its payoff curve here.'}</div>
            </div>
            <LineChart points={strategySummary.trackerPoints} theme={theme} emptyLabel="No tracker curve yet" color={theme.emerald} valueAccessor={(point) => Number(point.value || 0)} labelAccessor={(point) => String(point.label || '').slice(-5) || ''} gradientId="strategy-line-fill" />
          </div>

          <div style={{ borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '22px', boxShadow: `0 20px 56px ${theme.shadow}`, display: 'grid', gap: '14px' }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800, marginBottom: '8px' }}>Profit leaderboard</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: theme.textHeading }}>Top strategy contribution</div>
              <div style={{ marginTop: '6px', color: theme.textSecondary, fontSize: '14px', lineHeight: 1.6 }}>Net profit and loss per strategy after realized exits, costs, and current live movement.</div>
            </div>
            <BarsChart items={strategySummary.topPnl} theme={theme} />
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.92fr) minmax(0, 1.08fr)', gap: '18px' }} className="dashboard-lower-grid">
          <div style={{ borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '22px', boxShadow: `0 20px 56px ${theme.shadow}`, display: 'grid', gap: '14px' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800 }}>Today</div>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ borderRadius: '18px', padding: '16px', background: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>
                <div style={{ fontSize: '12px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800, marginBottom: '8px' }}>Body score</div>
                <div style={{ fontSize: '26px', fontWeight: 800, color: theme.blue }}>{wellnessSummary.dashboardStats.totalBodyScore}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                <div style={{ borderRadius: '18px', padding: '16px', background: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>
                  <div style={{ fontSize: '12px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800, marginBottom: '8px' }}>Physical</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: theme.emerald }}>{wellnessSummary.dashboardStats.totalPhysicalScore}</div>
                </div>
                <div style={{ borderRadius: '18px', padding: '16px', background: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>
                  <div style={{ fontSize: '12px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800, marginBottom: '8px' }}>Mental</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: theme.orange }}>{wellnessSummary.dashboardStats.totalMentalScore}</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '14px' }} className="dashboard-module-grid">
            {workspaceModules.map((module) => (
              <button key={module.path} type="button" onClick={() => router.push(module.path)} style={{ textAlign: 'left', borderRadius: '24px', border: `1px solid ${module.accent}55`, background: `linear-gradient(135deg, ${theme.cardBg}, ${module.accent}12)`, padding: '20px', cursor: 'pointer', display: 'grid', gap: '12px', color: theme.textPrimary, boxShadow: `0 16px 36px ${theme.shadow}` }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '14px', display: 'grid', placeItems: 'center', fontSize: '14px', fontWeight: 800, color: module.accent, background: `${module.accent}18`, border: `1px solid ${module.accent}30` }}>{module.icon}</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: theme.textHeading }}>{module.title}</div>
                <div style={{ fontSize: '13px', lineHeight: 1.6, color: theme.textSecondary }}>{module.desc}</div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
