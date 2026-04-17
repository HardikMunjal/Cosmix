import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { restoreUserSession } from '../lib/auth-client';
import { useTheme } from '../lib/ThemePicker';
import { buildProfileInsights, buildStrategySummary, buildWellnessSummary, formatCurrency, formatPace } from '../lib/userInsights';

const tradingDeskModules = [
  { icon: 'NT', title: 'Nifty Tracker', desc: 'Track saved strategies, live payoff movement, and execution snapshots.', path: '/nifty-strategies', accent: '#22c55e' },
  { icon: 'SB', title: 'Strategy Builder', desc: 'Build option structures and save them back into your running book.', path: '/options-strategy', accent: '#2563eb' },
  { icon: 'OP', title: 'Option Pricing', desc: 'Compare expected option prices across models and expiries.', path: '/expected-option-prices', accent: '#e11d48' },
];

const workspaceModules = [
  { icon: 'AN', title: 'Analytics', desc: 'Review portfolio behavior, exits, and strategy-level performance.', path: '/analytics', accent: '#f59e0b' },
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

function Avatar({ user, size, theme, square = false }) {
  const fallback = String(user?.username || 'U').slice(0, 1).toUpperCase();
  const radius = square ? Math.max(18, Math.round(size * 0.14)) : size / 2;

  return user?.avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={user.avatar} alt={user.username || 'Profile'} style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', border: `1px solid ${theme.cardBorder}` }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: radius, display: 'grid', placeItems: 'center', fontSize: size * 0.38, fontWeight: 800, color: '#fff', background: `linear-gradient(135deg, ${theme.orange}, ${theme.blue})`, border: `1px solid ${theme.cardBorder}` }}>{fallback}</div>
  );
}

function MetricList({ items, theme, compact = false }) {
  return (
    <div style={{ display: 'grid', gap: compact ? '1px' : '3px' }}>
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            alignItems: 'baseline',
            gap: compact ? '5px' : '10px',
            padding: compact ? '1px 0' : '7px 0',
          }}
        >
          <div style={{ fontSize: compact ? '9px' : '11px', textTransform: 'uppercase', letterSpacing: compact ? '0.08em' : '0.14em', color: theme.textMuted, fontWeight: 700 }}>{item.label}</div>
          <div style={{ fontSize: compact ? '12px' : '15px', fontWeight: 800, color: item.accent || theme.textHeading, lineHeight: 1, textAlign: 'right' }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function MetricGrid({ items, theme }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: '16px', rowGap: '6px' }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: 'grid', gap: '2px' }}>
          <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.textMuted, fontWeight: 700 }}>{item.label}</div>
          <div style={{ fontSize: '13px', fontWeight: 800, color: item.accent || theme.textHeading, lineHeight: 1.05 }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function LineChart({ points, theme, height = 220, emptyLabel = 'No data yet', valueAccessor = (point) => Number(point.value || 0), labelAccessor = (point, index) => point.label || String(index + 1), color, gradientId, vivid = false, annotationFormatter = (value) => `${value >= 0 ? '+' : ''}${Math.round(value).toLocaleString('en-IN')}` }) {
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
  const lastIndex = points.length - 1;
  const lastPoint = points[lastIndex];
  const lastX = xFor(lastIndex);
  const lastY = yFor(valueAccessor(lastPoint));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: `${height}px`, display: 'block' }}>
      <defs>
        <linearGradient id={fillId} x1="0" x2="1" y1="0" y2="1">
          {vivid ? (
            <>
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.28" />
              <stop offset="45%" stopColor="#06b6d4" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.08" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor={stroke} stopOpacity="0.24" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0.04" />
            </>
          )}
        </linearGradient>
        <filter id={`${fillId}-glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <line x1={pad.left} y1={zeroY} x2={width - pad.right} y2={zeroY} stroke={theme.graphGridLine} strokeDasharray="5 4" />
      {points.map((point, index) => (
        <g key={`${labelAccessor(point, index)}-${index}`}>
          <line x1={xFor(index)} y1={pad.top} x2={xFor(index)} y2={height - pad.bottom} stroke={theme.graphGridLine} strokeOpacity="0.25" />
          <text x={xFor(index)} y={height - 6} textAnchor="middle" fill={theme.textMuted} fontSize="10">{labelAccessor(point, index)}</text>
        </g>
      ))}
      <polygon fill={`url(#${fillId})`} points={`${pad.left},${zeroY} ${polyline} ${width - pad.right},${zeroY}`} />
      <polyline fill="none" stroke={vivid ? 'url(#strategy-line-stroke)' : stroke} strokeWidth="3.5" points={polyline} filter={`url(#${fillId}-glow)`} />
      {points.map((point, index) => (
        <circle key={`dot-${labelAccessor(point, index)}-${index}`} cx={xFor(index)} cy={yFor(valueAccessor(point))} r={index === lastIndex ? '5.2' : '3.2'} fill={stroke} />
      ))}
      <g>
        <circle cx={lastX} cy={lastY} r="9" fill={stroke} fillOpacity="0.14" />
        <text x={Math.min(width - 10, lastX + 12)} y={Math.max(18, lastY - 12)} fill={theme.textHeading} fontSize="11" fontWeight="800">{annotationFormatter(valueAccessor(lastPoint), lastPoint)}</text>
      </g>
      {vivid ? (
        <defs>
          <linearGradient id="strategy-line-stroke" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="50%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
      ) : null}
    </svg>
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

  const wellnessCards = useMemo(() => ([
    { label: 'Wellness score', value: String(profileInsights.currentWellnessScore), accent: theme.blue },
    { label: '7D avg score', value: String(profileInsights.weeklyAverageWellnessScore), accent: theme.cyan },
    { label: 'Running streak', value: `${profileInsights.runningStreak}d`, accent: theme.emerald },
    { label: 'Weekly distance', value: `${profileInsights.weeklyRunningKm.toFixed(1)} km`, accent: theme.textHeading },
    { label: 'Planned goals', value: String(profileInsights.plannedGoals), accent: theme.orange },
    { label: 'Completed goals', value: String(profileInsights.completedGoals), accent: theme.green },
  ]), [profileInsights, theme]);
  const primaryStats = useMemo(() => ([
    { label: 'Wellness score', value: String(profileInsights.currentWellnessScore), accent: theme.blue },
    { label: '7D avg score', value: String(profileInsights.weeklyAverageWellnessScore), accent: theme.cyan },
    { label: 'Running streak', value: `${profileInsights.runningStreak}d`, accent: theme.emerald },
    { label: 'Fastest pace', value: formatPace(profileInsights.fastestRunPace), accent: theme.blue },
    { label: 'Longest distance', value: `${profileInsights.highestRunKm.toFixed(1)} km`, accent: theme.cyan },
    { label: 'Weekly distance', value: `${profileInsights.weeklyRunningKm.toFixed(1)} km`, accent: theme.textHeading },
    { label: 'Planned goals', value: String(profileInsights.plannedGoals), accent: theme.orange },
    { label: 'Completed goals', value: String(profileInsights.completedGoals), accent: theme.green },
  ]), [profileInsights, theme]);
  const marketCards = useMemo(() => (strategySummary.profitWindows.map((item) => ({
    ...item,
    value: formatCurrency(item.value),
    accent: item.value >= 0 ? theme.green : theme.red,
  }))), [strategySummary.profitWindows, theme]);

  if (!user) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: theme.pageBgSolid, color: theme.textPrimary, fontFamily: theme.font }}>Loading...</div>;
  }

  return (
    <div style={{ minHeight: '100vh', padding: '24px', background: theme.pageBg, color: theme.textPrimary, fontFamily: theme.font }} className="dashboard-page">
      <style>{`
        * { box-sizing: border-box; }
        html, body, #__next { min-height: 100%; margin: 0; }
        @media (max-width: 1024px) {
          .dashboard-top-grid, .dashboard-market-grid, .dashboard-lower-grid { grid-template-columns: 1fr !important; }
          .dashboard-header { align-items: flex-start !important; }
          .dashboard-profile-shell { grid-template-columns: 1fr !important; }
          .dashboard-profile-meta { align-content: start !important; }
        }
        @media (max-width: 720px) {
          .dashboard-page { padding: 14px !important; }
          .dashboard-header { flex-direction: column !important; }
          .dashboard-header-actions { width: 100%; justify-content: space-between; }
          .dashboard-module-grid, .dashboard-scorecard-grid, .dashboard-market-modules { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ maxWidth: '1320px', margin: '0 auto', display: 'grid', gap: '18px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }} className="dashboard-header">
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.14em', color: theme.textMuted, fontWeight: 800, marginBottom: '8px' }}>Cosmix dashboard</div>
            <h1 style={{ margin: 0, fontSize: '34px', color: theme.textHeading }}>Welcome back, {user.username}</h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }} className="dashboard-header-actions">
            <button type="button" onClick={() => router.push('/profile')} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '999px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, color: theme.textHeading, padding: '12px 16px', cursor: 'pointer', boxShadow: `0 14px 32px ${theme.shadow}`, fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              <SettingsIcon color={theme.textHeading} />
              Settings
            </button>
          </div>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.12fr) minmax(320px, 0.88fr)', gap: '16px' }} className="dashboard-top-grid">
          <div style={{ borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: `linear-gradient(135deg, ${theme.cardBg}, ${theme.cyan}10, ${theme.orange}10)`, padding: '16px', boxShadow: `0 20px 56px ${theme.shadow}`, display: 'grid', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: '14px', alignItems: 'stretch' }} className="dashboard-profile-shell">
              <div style={{ borderRadius: '22px', padding: '12px', background: `linear-gradient(180deg, ${theme.panelBg}, ${theme.cardBg})`, border: `1px solid ${theme.cardBorder}`, display: 'grid', placeItems: 'center' }}>
                <Avatar user={user} size={236} theme={theme} square />
              </div>

              <div style={{ display: 'grid', alignContent: 'stretch' }} className="dashboard-profile-meta">
                <MetricList items={primaryStats} theme={theme} compact />
              </div>
            </div>
          </div>

          <div style={{ borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '14px', boxShadow: `0 20px 56px ${theme.shadow}`, display: 'grid', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800 }}>Wellness</div>
            </div>

            <LineChart points={wellnessSummary.trendPoints} theme={theme} emptyLabel="Add wellness entries to see your trend" color={theme.blue} gradientId="wellness-line-fill" height={156} />

            <MetricGrid items={wellnessCards} theme={theme} />
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.18fr) minmax(300px, 0.82fr)', gap: '16px' }} className="dashboard-market-grid">
          <div style={{ borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '16px', boxShadow: `0 20px 56px ${theme.shadow}`, display: 'grid', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800 }}>Market overview</div>
              <div style={{ display: 'grid', gap: '2px', justifyItems: 'end' }}>
                <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.textMuted, fontWeight: 700 }}>Net P/L</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: strategySummary.totalPnl >= 0 ? theme.green : theme.red }}>{formatCurrency(strategySummary.totalPnl)}</div>
              </div>
            </div>

            <LineChart points={strategySummary.profitTrend} theme={theme} emptyLabel="Close trades to surface your daily P/L trend" color={theme.emerald} valueAccessor={(point) => Number(point.value || 0)} labelAccessor={(point) => String(point.label || '')} gradientId="strategy-line-fill" vivid height={144} annotationFormatter={(value) => formatCurrency(value)} />

            <MetricGrid items={marketCards} theme={theme} />
          </div>

          <div style={{ borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '16px', boxShadow: `0 20px 56px ${theme.shadow}`, display: 'grid', gap: '12px', alignContent: 'start' }}>

            <div style={{ display: 'grid', gap: '12px' }} className="dashboard-market-modules">
              {tradingDeskModules.map((module) => (
                <button key={module.path} type="button" onClick={() => router.push(module.path)} style={{ textAlign: 'left', borderRadius: '18px', border: `1px solid ${module.accent}44`, background: `linear-gradient(135deg, ${theme.cardBg}, ${module.accent}10)`, padding: '12px 14px', cursor: 'pointer', display: 'grid', gap: '8px', color: theme.textPrimary }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '12px', display: 'grid', placeItems: 'center', fontSize: '13px', fontWeight: 800, color: module.accent, background: `${module.accent}18`, border: `1px solid ${module.accent}30` }}>{module.icon}</div>
                    <div style={{ fontSize: '17px', fontWeight: 800, color: theme.textHeading }}>{module.title}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section style={{ borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '16px', boxShadow: `0 20px 56px ${theme.shadow}`, display: 'grid', gap: '14px' }}>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800, marginBottom: '8px' }}>Workspace</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: theme.textHeading }}>Workspace</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '14px' }} className="dashboard-module-grid">
            {workspaceModules.map((module) => (
              <button key={module.path} type="button" onClick={() => router.push(module.path)} style={{ textAlign: 'left', borderRadius: '22px', border: `1px solid ${module.accent}55`, background: `linear-gradient(135deg, ${theme.cardBg}, ${module.accent}10)`, padding: '14px', cursor: 'pointer', display: 'grid', gap: '10px', color: theme.textPrimary, boxShadow: `0 16px 36px ${theme.shadow}` }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '14px', display: 'grid', placeItems: 'center', fontSize: '14px', fontWeight: 800, color: module.accent, background: `${module.accent}18`, border: `1px solid ${module.accent}30` }}>{module.icon}</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: theme.textHeading }}>{module.title}</div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
