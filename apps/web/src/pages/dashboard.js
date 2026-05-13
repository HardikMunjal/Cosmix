import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveAvatarPresentation } from '../lib/avatarProfile';
import { restoreUserSession } from '../lib/auth-client';
import { useTheme } from '../lib/ThemePicker';
import { buildStrategySummary, formatCurrency } from '../lib/userInsights';

const tradingDeskModules = [
  { icon: 'NT', title: 'Nifty Tracker', desc: 'Track saved strategies, live payoff movement, and execution snapshots.', path: '/nifty-strategies', accent: '#22c55e' },
  { icon: '📋', title: 'Strategy History', desc: 'View all past strategies with start/end dates, duration, and realized P/L.', path: '/strategy-history', accent: '#a78bfa' },
  { icon: 'SB', title: 'Strategy Builder', desc: 'Build option structures and save them back into your running book.', path: '/options-strategy', accent: '#2563eb' },
  { icon: 'OP', title: 'Option Pricing', desc: 'Compare expected option prices across models and expiries.', path: '/expected-option-prices', accent: '#e11d48' },
];

const workspaceModules = [
  { icon: 'AN', title: 'Analytics', desc: 'Review portfolio behavior, exits, and strategy-level performance.', path: '/analytics', accent: '#f59e0b' },
  { icon: '📊', title: 'Strategy Analytics', desc: 'Comprehensive day-wise and strategy-wise P/L dashboard.', path: '/analytics-enhanced', accent: '#06b6d4' },
  { icon: '🏃', title: 'Running Dashboard', desc: 'Keep running and wellness analytics separate from strategy tracking.', path: '/running-analytics', accent: '#10b981' },
  { icon: '🏆', title: 'Leaderboard', desc: 'Compete with friends on running distance, speed, and fitness achievements.', path: '/leaderboard', accent: '#f59e0b' },
  { icon: 'WL', title: 'Wellness Dashboard', desc: 'Track recovery, fitness score, and routine consistency.', path: '/wellness', accent: '#10b981' },
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
  const avatar = resolveAvatarPresentation(user?.avatar || '');
  const fallback = String(user?.username || 'U').slice(0, 1).toUpperCase();
  const radius = square ? Math.max(18, Math.round(size * 0.14)) : size / 2;
  const frame = avatar.activeFrame || { x: 0, y: 0, scale: 1 };

  if (avatar.isCutout && avatar.displaySrc) {
    const cutoutW = avatar.mode === 'body' ? size * 0.86 : size * 0.72;
    const cutoutH = avatar.mode === 'body' ? size * 1.22 : size * 0.84;
    return (
      <div style={{ width: size, height: size, position: 'relative', overflow: 'visible', background: 'transparent', flexShrink: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatar.displaySrc}
          alt={user.username || 'Profile'}
          style={{
            position: 'absolute',
            left: '50%',
            top: avatar.mode === 'body' ? '10%' : '4%',
            width: cutoutW,
            height: cutoutH,
            objectFit: 'contain',
            objectPosition: 'center top',
            background: 'transparent',
            border: 'none',
            transform: `translateX(calc(-50% + ${frame.x * 0.4}%)) translateY(${frame.y * 0.4}%) scale(${frame.scale})`,
            transformOrigin: 'center top',
            filter: `drop-shadow(0 28px 36px ${theme.shadow}) drop-shadow(0 10px 16px ${theme.cyan}28)`,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ width: size, height: size, borderRadius: radius, display: 'grid', placeItems: 'center', fontSize: size * 0.38, fontWeight: 800, color: '#fff', background: `linear-gradient(135deg, ${theme.orange}, ${theme.blue})`, border: 'none', boxShadow: `0 26px 40px ${theme.shadow}` }}>{fallback}</div>
  );
}

function displayStatNumber(value, { hideZero = true } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  if (hideZero && numeric === 0) return '--';
  return `${numeric}`;
}

function displayDistance(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '--';
  return `${numeric.toFixed(1)} km`;
}

function displayPace(value) {
  if (value == null) return '--';
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '--';
  return `${numeric.toFixed(2)} min/km`;
}

function displayLongestRunMeta(longestRun) {
  if (!longestRun?.date) return '--';
  const minutes = Number(longestRun.runningMinutes || 0);
  const minutesText = Number.isFinite(minutes) && minutes > 0 ? `${minutes.toFixed(0)} min` : '--';
  const date = new Date(longestRun.date);
  const dateText = Number.isNaN(date.getTime())
    ? String(longestRun.date)
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${minutesText} • ${dateText}`;
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
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: compact ? '12px' : '15px', fontWeight: 800, color: item.accent || theme.textHeading, lineHeight: 1 }}>{item.value}</div>
            {item.meta ? <div style={{ marginTop: '3px', fontSize: '10px', color: theme.textMuted, fontWeight: 600 }}>{item.meta}</div> : null}
          </div>
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
  const [wellnessData, setWellnessData] = useState({ entries: [], dailyScores: [], plans: [], plan: null });

  const configuredWellnessApiBase = process.env.NEXT_PUBLIC_WELLNESS_API_BASE || '';
  const API_BASE = configuredWellnessApiBase || (typeof window !== 'undefined'
    ? ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? `${window.location.protocol}//${window.location.hostname}:3004`
      : '')
    : '');

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

  const loadWellnessData = useCallback(async () => {
    if (!user || !API_BASE) return;
    const uid = String(user.id || user.email || user.username || '').trim();
    if (!uid) return;
    try {
      const response = await fetch(`${API_BASE}/wellness/data/${encodeURIComponent(uid)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Unable to load wellness data');
      setWellnessData({
        entries: Array.isArray(data.entries) ? data.entries : [],
        dailyScores: Array.isArray(data.dailyScores) ? data.dailyScores : [],
        plans: Array.isArray(data.plans) ? data.plans : [],
        plan: data.plan || null,
      });
    } catch (_) {
      setWellnessData({ entries: [], dailyScores: [], plans: [], plan: null });
    }
  }, [API_BASE, user]);

  useEffect(() => {
    if (!user) return undefined;
    loadStrategies();
    loadWellnessData();
    const interval = setInterval(loadStrategies, 30000);
    const wellnessInterval = setInterval(loadWellnessData, 30000);
    return () => {
      clearInterval(interval);
      clearInterval(wellnessInterval);
    };
  }, [user, loadStrategies, loadWellnessData]);

  const strategySummary = useMemo(() => buildStrategySummary(strategies), [strategies]);
  const wellnessSummary = useMemo(() => {
    const entries = Array.isArray(wellnessData.entries) ? wellnessData.entries : [];
    const dailyScoresAsc = [...(wellnessData.dailyScores || [])].sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')));
    let runningCumulative = 0;
    const cumulativeSeries = dailyScoresAsc.map((score) => {
      const dayScore = Number(score.totalScore || 0);
      runningCumulative += Number.isFinite(dayScore) ? dayScore : 0;
      return {
        date: String(score.date || ''),
        cumulative: Number(runningCumulative.toFixed(2)),
      };
    });

    const trendPoints = cumulativeSeries.slice(-14).map((point) => ({
      label: point.date.slice(5),
      value: point.cumulative,
    }));

    const latestCumulative = cumulativeSeries[cumulativeSeries.length - 1]?.cumulative ?? 0;
    const maxScoreFromDaily = cumulativeSeries.reduce((best, point) => (
      point.cumulative > best ? point.cumulative : best
    ), latestCumulative);

    const qualifyingRuns = entries
      .filter((entry) => Number(entry.runningDistanceKm || 0) >= 2 && Number(entry.runningMinutes || 0) > 0)
      .map((entry) => Number(entry.runningMinutes || 0) / Math.max(1, Number(entry.runningDistanceKm || 0)));
    const fastestRunPace = qualifyingRuns.length ? Number(Math.min(...qualifyingRuns).toFixed(2)) : null;

    const longestRun = entries
      .map((entry) => ({
        distanceKm: Number(entry.runningDistanceKm || 0),
        runningMinutes: Number(entry.runningMinutes || 0),
        date: entry.date || null,
      }))
      .filter((entry) => Number.isFinite(entry.distanceKm) && entry.distanceKm > 0)
      .sort((left, right) => right.distanceKm - left.distanceKm)[0] || null;

    const runDates = [...new Set(entries
      .filter((entry) => Number(entry.runningDistanceKm || 0) > 0)
      .map((entry) => String(entry.date || ''))
      .filter(Boolean))].sort();
    let longestRunningStreak = 0;
    let streak = 0;
    for (let index = 0; index < runDates.length; index += 1) {
      if (index === 0) {
        streak = 1;
      } else {
        const prev = new Date(runDates[index - 1]);
        const curr = new Date(runDates[index]);
        const diff = Math.round((curr.getTime() - prev.getTime()) / 86400000);
        streak = diff === 1 ? streak + 1 : 1;
      }
      if (streak > longestRunningStreak) longestRunningStreak = streak;
    }

    const activePlan = wellnessData.plan || (wellnessData.plans || []).find((plan) => plan?.status === 'active') || null;
    const currentWellnessScore = Number(latestCumulative.toFixed(1));

    return {
      trendPoints,
      currentWellnessScore,
      maxWellnessScore: Number((maxScoreFromDaily || 0).toFixed(1)),
      fastestRunPace,
      longestRun,
      longestRunningStreak,
      plannedGoals: activePlan ? 1 : 0,
      completedGoals: 0,
    };
  }, [wellnessData]);

  const profileInsights = useMemo(() => ({
    currentWellnessScore: wellnessSummary.currentWellnessScore,
    maxWellnessScore: wellnessSummary.maxWellnessScore,
    fastestRunPace: wellnessSummary.fastestRunPace,
    longestRun: wellnessSummary.longestRun,
    longestRunningStreak: wellnessSummary.longestRunningStreak,
    plannedGoals: wellnessSummary.plannedGoals,
    completedGoals: wellnessSummary.completedGoals,
  }), [wellnessSummary]);

  const wellnessCards = useMemo(() => ([
    { label: 'Wellness score', value: displayStatNumber(profileInsights.currentWellnessScore, { hideZero: false }), accent: theme.blue },
    { label: 'Max Wellness score', value: displayStatNumber(profileInsights.maxWellnessScore, { hideZero: false }), accent: theme.cyan },
    { label: 'Fastest pace', value: displayPace(profileInsights.fastestRunPace), accent: theme.emerald },
    { label: 'Longest running streak', value: `${displayStatNumber(profileInsights.longestRunningStreak)}${displayStatNumber(profileInsights.longestRunningStreak) === '--' ? '' : 'd'}`, accent: theme.orange },
  ]), [profileInsights, theme]);
  const primaryStats = useMemo(() => ([
    { label: 'Wellness score', value: displayStatNumber(profileInsights.currentWellnessScore, { hideZero: false }), accent: theme.blue },
    { label: 'Max Wellness score', value: displayStatNumber(profileInsights.maxWellnessScore, { hideZero: false }), accent: theme.cyan },
    { label: 'Fastest pace', value: displayPace(profileInsights.fastestRunPace), accent: theme.emerald },
    { label: 'Longest run', value: displayDistance(profileInsights.longestRun?.distanceKm), accent: theme.textHeading, meta: displayLongestRunMeta(profileInsights.longestRun) },
    { label: 'Longest running streak', value: `${displayStatNumber(profileInsights.longestRunningStreak)}${displayStatNumber(profileInsights.longestRunningStreak) === '--' ? '' : 'd'}`, accent: theme.orange },
    { label: 'Planned goals', value: displayStatNumber(profileInsights.plannedGoals), accent: theme.orange },
    { label: 'Completed goals', value: displayStatNumber(profileInsights.completedGoals), accent: theme.green },
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
        @media (max-width: 560px) {
          .dashboard-page { padding: 10px !important; }
          .dashboard-title { font-size: 24px !important; }
          .dashboard-panel { border-radius: 18px !important; padding: 12px !important; gap: 10px !important; }
          .dashboard-profile-shell { gap: 8px !important; }
          .dashboard-avatar-wrap { padding: 6px !important; min-height: 180px !important; }
          .dashboard-avatar-glow { width: 120px !important; height: 120px !important; }
          .dashboard-avatar-stage { inset: 18px 12px 0 !important; }
          .dashboard-module-grid button,
          .dashboard-market-modules button {
            padding: 8px 9px !important;
            gap: 3px !important;
            border-radius: 11px !important;
          }
          .dashboard-module-grid button div:nth-child(1),
          .dashboard-market-modules button div:nth-child(1) {
            width: 28px !important;
            height: 28px !important;
            border-radius: 8px !important;
            font-size: 10px !important;
          }
          .dashboard-module-grid button div:nth-child(2),
          .dashboard-market-modules button div:nth-child(2) {
            font-size: 13px !important;
          }
          .dashboard-module-grid button div:nth-child(3),
          .dashboard-market-modules button div:nth-child(3) {
            font-size: 10px !important;
            line-height: 1.25 !important;
          }
        }
        @media (max-width: 1100px) {
          .dashboard-module-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
      `}</style>

      <div style={{ maxWidth: '1320px', margin: '0 auto', display: 'grid', gap: '18px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }} className="dashboard-header">
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.14em', color: theme.textMuted, fontWeight: 800, marginBottom: '8px' }}>Cosmix dashboard</div>
            <h1 style={{ margin: 0, fontSize: '34px', color: theme.textHeading }} className="dashboard-title">Welcome back, {user.username}</h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }} className="dashboard-header-actions">
            <button type="button" onClick={() => router.push('/profile')} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '999px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, color: theme.textHeading, padding: '12px 16px', cursor: 'pointer', boxShadow: `0 14px 32px ${theme.shadow}`, fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              <SettingsIcon color={theme.textHeading} />
              Settings
            </button>
          </div>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.12fr) minmax(320px, 0.88fr)', gap: '16px' }} className="dashboard-top-grid">
          <div style={{ borderRadius: '30px', border: `1px solid ${theme.cardBorder}`, background: `radial-gradient(circle at top left, ${theme.orange}20, transparent 24%), radial-gradient(circle at 78% 16%, ${theme.cyan}16, transparent 22%), linear-gradient(135deg, ${theme.cardBg}, ${theme.cyan}08, ${theme.orange}08)`, padding: '18px', boxShadow: `0 24px 64px ${theme.shadow}`, display: 'grid', gap: '16px' }} className="dashboard-panel">
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: '14px', alignItems: 'stretch' }} className="dashboard-profile-shell">
              <div style={{ borderRadius: '24px', padding: '12px', background: 'transparent', border: 'none', display: 'grid', placeItems: 'center', position: 'relative', overflow: 'hidden', minHeight: '260px' }} className="dashboard-avatar-wrap">
                <div style={{ position: 'absolute', inset: '26px 18px 0', borderRadius: '28px 28px 0 0', background: `linear-gradient(180deg, ${theme.panelBg}, transparent)`, border: `1px solid ${theme.cardBorder}`, borderBottom: 'none', opacity: 0.75 }} className="dashboard-avatar-stage" />
                <div style={{ position: 'absolute', width: '220px', height: '220px', borderRadius: '50%', filter: 'blur(38px)', background: `${theme.blue}44` }} className="dashboard-avatar-glow" />
                <div style={{ position: 'absolute', bottom: '18px', width: '68%', height: '26px', borderRadius: '999px', background: 'rgba(15,23,42,0.26)', filter: 'blur(12px)' }} />
                <Avatar user={user} size={236} theme={theme} />
              </div>

              <div style={{ display: 'grid', alignContent: 'stretch' }} className="dashboard-profile-meta">
                <div style={{ display: 'grid', gap: '6px', marginBottom: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: theme.textMuted }}>Personal cockpit</div>
                  <div style={{ fontSize: '28px', fontWeight: 900, color: theme.textHeading, lineHeight: 1.02 }}>{user.name || user.username}</div>
                  <div style={{ fontSize: '14px', lineHeight: 1.6, color: theme.textSecondary }}>{user.quote || 'Building better decisions, one signal at a time.'}</div>
                </div>
                <MetricList items={primaryStats} theme={theme} compact />
              </div>
            </div>
          </div>

          <div
            style={{ borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '14px', boxShadow: `0 20px 56px ${theme.shadow}`, display: 'grid', gap: '8px', cursor: 'pointer' }}
            className="dashboard-panel"
            role="button"
            tabIndex={0}
            onClick={() => router.push('/wellness')}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') router.push('/wellness');
            }}
          >
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800 }}>Wellness</div>
            </div>

            <LineChart
              points={wellnessSummary.trendPoints}
              theme={theme}
              emptyLabel="Add wellness entries to see your trend"
              color={theme.blue}
              gradientId="wellness-line-fill"
              vivid
              height={156}
              valueAccessor={(point) => Number(point.value || 0)}
              labelAccessor={(point) => String(point.label || '')}
              annotationFormatter={(value) => `${value >= 0 ? '+' : ''}${Number(value || 0).toFixed(1)}`}
            />

            <MetricGrid items={wellnessCards} theme={theme} />
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.18fr) minmax(300px, 0.82fr)', gap: '16px' }} className="dashboard-market-grid">
          <div
            style={{ borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '16px', boxShadow: `0 20px 56px ${theme.shadow}`, display: 'grid', gap: '12px', cursor: 'pointer' }}
            className="dashboard-panel"
            role="button"
            tabIndex={0}
            onClick={() => router.push('/nifty-strategies')}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') router.push('/nifty-strategies');
            }}
          >
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

          <div style={{ borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '16px', boxShadow: `0 20px 56px ${theme.shadow}`, display: 'grid', gap: '12px', alignContent: 'start' }} className="dashboard-panel">

            <div style={{ display: 'grid', gap: '8px' }} className="dashboard-market-modules">
              {tradingDeskModules.map((module) => (
                <button key={module.path} type="button" onClick={() => router.push(module.path)} style={{ textAlign: 'left', borderRadius: '14px', border: `1px solid ${module.accent}44`, background: `linear-gradient(135deg, ${theme.cardBg}, ${module.accent}09)`, padding: '10px 12px', cursor: 'pointer', display: 'grid', gap: '4px', color: theme.textPrimary }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '10px', display: 'grid', placeItems: 'center', fontSize: '11px', fontWeight: 800, color: module.accent, background: `${module.accent}18`, border: `1px solid ${module.accent}30` }}>{module.icon}</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: theme.textHeading }}>{module.title}</div>
                  </div>
                  <div style={{ fontSize: '11px', color: theme.textMuted, lineHeight: 1.35 }}>{module.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section style={{ borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '16px', boxShadow: `0 20px 56px ${theme.shadow}`, display: 'grid', gap: '14px' }} className="dashboard-panel">
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800, marginBottom: '8px' }}>Workspace</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: theme.textHeading }}>Workspace</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }} className="dashboard-module-grid">
            {workspaceModules.map((module) => (
              <button key={module.path} type="button" onClick={() => router.push(module.path)} style={{ textAlign: 'left', borderRadius: '14px', border: `1px solid ${module.accent}55`, background: `linear-gradient(135deg, ${theme.cardBg}, ${module.accent}08)`, padding: '10px', cursor: 'pointer', display: 'grid', gap: '5px', color: theme.textPrimary, boxShadow: `0 8px 20px ${theme.shadow}` }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '10px', display: 'grid', placeItems: 'center', fontSize: '11px', fontWeight: 800, color: module.accent, background: `${module.accent}18`, border: `1px solid ${module.accent}30` }}>{module.icon}</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: theme.textHeading }}>{module.title}</div>
                <div style={{ fontSize: '11px', color: theme.textMuted, lineHeight: 1.3 }}>{module.desc}</div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
