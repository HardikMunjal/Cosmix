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

  const statChips = useMemo(() => ([
    { label: 'Total profit', value: formatCurrency(profileInsights.totalProfit), accent: profileInsights.totalProfit >= 0 ? theme.green : theme.red },
    { label: 'Fitness score', value: String(profileInsights.totalFitnessScore), accent: theme.blue },
    { label: 'Friends', value: String(profileInsights.totalFriends), accent: theme.orange },
  ]), [profileInsights, theme]);

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
        }
        @media (max-width: 720px) {
          .dashboard-page { padding: 14px !important; }
          .dashboard-header { flex-direction: column !important; }
          .dashboard-header-actions { width: 100%; justify-content: space-between; }
          .dashboard-chip-grid, .dashboard-desk-grid, .dashboard-module-grid { grid-template-columns: 1fr !important; }
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
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'grid', gap: '10px' }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800 }}>Profile pulse</div>
                <div style={{ fontSize: '30px', lineHeight: 1.15, fontWeight: 800, color: theme.textHeading, maxWidth: '620px' }}>{user.quote || 'Building better decisions, one signal at a time.'}</div>
                <div style={{ color: theme.textSecondary, fontSize: '14px', lineHeight: 1.6, maxWidth: '620px' }}>Jump straight into settings, update your image, or move into wellness and chat from the same surface.</div>
              </div>
              <Avatar user={user} size={84} theme={theme} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }} className="dashboard-chip-grid">
              {statChips.map((item) => (
                <div key={item.label} style={{ borderRadius: '18px', padding: '16px', background: `${theme.panelBg}`, border: `1px solid ${theme.cardBorder}` }}>
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
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800, marginBottom: '8px' }}>Trading desk</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: theme.textHeading }}>Core market tools in one fixed section</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '14px' }} className="dashboard-desk-grid">
            {tradingDeskModules.map((module) => (
              <button key={module.path} type="button" onClick={() => router.push(module.path)} style={{ textAlign: 'left', borderRadius: '22px', border: `1px solid ${module.accent}55`, background: `linear-gradient(135deg, ${theme.cardBg}, ${module.accent}14)`, padding: '18px', cursor: 'pointer', display: 'grid', gap: '12px', color: theme.textPrimary }}>
                <div style={{ width: '46px', height: '46px', borderRadius: '14px', display: 'grid', placeItems: 'center', fontSize: '14px', fontWeight: 800, color: module.accent, background: `${module.accent}18`, border: `1px solid ${module.accent}30` }}>{module.icon}</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: theme.textHeading }}>{module.title}</div>
                <div style={{ fontSize: '13px', lineHeight: 1.6, color: theme.textSecondary }}>{module.desc}</div>
              </button>
            ))}
          </div>
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
}import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { logoutClientSession, restoreUserSession } from '../lib/auth-client';
import { useTheme } from '../lib/ThemePicker';
import { applyTheme } from '../lib/themes';

const TRANSACTION_COST_PER_ORDER = 30;

const marketModules = [
  { icon: 'NT', title: 'Nifty Tracker', desc: 'Track saved strategies, live MTM, transactions, and payoff snapshots.', path: '/nifty-strategies', accent: '#22c55e' },
  { icon: 'SB', title: 'Strategy Builder', desc: 'Build and save new Nifty option structures with live chain inputs.', path: '/options-strategy', accent: '#3b82f6' },
  { icon: 'AN', title: 'Analytics', desc: 'Portfolio and market analysis in one focused workspace.', path: '/analytics', accent: '#f59e0b' },
  { icon: 'OP', title: 'Option Pricing', desc: 'Compare expected option prices across pricing models and expiries.', path: '/expected-option-prices', accent: '#ec4899' },
];

const modules = [
  { icon: 'PF', title: 'Profile', desc: 'Account identity, avatar, and personal preferences.', path: '/profile', accent: '#94a3b8' },
  { icon: 'WL', title: 'Wellness Tracker', desc: 'Daily routines, recovery signals, and wellness prompts.', path: '/wellness', accent: '#34d399' },
  { icon: 'CH', title: 'Chat', desc: 'Theme-aware realtime chat for fast coordination and direct messages.', path: '/chat', accent: '#818cf8' },
  { icon: 'MD', title: 'Media Manager', desc: 'Upload, sort, and browse image and video collections.', path: '/media', accent: '#fb923c' },
];

function formatCurrency(value) {
  const numeric = Number(value || 0);
  const sign = numeric < 0 ? '-' : '';
  return `${sign}Rs. ${Math.abs(numeric).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function calculateTransactionCost(transactions = []) {
  return (transactions || []).length * TRANSACTION_COST_PER_ORDER;
}

function computeStrategyLiveMtm(strategy) {
  const lotSize = Number(strategy?.lotSize) || 65;
  return (strategy?.legs || []).reduce((sum, leg) => {
    const quantity = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
    const entry = Number(leg.premium) || 0;
    const current = Number(leg.marketPremium ?? leg.premium) || 0;
    return sum + (leg.side === 'SELL' ? (entry - current) * quantity * lotSize : (current - entry) * quantity * lotSize);
  }, 0);
}

function computeStrategyRealized(strategy) {
  return (strategy?.closedLegs || []).reduce((sum, leg) => sum + (Number(leg.pnl) || 0), 0);
}

function sampleSeries(points = [], maxPoints = 14) {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, index) => points[Math.round(index * step)]).filter(Boolean);
}

function TrackerLineChart({ points = [], theme, styles }) {
  if (!points.length) return <div style={styles.chartEmpty}>No tracker curve yet</div>;

  const width = 420;
  const height = 180;
  const pad = { left: 18, right: 12, top: 16, bottom: 24 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const min = Math.min(...points.map((point) => Number(point.value) || 0), 0);
  const max = Math.max(...points.map((point) => Number(point.value) || 0), 0);
  const range = max - min || 1;
  const xFor = (index) => pad.left + ((points.length === 1 ? 0 : index / (points.length - 1)) * plotWidth);
  const yFor = (value) => pad.top + plotHeight - (((value - min) / range) * plotHeight);
  const zeroY = yFor(0);
  const line = points.map((point, index) => `${xFor(index)},${yFor(Number(point.value) || 0)}`).join(' ');
  const lastValue = Number(points[points.length - 1]?.value) || 0;
  const lineColor = lastValue >= 0 ? theme.green : theme.red;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '180px', display: 'block', borderRadius: '16px', background: theme.graphBg }}>
      <defs>
        <linearGradient id="dashboardTrackerFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.24" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <line x1={pad.left} y1={zeroY} x2={width - pad.right} y2={zeroY} stroke={theme.graphGridLine} strokeDasharray="5 4" />
      {points.map((point, index) => (
        <line key={`grid-${index}`} x1={xFor(index)} y1={pad.top} x2={xFor(index)} y2={height - pad.bottom} stroke={theme.graphGridLine} strokeOpacity="0.4" />
      ))}
      <polygon fill="url(#dashboardTrackerFill)" points={`${pad.left},${zeroY} ${line} ${width - pad.right},${zeroY}`} />
      <polyline fill="none" stroke={lineColor} strokeWidth="3" points={line} />
      {points.map((point, index) => (
        <circle key={`point-${index}`} cx={xFor(index)} cy={yFor(Number(point.value) || 0)} r="3.2" fill={lineColor} />
      ))}
    </svg>
  );
}

function StrategyMixChart({ activeCount, closedCount, theme, styles }) {
  const total = Math.max(activeCount + closedCount, 1);
  const activePct = (activeCount / total) * 100;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const activeDash = (activeCount / total) * circumference;

  return (
    <div style={styles.mixWrap}>
      <svg width="160" height="160" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={radius} fill="none" stroke={theme.graphGridLine} strokeWidth="16" />
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke={theme.green}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${activeDash} ${circumference - activeDash}`}
          transform="rotate(-90 80 80)"
        />
        <text x="80" y="74" textAnchor="middle" fill={theme.textMuted} fontSize="12" fontWeight="700">Live mix</text>
        <text x="80" y="96" textAnchor="middle" fill={theme.textHeading} fontSize="24" fontWeight="800">{Math.round(activePct)}%</text>
      </svg>
      <div style={styles.mixLegend}>
        <div style={styles.mixLegendRow}><span style={{ ...styles.mixDot, background: theme.green }} />Active strategies: <strong>{activeCount}</strong></div>
        <div style={styles.mixLegendRow}><span style={{ ...styles.mixDot, background: theme.orange }} />Closed strategies: <strong>{closedCount}</strong></div>
      </div>
    </div>
  );
}

function PnlBarsChart({ items = [], theme, styles }) {
  if (!items.length) return <div style={styles.chartEmpty}>No strategy P/L yet</div>;

  const scale = Math.max(...items.map((item) => Math.abs(Number(item.value) || 0)), 1);
  return (
    <div style={styles.barChart}>
      {items.map((item) => {
        const positive = Number(item.value) >= 0;
        return (
          <div key={item.label} style={styles.barRow}>
            <div style={styles.barLabel}>{item.label}</div>
            <div style={styles.barTrack}>
              <div
                style={{
                  ...styles.barFill,
                  width: `${Math.max(8, (Math.abs(Number(item.value) || 0) / scale) * 100)}%`,
                  background: positive ? theme.green : theme.red,
                }}
              />
            </div>
            <div style={{ ...styles.barValue, color: positive ? theme.green : theme.red }}>{formatCurrency(item.value)}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { theme, themeId } = useTheme();
  const [user, setUser] = useState(null);
  const [strategies, setStrategies] = useState([]);

  useEffect(() => {
    restoreUserSession(router, setUser);
  }, [router]);

  const loadStrategies = useCallback(async () => {
    try {
      const response = await fetch('/api/options-strategies');
      const data = await response.json();
      if (response.ok) {
        setStrategies(data.strategies || []);
      }
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

  const summary = useMemo(() => {
    const active = strategies.filter((strategy) => strategy.status !== 'closed');
    const closed = strategies.filter((strategy) => strategy.status === 'closed');
    const openMtm = active.reduce((sum, strategy) => sum + computeStrategyLiveMtm(strategy), 0);
    const realized = closed.reduce((sum, strategy) => sum + (computeStrategyRealized(strategy) - calculateTransactionCost(strategy.transactions || [])), 0);
    const topPnl = strategies
      .map((strategy) => ({
        label: String(strategy.name || 'Unnamed').slice(0, 16),
        value: Number((computeStrategyLiveMtm(strategy) + computeStrategyRealized(strategy) - calculateTransactionCost(strategy.transactions || [])).toFixed(2)),
      }))
      .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
      .slice(0, 5);
    const trackerSource = active[0] || strategies[0] || null;
    const trackerPoints = trackerSource?.liveMetrics?.points?.length
      ? sampleSeries(trackerSource.liveMetrics.points)
      : trackerSource?.snapshotMetrics?.points?.length
        ? sampleSeries(trackerSource.snapshotMetrics.points)
        : [];

    return {
      activeCount: active.length,
      closedCount: closed.length,
      totalStrategies: strategies.length,
      openMtm: Number(openMtm.toFixed(2)),
      realized: Number(realized.toFixed(2)),
      totalPnl: Number((openMtm + realized).toFixed(2)),
      trackerSource,
      trackerPoints,
      topPnl,
    };
  }, [strategies]);

  const handleLogout = async () => {
    await logoutClientSession(router);
  };

  const styles = useMemo(() => applyTheme(baseStyles, themeId, theme), [theme, themeId]);

  if (!user) return <div style={styles.loading}>Loading...</div>;

  return (
    <div style={{ ...styles.container, background: `linear-gradient(180deg, ${theme.pageBgSolid}, ${theme.cardBg})` }} className="dash-page">
      <style>{`
        .dash-card { transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease; }
        .dash-card:hover { transform: translateY(-4px); box-shadow: 0 18px 42px ${theme.shadow}; }
        .dash-chart-card { transition: transform 0.18s ease, box-shadow 0.18s ease; }
        .dash-chart-card:hover { transform: translateY(-2px); }
        @media (max-width: 1180px) {
          .dash-page { padding: 22px !important; }
          .dash-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .dash-chart-grid { grid-template-columns: 1fr !important; }
          .dash-market-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 820px) {
          .dash-page { padding: 16px !important; }
          .dash-header { flex-direction: column !important; align-items: flex-start !important; }
          .dash-header-actions { width: 100%; }
          .dash-summary { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .dash-grid { grid-template-columns: 1fr !important; }
          .dash-hero { grid-template-columns: 1fr !important; }
          .dash-market-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 560px) {
          .dash-page { padding: 12px !important; }
          .dash-summary { grid-template-columns: 1fr !important; }
          .dash-hero-card, .dash-chart-card { padding: 16px !important; }
        }
      `}</style>

      <div style={styles.header} className="dash-header">
        <div>
          <div style={styles.eyebrow}>Cosmix home</div>
          <h1 style={styles.title}>Welcome, {user.username}</h1>
          <p style={styles.subtitle}>Your tracker, builder, and daily tools are back together on one dashboard.</p>
        </div>
        <div style={styles.headerActions} className="dash-header-actions">
          <button onClick={handleLogout} style={styles.logoutBtn}>Logout</button>
        </div>
      </div>

      <div style={styles.hero} className="dash-hero">
        <div style={{ ...styles.heroMain, background: `linear-gradient(135deg, ${theme.cardBg}, ${theme.cyan}18, ${theme.orange}18)` }} className="dash-hero-card">
          <div style={styles.heroLabel}>Market workspace</div>
          <div style={styles.heroTitle}>The market stack now lives in one grouped toolkit instead of scattered menu cards.</div>
          <div style={styles.heroText}>Open Nifty Tracker, Strategy Builder, Analytics, and Option Pricing from one shared market section, while keeping the rest of the dashboard focused on your broader workspace.</div>
          <div style={styles.heroActions}>
            <button onClick={() => document.getElementById('market-toolkit')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} style={{ ...styles.primaryBtn, background: theme.blue, color: '#fff' }}>Open Market Toolkit</button>
            <button onClick={() => router.push('/chat')} style={styles.secondaryBtn}>Open Chat</button>
          </div>
        </div>

        <div style={styles.heroAside}>
          <div style={{ ...styles.heroStatCard, background: `linear-gradient(135deg, ${theme.cardBg}, ${theme.green}12)` }}>
            <div style={styles.heroStatLabel}>Open MTM</div>
            <div style={{ ...styles.heroStatValue, color: summary.openMtm >= 0 ? theme.green : theme.red }}>{formatCurrency(summary.openMtm)}</div>
          </div>
          <div style={{ ...styles.heroStatCard, background: `linear-gradient(135deg, ${theme.cardBg}, ${theme.orange}10)` }}>
            <div style={styles.heroStatLabel}>Booked P/L</div>
            <div style={{ ...styles.heroStatValue, color: summary.realized >= 0 ? theme.green : theme.red }}>{formatCurrency(summary.realized)}</div>
          </div>
        </div>
      </div>

      <div style={styles.summaryGrid} className="dash-summary">
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Total strategies</div>
          <div style={styles.summaryValue}>{summary.totalStrategies}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Active</div>
          <div style={styles.summaryValue}>{summary.activeCount}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Closed</div>
          <div style={styles.summaryValue}>{summary.closedCount}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Net strategy P/L</div>
          <div style={{ ...styles.summaryValue, color: summary.totalPnl >= 0 ? theme.green : theme.red }}>{formatCurrency(summary.totalPnl)}</div>
        </div>
      </div>

      <section id="market-toolkit" style={styles.marketToolkit}>
        <div style={styles.marketToolkitHeader}>
          <div>
            <div style={styles.chartEyebrow}>Grouped market tools</div>
            <div style={styles.marketToolkitTitle}>Market Toolkit</div>
            <div style={styles.marketToolkitText}>One place for Nifty tracking, strategy building, analytics, and option pricing.</div>
          </div>
        </div>
        <div style={styles.marketToolkitGrid} className="dash-market-grid">
          {marketModules.map((module) => (
            <button
              key={module.path}
              type="button"
              onClick={() => router.push(module.path)}
              style={{ ...styles.marketActionCard, borderColor: `${module.accent}55`, background: `linear-gradient(135deg, ${theme.cardBg}, ${module.accent}14)` }}
            >
              <div style={{ ...styles.marketActionIcon, color: module.accent, background: `${module.accent}16` }}>{module.icon}</div>
              <div style={styles.marketActionTitle}>{module.title}</div>
              <div style={styles.marketActionDesc}>{module.desc}</div>
            </button>
          ))}
        </div>
      </section>

      <div style={styles.chartGrid} className="dash-chart-grid">
        <div style={{ ...styles.chartCard, background: `linear-gradient(180deg, ${theme.cardBg}, ${theme.cyan}10)` }} className="dash-chart-card">
          <div style={styles.chartEyebrow}>Tracker graph</div>
          <div style={styles.chartTitle}>{summary.trackerSource ? `${summary.trackerSource.name || 'Strategy'} outlook curve` : 'Tracker outlook curve'}</div>
          <div style={styles.chartDesc}>{summary.trackerSource ? `Spot ${Math.round(Number(summary.trackerSource.currentSpot || summary.trackerSource.savedAtSpot || 0)).toLocaleString('en-IN')} · based on saved live/snapshot payoff points.` : 'Save or open a strategy to see its payoff shape here.'}</div>
          <TrackerLineChart points={summary.trackerPoints} theme={theme} styles={styles} />
        </div>

        <div style={{ ...styles.chartCard, background: `linear-gradient(180deg, ${theme.cardBg}, ${theme.orange}10)` }} className="dash-chart-card">
          <div style={styles.chartEyebrow}>Strategy mix</div>
          <div style={styles.chartTitle}>Open vs closed strategies</div>
          <div style={styles.chartDesc}>A quick portfolio split between live structures still running and completed ones already closed.</div>
          <StrategyMixChart activeCount={summary.activeCount} closedCount={summary.closedCount} theme={theme} styles={styles} />
        </div>

        <div style={{ ...styles.chartCard, background: `linear-gradient(180deg, ${theme.cardBg}, ${theme.green}10)` }} className="dash-chart-card">
          <div style={styles.chartEyebrow}>Leaderboard</div>
          <div style={styles.chartTitle}>Top strategy P/L</div>
          <div style={styles.chartDesc}>Net contribution per strategy after realized legs, transaction cost, and current live MTM.</div>
          <PnlBarsChart items={summary.topPnl} theme={theme} styles={styles} />
        </div>
      </div>

      <div style={styles.grid} className="dash-grid">
        {modules.map((module) => (
          <div
            key={module.path}
            className="dash-card"
            style={{ ...styles.card, borderColor: `${module.accent}33`, background: `linear-gradient(135deg, ${theme.cardBg}, ${module.accent}12)` }}
            onClick={() => router.push(module.path)}
            onMouseEnter={(event) => {
              event.currentTarget.style.borderColor = module.accent;
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.borderColor = `${module.accent}33`;
            }}
          >
            <div style={{ ...styles.cardIcon, color: module.accent, background: `${module.accent}16` }}>{module.icon}</div>
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
    maxWidth: '700px',
    lineHeight: '1.6',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  logoutBtn: {
    background: '#111827',
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
    gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 0.8fr)',
    gap: '16px',
    marginBottom: '20px',
  },
  heroMain: {
    background: 'linear-gradient(135deg, #0f172a, #1e293b40)',
    border: '1px solid #1e293b',
    borderRadius: '24px',
    padding: '24px',
    boxShadow: '0 20px 48px rgba(0,0,0,0.35)',
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
    maxWidth: '720px',
  },
  heroText: {
    marginTop: '12px',
    color: '#94a3b8',
    fontSize: '14px',
    lineHeight: '1.7',
    maxWidth: '660px',
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
    boxShadow: '0 16px 34px rgba(0,0,0,0.18)',
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
    fontSize: '22px',
    lineHeight: '1.3',
    fontWeight: '800',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '14px',
    marginBottom: '20px',
  },
  summaryCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '18px',
    padding: '18px',
  },
  summaryLabel: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: '#64748b',
    marginBottom: '8px',
    fontWeight: '800',
  },
  summaryValue: {
    color: '#f8fafc',
    fontSize: '24px',
    fontWeight: '800',
  },
  marketToolkit: {
    marginBottom: '24px',
    padding: '22px',
    borderRadius: '24px',
    border: '1px solid #1e293b',
    background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.72))',
    boxShadow: '0 20px 38px rgba(0,0,0,0.18)',
  },
  marketToolkitHeader: {
    marginBottom: '18px',
  },
  marketToolkitTitle: {
    fontSize: '24px',
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: '8px',
  },
  marketToolkitText: {
    color: '#94a3b8',
    fontSize: '14px',
    lineHeight: '1.7',
  },
  marketToolkitGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '14px',
  },
  marketActionCard: {
    textAlign: 'left',
    padding: '18px',
    borderRadius: '18px',
    border: '1px solid #1e293b',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  marketActionIcon: {
    fontSize: '13px',
    fontWeight: '900',
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    display: 'grid',
    placeItems: 'center',
    background: '#08111f',
    letterSpacing: '0.08em',
  },
  marketActionTitle: {
    fontSize: '17px',
    fontWeight: '800',
    color: '#f8fafc',
  },
  marketActionDesc: {
    fontSize: '13px',
    color: '#94a3b8',
    lineHeight: '1.6',
  },
  chartGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  chartCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '22px',
    padding: '20px',
    boxShadow: '0 20px 38px rgba(0,0,0,0.18)',
  },
  chartEyebrow: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: '#64748b',
    fontWeight: '800',
    marginBottom: '8px',
  },
  chartTitle: {
    fontSize: '19px',
    color: '#f8fafc',
    fontWeight: '800',
    marginBottom: '8px',
  },
  chartDesc: {
    color: '#94a3b8',
    fontSize: '13px',
    lineHeight: '1.6',
    marginBottom: '14px',
    minHeight: '62px',
  },
  chartEmpty: {
    color: '#94a3b8',
    fontSize: '13px',
    padding: '32px 0',
    textAlign: 'center',
  },
  mixWrap: {
    display: 'grid',
    justifyItems: 'center',
    gap: '10px',
    paddingTop: '4px',
  },
  mixLegend: {
    display: 'grid',
    gap: '8px',
    width: '100%',
  },
  mixLegendRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#cbd5e1',
    fontSize: '13px',
  },
  mixDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    display: 'inline-block',
  },
  barChart: {
    display: 'grid',
    gap: '10px',
  },
  barRow: {
    display: 'grid',
    gridTemplateColumns: '96px 1fr 112px',
    gap: '10px',
    alignItems: 'center',
  },
  barLabel: {
    color: '#e2e8f0',
    fontSize: '12px',
    fontWeight: '700',
  },
  barTrack: {
    height: '12px',
    borderRadius: '999px',
    background: '#08111f',
    overflow: 'hidden',
    border: '1px solid #1e293b',
  },
  barFill: {
    height: '100%',
    borderRadius: '999px',
  },
  barValue: {
    textAlign: 'right',
    fontSize: '11px',
    fontWeight: '700',
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