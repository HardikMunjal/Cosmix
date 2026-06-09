import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveAvatarPresentation } from '../lib/avatarProfile';
import { getCachedClientUser, restoreUserSession } from '../lib/auth-client';
import { useTheme } from '../lib/ThemePicker';
import { CosmixLoader, SectionLoadingShell } from '../lib/CosmixLoader';
import { MobileBottomNav } from '../lib/MobileNav';
import { buildStrategySummary, formatCurrency } from '../lib/userInsights';
import NotificationModule from '../modules/dashboard/NotificationModule';
import PostFeedModule from '../modules/dashboard/PostFeedModule';
import { ACTIVITY_METRIC_DEFS as activityMetricDefs, aggregateActivityTotals } from '../lib/activityMetrics';
import { subscribeToWebPush } from '../lib/webPush';

const tradingDeskModules = [
  { icon: 'NT', title: 'Nifty Tracker', desc: 'Track saved strategies, live payoff movement, and execution snapshots.', path: '/nifty-strategies', accent: '#22c55e' },
  { icon: '📋', title: 'Strategy History', desc: 'View all past strategies with start/end dates, duration, and realized P/L.', path: '/strategy-history', accent: '#a78bfa' },
  { icon: 'SB', title: 'Strategy Builder', desc: 'Build option structures and save them back into your running book.', path: '/options-strategy', accent: '#2563eb' },
  { icon: 'OP', title: 'Option Pricing', desc: 'Compare expected option prices across models and expiries.', path: '/expected-option-prices', accent: '#e11d48' },
];

const wellnessClubModules = [
  { title: 'Running Dashboard', path: '/running-analytics', accent: '#38bdf8' },
  { title: 'Leaderboard', path: '/leaderboard', accent: '#f97316' },
  { title: 'Wellness Dashboard', path: '/wellness', accent: '#22c55e' },
  { title: 'Threads', path: '/chat', accent: '#a78bfa' },
  { title: 'Media', path: '/media', accent: '#ec4899' },
];

const niftyClubModules = [
  { title: 'Nifty Tracker', path: '/nifty-strategies', accent: '#22c55e' },
  { title: 'Strategy History', path: '/strategy-history', accent: '#a78bfa' },
  { title: 'Strategy Builder', path: '/options-strategy', accent: '#2563eb' },
  { title: 'Option Pricing', path: '/expected-option-prices', accent: '#e11d48' },
];

function resolveWellnessUserId(user) {
  const id = String(user?.id || '').trim();
  return id || String(user?.email || user?.username || 'default').trim();
}

function sortScoresByDate(scores = []) {
  return [...scores].sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')));
}

function buildCumulativeSeries(scores = []) {
  const ordered = sortScoresByDate(scores);
  let runningCumulative = 0;
  return ordered.map((score) => {
    const dayScore = Number(score.totalScore || 0);
    if (Number.isFinite(dayScore)) {
      runningCumulative += dayScore;
    }
    const directCumulative = Number(score.cumulativeTotalScore);
    const cumulative = Number.isFinite(directCumulative) ? directCumulative : runningCumulative;
    return {
      date: String(score.date || ''),
      cumulative: Number(cumulative.toFixed(2)),
    };
  });
}

function isGenericMonthlyPlanName(value) {
  const label = String(value || '').trim().toLowerCase();
  if (!label) return true;
  if (label === 'active plan') return true;
  if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{4}$/.test(label)) return true;
  return false;
}

const comparisonLineColors = ['#38bdf8', '#14b8a6', '#f97316', '#a855f7', '#ec4899', '#22c55e', '#ef4444'];

function SettingsIcon({ color }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6Z" />
    </svg>
  );
}

function BellIcon({ color }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 17h5l-1.4-1.6a2 2 0 0 1-.5-1.3V10a6 6 0 1 0-12 0v4.1a2 2 0 0 1-.5 1.3L4 17h5" />
      <path d="M9.5 17a2.5 2.5 0 0 0 5 0" />
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

function ClubModuleLink({ module, variant, onNavigate }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      className={`dashboard-club-module-link dashboard-club-module-link--${variant}`}
      onClick={(event) => {
        event.stopPropagation();
        onNavigate(module.path);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        fontSize: '10px',
        fontWeight: 700,
        padding: '6px 8px',
        borderRadius: '999px',
        textAlign: 'center',
        cursor: 'pointer',
        border: `1px solid ${hovered ? module.accent : 'transparent'}`,
        background: hovered ? module.accent : 'rgba(255,255,255,0.12)',
        color: '#fff',
        transition: 'background 0.18s ease, border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease',
        transform: hovered ? 'translateY(-1px)' : 'none',
        boxShadow: hovered ? `0 8px 18px ${module.accent}55` : 'none',
      }}
    >
      {module.title}
    </button>
  );
}

const defaultPostImages = {
  running: 'https://images.unsplash.com/photo-1517430816045-df4b7de11d14?auto=format&fit=crop&w=1200&q=80',
  cycling: 'https://images.unsplash.com/photo-1508606572321-901ea4437072?auto=format&fit=crop&w=1200&q=80',
  yoga: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=80',
  strength: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=80',
  default: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=80',
};

function getDefaultPostImage(post) {
  const type = String(post.activityType || post.title || post.body || '').toLowerCase();
  if (type.includes('run') || type.includes('running') || type.includes('km')) return defaultPostImages.running;
  if (type.includes('cycle') || type.includes('cycling') || type.includes('ride')) return defaultPostImages.cycling;
  if (type.includes('yoga')) return defaultPostImages.yoga;
  if (type.includes('lift') || type.includes('strength') || type.includes('weights') || type.includes('gym')) return defaultPostImages.strength;
  return defaultPostImages.default;
}

const buddyImages = [
  'https://images.unsplash.com/photo-1508606572321-901ea4437072?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1508606572321-901ea4437072?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=1200&q=80',
];

function getBuddyImage(name, index) {
  return buddyImages[index % buddyImages.length];
}

function MiniTrendSparkline({ series = [], theme }) {
  if (!series.length) {
    return <div style={{ fontSize: '12px', color: theme.textMuted }}>No recent performance yet</div>;
  }

  const width = 220;
  const height = 70;
  const values = series.map((point) => Number(point.cumulative || 0));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;
  const pad = { left: 14, right: 14, top: 8, bottom: 16 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const points = series.map((point, index) => {
    const x = pad.left + (index / Math.max(1, series.length - 1)) * plotWidth;
    const y = pad.top + plotHeight - (((Number(point.cumulative || 0) - min) / range) * plotHeight);
    return `${x},${y}`;
  }).join(' ');
  const stroke = theme.blue;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="mini-spark-gradient" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor={theme.blue} stopOpacity="0.24" />
          <stop offset="100%" stopColor={theme.blue} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M${points}`} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <polygon fill="url(#mini-spark-gradient)" points={`${pad.left},${height - pad.bottom} ${points} ${width - pad.right},${height - pad.bottom}`} />
    </svg>
  );
}

function BuddyCard({ buddy, theme, compact = false }) {
  const imageUrl = getBuddyImage(buddy.name || buddy.label || buddy.id || 'buddy', Number(buddy.rank || 0));
  const latestValue = buddy.series?.length ? Number(buddy.series[buddy.series.length - 1].cumulative || 0) : 0;
  return (
    <article className="dashboard-buddy-card" style={{ borderRadius: compact ? '20px' : '24px', border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, overflow: 'hidden', display: 'grid', gap: '14px' }}>
      <div style={{ position: 'relative', minHeight: compact ? '140px' : '170px', overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={`Buddy ${buddy.name || 'profile'}`} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px', background: 'linear-gradient(180deg, transparent, rgba(15,23,42,0.85))' }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff' }}>{buddy.name || buddy.displayPlanName || 'Buddy'}</div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.85)', marginTop: '4px' }}>{buddy.displayPlanName || buddy.planName || 'Performance companion'}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: '10px', padding: '0 14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: theme.textHeading }}>{formatCurrency(latestValue)}</div>
            <div style={{ fontSize: '11px', color: theme.textMuted }}>{`${buddy.series?.length || 0} days of tracked performance`}</div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 12px', borderRadius: '999px', background: `${theme.blue}10`, color: theme.textHeading, fontWeight: 800, fontSize: '11px' }}>#{buddy.rank || '-'}</div>
        </div>
        <MiniTrendSparkline series={buddy.series || []} theme={theme} />
      </div>
    </article>
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

function ComparisonTrendChart({ rows, theme, height = 210, emptyLabel = 'No active wellness comparison data yet', compact = false }) {
  if (!rows.length) {
    return <div style={{ minHeight: `${height}px`, display: 'grid', placeItems: 'center', color: theme.textSecondary, fontSize: '14px' }}>{emptyLabel}</div>;
  }

  const width = compact ? 360 : 640;
  const pad = compact ? { left: 12, right: 16, top: 14, bottom: 26 } : { left: 16, right: 30, top: 18, bottom: 30 };
  const chartHeight = compact ? Math.min(height, 200) : height;
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = chartHeight - pad.top - pad.bottom;
  const allValues = rows.flatMap((row) => (row.series || []).map((point) => Number(point.cumulative || 0))).filter((value) => Number.isFinite(value));
  const min = Math.min(0, ...allValues);
  const max = Math.max(1, ...allValues);
  const range = max - min || 1;
  const maxSeriesLength = Math.max(2, ...rows.map((row) => Math.max(0, row.series?.length || 0)));
  const referenceRow = [...rows].sort((left, right) => (right.series?.length || 0) - (left.series?.length || 0))[0] || rows[0];
  const xFor = (position) => pad.left + ((position / Math.max(1, maxSeriesLength - 1)) * plotWidth);
  const yFor = (value) => pad.top + plotHeight - ((((Number(value) || 0) - min) / range) * plotHeight);
  const zeroY = yFor(0);
  const labelStep = Math.max(1, Math.ceil(((referenceRow?.series?.length || 1) / 5)));
  const finishX = width - pad.right;

  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      <div className="dashboard-chart-scroll">
      <svg viewBox={`0 0 ${width} ${chartHeight}`} preserveAspectRatio={compact ? 'xMidYMid meet' : 'none'} style={{ width: '100%', minWidth: compact ? `${width}px` : undefined, height: `${chartHeight}px`, display: 'block' }}>
        <defs>
          <linearGradient id="buddy-race-grid-glow" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(34,197,94,0.18)" />
            <stop offset="50%" stopColor="rgba(6,182,212,0.08)" />
            <stop offset="100%" stopColor="rgba(245,158,11,0.02)" />
          </linearGradient>
          <filter id="buddy-race-line-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect x={pad.left} y={pad.top} width={plotWidth} height={plotHeight} rx="18" fill="url(#buddy-race-grid-glow)" opacity="0.55" />
        <line x1={pad.left} y1={zeroY} x2={width - pad.right} y2={zeroY} stroke={theme.graphGridLine} strokeDasharray="5 4" />
        <line x1={finishX} y1={pad.top} x2={finishX} y2={chartHeight - pad.bottom} stroke={theme.textHeading} strokeOpacity="0.22" strokeDasharray="6 6" />
        {(referenceRow?.series || []).map((point, index) => {
          if (index !== 0 && index !== referenceRow.series.length - 1 && index % labelStep !== 0) return null;
          const alignedIndex = (maxSeriesLength - referenceRow.series.length) + index;
          const x = xFor(alignedIndex);
          return (
            <g key={`${point.date}-${index}`}>
              <line x1={x} y1={pad.top} x2={x} y2={chartHeight - pad.bottom} stroke={theme.graphGridLine} strokeOpacity="0.22" />
              <text x={x} y={chartHeight - 8} textAnchor="middle" fill={theme.textMuted} fontSize={compact ? '9' : '10'}>{String(point.date || '').slice(5)}</text>
            </g>
          );
        })}
        {rows.map((row) => {
          const startOffset = maxSeriesLength - row.series.length;
          const points = row.series.map((point, index) => `${xFor(startOffset + index)},${yFor(point.cumulative)}`).join(' ');
          const lastPoint = row.series[row.series.length - 1] || null;
          if (!points || !lastPoint) return null;
          const lastX = xFor(startOffset + row.series.length - 1);
          const lastY = yFor(lastPoint.cumulative);
          const badgeLabel = String(row.rank || '');
          return (
            <g key={row.id}>
              <polyline fill="none" stroke={row.color} strokeWidth={row.isSelf ? '4.2' : '2.8'} strokeLinecap="round" strokeLinejoin="round" points={points} opacity={row.isSelf ? 1 : 0.94} filter="url(#buddy-race-line-glow)" />
              <circle cx={lastX} cy={lastY} r={row.isSelf ? '8' : '7'} fill={row.color} stroke="#fff" strokeOpacity="0.9" strokeWidth="1.4" />
              <text x={lastX} y={lastY + 3} textAnchor="middle" fill="#fff" fontSize="9" fontWeight="900">{badgeLabel}</text>
              <g>
                <line x1={lastX} y1={lastY - 10} x2={lastX} y2={Math.max(pad.top, lastY - 18)} stroke={row.color} strokeOpacity="0.8" />
              </g>
            </g>
          );
        })}
        <text x={finishX - 2} y={pad.top - 4} textAnchor="end" fill={theme.textMuted} fontSize="10" fontWeight="800">Finish</text>
      </svg>
      </div>

      <div className="dashboard-buddy-legend" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {rows.map((row) => (
          <div key={`${row.id}-legend`} className="dashboard-buddy-legend-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '11px', color: theme.textSecondary, fontWeight: 700, padding: '6px 10px', borderRadius: '999px', background: `${row.color}10`, border: `1px solid ${row.color}33`, maxWidth: '100%' }}>
            <span style={{ minWidth: '18px', height: '18px', borderRadius: '999px', background: row.color, color: '#fff', display: 'inline-grid', placeItems: 'center', fontSize: '10px', fontWeight: 900, flexShrink: 0 }}>{row.rank}</span>
            <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: row.color, boxShadow: `0 0 0 3px ${row.color}22`, flexShrink: 0 }} />
            <span style={{ color: theme.textHeading, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.displayPlanName || row.planName || row.label || row.name}</span>
            <span style={{ color: theme.textMuted, flexShrink: 0 }}>{row.isSelf ? '(you)' : ''}</span>
            <span style={{ flexShrink: 0 }}>{`${Number(row.current || 0).toFixed(1)}`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityFaceoffChart({ rows, theme, height = 320, emptyLabel = 'No activity comparison data yet', compact = false }) {
  if (!rows.length) {
    return <div style={{ minHeight: `${height}px`, display: 'grid', placeItems: 'center', color: theme.textSecondary, fontSize: '14px' }}>{emptyLabel}</div>;
  }

  const metrics = activityMetricDefs.map((metric) => ({
    ...metric,
    values: rows.map((row) => ({
      id: row.id,
      label: row.displayPlanName || row.label || row.name,
      color: row.color,
      value: Number(row.activityTotals?.[metric.key] || 0),
    })),
  })).filter((metric) => metric.values.some((point) => point.value > 0));

  if (!metrics.length) {
    return <div style={{ minHeight: `${height}px`, display: 'grid', placeItems: 'center', color: theme.textSecondary, fontSize: '14px' }}>{emptyLabel}</div>;
  }

  const maxValue = Math.max(1, ...metrics.flatMap((metric) => metric.values.map((point) => point.value)));

  if (compact) {
    return (
      <div className="dashboard-activity-mobile" style={{ display: 'grid', gap: '12px' }}>
        {metrics.map((metric) => (
          <div key={metric.key} style={{ borderRadius: '16px', border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, padding: '12px 14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: theme.textHeading, marginBottom: '10px' }}>{metric.label}</div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {metric.values.map((point) => (
                <div key={`${metric.key}-${point.id}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '4px', fontSize: '11px' }}>
                    <span style={{ color: theme.textHeading, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{point.label}</span>
                    <span style={{ color: theme.textMuted, fontWeight: 800, flexShrink: 0 }}>{`${point.value.toFixed(0)}m`}</span>
                  </div>
                  <div style={{ height: '8px', borderRadius: '999px', background: `${theme.cardBorder}`, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(4, (point.value / maxValue) * 100)}%`, height: '100%', borderRadius: '999px', background: point.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const width = 760;
  const leftLabelWidth = 128;
  const rightPad = 54;
  const groupGap = 16;
  const barHeight = 9;
  const barGap = 4;
  const groupHeights = metrics.map((metric) => (metric.values.length * barHeight) + ((metric.values.length - 1) * barGap) + 18);
  const totalHeight = Math.max(height, 34 + groupHeights.reduce((sum, value) => sum + value + groupGap, 0));
  const chartRight = width - rightPad;
  const barAreaWidth = chartRight - leftLabelWidth;
  let yCursor = 28;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${totalHeight}`} preserveAspectRatio="xMinYMin meet" style={{ width: '100%', minWidth: `${width}px`, height: `${totalHeight}px`, display: 'block' }}>
        <rect x="0" y="0" width={width} height={totalHeight} rx="18" fill="rgba(15,23,42,0.25)" />
        {metrics.map((metric, metricIndex) => {
          const groupStartY = yCursor;
          const groupHeight = groupHeights[metricIndex];
          const baselineY = groupStartY + 14;
          yCursor += groupHeight + groupGap;
          return (
            <g key={metric.key}>
              <text x="10" y={baselineY} fill={theme.textHeading} fontSize="12" fontWeight="800">{metric.label}</text>
              <line x1={leftLabelWidth} y1={groupStartY + groupHeight} x2={chartRight} y2={groupStartY + groupHeight} stroke={theme.graphGridLine} strokeOpacity="0.35" />
              {metric.values.map((point, pointIndex) => {
                const y = baselineY + 6 + pointIndex * (barHeight + barGap);
                const barWidth = (point.value / maxValue) * barAreaWidth;
                const textX = Math.min(chartRight + 4, leftLabelWidth + barWidth + 4);
                return (
                  <g key={`${metric.key}-${point.id}`}>
                    <rect x={leftLabelWidth} y={y} width={Math.max(2, barWidth)} height={barHeight} rx="5" fill={point.color} opacity="0.92" />
                    <text x={textX} y={y + barHeight - 1} fill={theme.textSecondary} fontSize="10" fontWeight="700">{`${point.value.toFixed(0)}m`}</text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { theme } = useTheme();
  const [user, setUser] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [strategies, setStrategies] = useState([]);
  const [wellnessData, setWellnessData] = useState({ entries: [], dailyScores: [], plans: [], plan: null });
  const [buddyTrendRows, setBuddyTrendRows] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [serverNotifications, setServerNotifications] = useState([]);
  const [feedPosts, setFeedPosts] = useState([]);
  const [chatBootstrap, setChatBootstrap] = useState({ incomingRequests: [], groups: [] });
  const [activeTab, setActiveTab] = useState('home');
  const [wellnessLoading, setWellnessLoading] = useState(false);
  const [wellnessReady, setWellnessReady] = useState(false);
  const [strategiesLoading, setStrategiesLoading] = useState(false);
  const [strategiesReady, setStrategiesReady] = useState(false);
  const [buddiesLoading, setBuddiesLoading] = useState(false);
  const [buddiesReady, setBuddiesReady] = useState(false);
  const [isNarrowScreen, setIsNarrowScreen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const syncViewport = () => setIsNarrowScreen(window.innerWidth <= 720);
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  const configuredWellnessApiBase = process.env.NEXT_PUBLIC_WELLNESS_API_BASE || '';
  const notificationsApiBase = '/api/notifications';
  const postsApiBase = '/api/posts';
  const API_BASE = configuredWellnessApiBase || (typeof window !== 'undefined'
    ? ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? `${window.location.protocol}//${window.location.hostname}:3004`
      : '')
    : '');

  useEffect(() => {
    const cached = getCachedClientUser();
    if (cached) {
      setUser(cached);
    }

    let active = true;
    restoreUserSession(router, setUser).finally(() => {
      if (active) setSessionReady(true);
    });

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!user?.username) return;
    void subscribeToWebPush(user.username);
  }, [user?.username]);

  useEffect(() => {
    if (!router.isReady) return;
    const tabParam = String(router.query.tab || 'home').toLowerCase();
    if (['home', 'posts', 'buddies'].includes(tabParam)) {
      setActiveTab(tabParam);
      return;
    }
    setActiveTab('home');
  }, [router.isReady, router.query.tab]);

  const loadStrategies = useCallback(async () => {
    setStrategiesLoading(true);
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
    } finally {
      setStrategiesLoading(false);
      setStrategiesReady(true);
    }
  }, []);

  const loadWellnessData = useCallback(async () => {
    if (!user) return;
    const uid = resolveWellnessUserId(user);
    if (!uid) return;
    setWellnessLoading(true);
    try {
      const response = await fetch(`${API_BASE}/wellness/data/${encodeURIComponent(uid)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setWellnessData({ entries: [], dailyScores: [], plans: [], plan: null });
        return;
      }
      setWellnessData({
        entries: Array.isArray(data.entries) ? data.entries : [],
        dailyScores: Array.isArray(data.dailyScores) ? data.dailyScores : [],
        plans: Array.isArray(data.plans) ? data.plans : [],
        plan: data.plan || null,
      });
    } catch (_) {
      setWellnessData({ entries: [], dailyScores: [], plans: [], plan: null });
    } finally {
      setWellnessLoading(false);
      setWellnessReady(true);
    }
  }, [API_BASE, user]);

  const loadBuddyTrendRows = useCallback(async () => {
    const selfUserId = resolveWellnessUserId(user);
    const selfUsername = String(user?.username || '').trim();
    if (!selfUserId || !selfUsername) {
      setBuddyTrendRows([]);
      setBuddiesLoading(false);
      setBuddiesReady(true);
      return;
    }

    setBuddiesLoading(true);
    try {
      const chatBase = '/chat-api/chat';
      const bootstrapResponse = await fetch(`${chatBase}/bootstrap?username=${encodeURIComponent(selfUsername)}`);
      const bootstrapData = await bootstrapResponse.json().catch(() => ({}));
      const friends = Array.isArray(bootstrapData?.friends) ? bootstrapData.friends : [];
      setChatBootstrap({
        incomingRequests: Array.isArray(bootstrapData?.incomingRequests) ? bootstrapData.incomingRequests : [],
        groups: Array.isArray(bootstrapData?.groups) ? bootstrapData.groups : [],
      });

      const friendUsernames = friends
        .map((username) => String(username || '').trim())
        .filter(Boolean)
        .filter((username) => username.toLowerCase() !== selfUsername.toLowerCase())
        .slice(0, 8);

      let participants = friendUsernames.map((username) => ({
        username,
        displayName: username,
        userId: username,
      }));

      try {
        const batchResponse = await fetch('/api/chat/buddy-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ usernames: friendUsernames }),
        });
        const batchData = await batchResponse.json().catch(() => ({}));
        const lookup = new Map(
          (Array.isArray(batchData?.results) ? batchData.results : [])
            .map((entry) => [String(entry?.username || '').toLowerCase(), entry]),
        );
        participants = friendUsernames.map((username) => {
          const match = lookup.get(username.toLowerCase());
          return {
            username,
            displayName: String(match?.name || match?.username || username).trim(),
            userId: String(match?.id || match?.email || match?.username || username).trim(),
          };
        });
      } catch (_) {
        // Fall back to username-based ids when batch lookup fails.
      }

      const nextRows = await Promise.all(participants.map(async (participant) => {
        try {
          const summaryResponse = await fetch(`${API_BASE}/wellness/plan-summary/${encodeURIComponent(participant.userId)}`);
          const data = await summaryResponse.json().catch(() => ({}));
          if (!summaryResponse.ok || !data?.hasActivePlan || !Array.isArray(data.series) || !data.series.length) return null;
          const series = [...data.series]
            .sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')))
            .slice(-14)
            .map((point) => ({ date: String(point.date || ''), cumulative: Number(point.cumulative || 0) }));
          if (!series.length) return null;
          const activityTotals = data?.activityTotals && typeof data.activityTotals === 'object'
            ? data.activityTotals
            : null;
          return {
            id: participant.userId,
            name: participant.displayName,
            planName: String(data?.plan?.name || ''),
            current: Number(data.cumulativeTotal || series[series.length - 1]?.cumulative || 0),
            activityTotals,
            series,
            isSelf: false,
          };
        } catch (_) {
          return null;
        }
      }));

      setBuddyTrendRows(nextRows.filter(Boolean));
    } catch (_) {
      setBuddyTrendRows([]);
    } finally {
      setBuddiesLoading(false);
      setBuddiesReady(true);
    }
  }, [API_BASE, user]);

  const loadServerNotifications = useCallback(async () => {
    if (!user) return;
    const baseUid = resolveWellnessUserId(user);
    if (!baseUid) return;

    try {
      const response = await fetch(`${notificationsApiBase}/${encodeURIComponent(baseUid)}`, { credentials: 'include' });
      const data = await response.json();
      if (response.ok && Array.isArray(data.notifications)) {
        setServerNotifications(data.notifications);
      } else {
        setServerNotifications([]);
      }
    } catch (_) {
      setServerNotifications([]);
    }
  }, [notificationsApiBase, user]);

  const loadFeedPosts = useCallback(async () => {
    if (!user) return;
    const baseUid = resolveWellnessUserId(user);
    if (!baseUid) return;

    try {
      const response = await fetch(`${postsApiBase}/${encodeURIComponent(baseUid)}`, { credentials: 'include' });
      const data = await response.json();
      if (response.ok && Array.isArray(data.posts)) {
        setFeedPosts(data.posts);
      } else {
        setFeedPosts([]);
      }
    } catch (_) {
      setFeedPosts([]);
    }
  }, [postsApiBase, user]);

  const markPostViewed = useCallback(async (postId) => {
    if (!postId || !user) return;
    const baseUid = resolveWellnessUserId(user);
    if (!baseUid) return;
    setFeedPosts((current) => current.map((post) => (
      post.id === postId ? { ...post, seen: true, viewedBy: [baseUid] } : post
    )));
    try {
      await fetch(
        `${postsApiBase}/${encodeURIComponent(baseUid)}/viewed/${encodeURIComponent(postId)}`,
        { method: 'PUT', credentials: 'include' },
      );
    } catch (_) {
      // Ignore view tracking failures.
    }
  }, [postsApiBase, user]);

  const likePost = useCallback(async (postId) => {
    if (!postId) return;
    try {
      const response = await fetch(`${postsApiBase}/${encodeURIComponent(postId)}/like`, { method: 'PUT', credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!data.added) return;
      setFeedPosts((current) => current.map((post) => (
        post.id === postId
          ? {
            ...post,
            likes: Number(data.likes) || 0,
            likedByMe: true,
          }
          : post
      )));
    } catch (_) {
      // Ignore like failures.
    }
  }, [postsApiBase]);

  const openFitstagram = useCallback((item) => {
    const baseUid = resolveWellnessUserId(user);
    if (item?.id && baseUid) {
      fetch(
        `${notificationsApiBase}/${encodeURIComponent(baseUid)}/viewed/${encodeURIComponent(item.id)}`,
        { method: 'PUT', credentials: 'include' },
      ).catch(() => {});
      setServerNotifications((current) => current.filter((n) => n.id !== item.id));
    }
    setShowNotifications(false);
    setActiveTab('posts');
    if (router.isReady) {
      router.push({ pathname: '/dashboard', query: { tab: 'posts' } }, undefined, { shallow: true });
    }
  }, [notificationsApiBase, router, user]);

  useEffect(() => {
    if (!user) return undefined;
    loadStrategies();
    loadServerNotifications();
    return undefined;
  }, [user, loadStrategies, loadServerNotifications]);

  useEffect(() => {
    if (!user) return undefined;
    if (activeTab === 'home') {
      loadWellnessData();
    }
    if (activeTab === 'buddies') {
      loadBuddyTrendRows();
    }
    if (activeTab === 'posts') {
      loadFeedPosts();
      loadServerNotifications();
    }
    return undefined;
  }, [user, activeTab, loadWellnessData, loadBuddyTrendRows, loadFeedPosts, loadServerNotifications]);

  useEffect(() => {
    if (!user || activeTab !== 'posts') return undefined;
    const timer = setInterval(() => {
      loadFeedPosts();
      loadServerNotifications();
    }, 30000);
    return () => clearInterval(timer);
  }, [user, activeTab, loadFeedPosts, loadServerNotifications]);

  const strategySummary = useMemo(() => buildStrategySummary(strategies), [strategies]);
  const wellnessSummary = useMemo(() => {
    const entries = Array.isArray(wellnessData.entries) ? wellnessData.entries : [];
    const cumulativeSeries = buildCumulativeSeries(wellnessData.dailyScores || []);

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

  const comparisonTrendRows = useMemo(() => {
    const selfSeries = buildCumulativeSeries(wellnessData.dailyScores || []).slice(-14);
    const selfRows = selfSeries.length && user ? [{
      id: resolveWellnessUserId(user),
      name: String(user?.name || user?.username || 'You'),
      planName: String(wellnessData?.plan?.name || ''),
      activityTotals: aggregateActivityTotals(wellnessData.entries || []),
      current: Number(selfSeries[selfSeries.length - 1]?.cumulative || 0),
      series: selfSeries,
      isSelf: true,
    }] : [];

    const withColors = [...selfRows, ...buddyTrendRows].map((row, index) => ({
      ...row,
      label: row.isSelf ? 'You' : row.name,
      displayPlanName: isGenericMonthlyPlanName(row.planName)
        ? (row.isSelf ? String(user?.name || user?.username || 'You') : String(row.name || 'Rival'))
        : String(row.planName || row.name || row.label || 'Rival'),
      color: row.isSelf ? theme.orange : comparisonLineColors[(index - selfRows.length + comparisonLineColors.length) % comparisonLineColors.length],
    }));

    return [...withColors]
      .sort((left, right) => Number(right.current || 0) - Number(left.current || 0))
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }, [buddyTrendRows, theme.orange, user, wellnessData.dailyScores, wellnessData?.plan?.name]);

  const showdownTitle = useMemo(() => {
    const selfRow = comparisonTrendRows.find((row) => row.isSelf) || null;
    const rivalRow = comparisonTrendRows.find((row) => !row.isSelf) || null;
    const selfLabel = String(selfRow?.displayPlanName || selfRow?.planName || selfRow?.name || 'You');
    if (!rivalRow) return `${selfLabel} Arena`;
    const rivalLabel = String(rivalRow?.displayPlanName || rivalRow?.planName || rivalRow?.name || 'Rival');
    return `${rivalLabel} vs ${selfLabel}`;
  }, [comparisonTrendRows]);

  const activityShowdownRows = useMemo(() => (
    comparisonTrendRows
      .filter((row) => row.activityTotals && Object.values(row.activityTotals).some((value) => Number(value || 0) > 0))
      .slice(0, 4)
  ), [comparisonTrendRows]);

  const buddyRows = useMemo(() => comparisonTrendRows.filter((row) => !row.isSelf), [comparisonTrendRows]);
  const displayedBuddyRows = useMemo(() => {
    if (buddyRows.length > 0) return buddyRows;
    return [
      {
        id: 'buddy-sample-1',
        name: 'Aisha',
        displayPlanName: 'Morning run challenge',
        current: 88,
        series: [
          { date: 'Day 1', cumulative: 24 },
          { date: 'Day 4', cumulative: 42 },
          { date: 'Day 7', cumulative: 61 },
          { date: 'Day 10', cumulative: 78 },
          { date: 'Day 14', cumulative: 88 },
        ],
        rank: 1,
        color: theme.blue,
        activityTotals: { runningDistanceKm: 13.4, runningMinutes: 98 },
        isSelf: false,
      },
      {
        id: 'buddy-sample-2',
        name: 'Mia',
        displayPlanName: 'Cycle power streak',
        current: 72,
        series: [
          { date: 'Day 1', cumulative: 18 },
          { date: 'Day 4', cumulative: 35 },
          { date: 'Day 7', cumulative: 52 },
          { date: 'Day 10', cumulative: 64 },
          { date: 'Day 14', cumulative: 72 },
        ],
        rank: 2,
        color: theme.cyan,
        activityTotals: { cyclingDistanceKm: 34.8, runningMinutes: 42 },
        isSelf: false,
      },
      {
        id: 'buddy-sample-3',
        name: 'Noah',
        displayPlanName: 'Strength flow',
        current: 58,
        series: [
          { date: 'Day 1', cumulative: 12 },
          { date: 'Day 4', cumulative: 24 },
          { date: 'Day 7', cumulative: 38 },
          { date: 'Day 10', cumulative: 49 },
          { date: 'Day 14', cumulative: 58 },
        ],
        rank: 3,
        color: theme.orange,
        activityTotals: { strengthSessions: 4, runningMinutes: 0 },
        isSelf: false,
      },
    ];
  }, [buddyRows, theme.blue, theme.cyan, theme.orange]);

  const notifications = useMemo(() => {
    if (Array.isArray(serverNotifications) && serverNotifications.length > 0) {
      return serverNotifications.map((item) => ({
        id: item.id,
        type: item.type || 'notification',
        title: item.title,
        description: item.description,
        postId: item.postId,
        linkTab: item.linkTab,
        timeLabel: item.createdAt ? `${Math.max(0, Math.round((Date.now() - new Date(item.createdAt).getTime()) / 3600000))}h ago` : 'recently',
        actionLabel: item.type === 'fitstagram' ? 'Open Fitstagram' : 'View',
      }));
    }

    const items = [];

    // Real incoming friend requests
    chatBootstrap.incomingRequests.forEach((req) => {
      const fromUser = typeof req === 'string' ? req : (req?.from || req?.username || String(req));
      items.push({
        id: `friend-req-${fromUser}`,
        type: 'friend_request',
        title: `${fromUser} sent you a buddy request`,
        description: 'Accept to compare daily wellness streaks and leaderboard ranks.',
        timeLabel: 'recently',
        actionLabel: 'Open Chat',
      });
    });

    // Group notifications — show first few active groups
    chatBootstrap.groups.slice(0, 2).forEach((group) => {
      const groupName = typeof group === 'string' ? group : (group?.name || group?.label || 'a group');
      items.push({
        id: `group-${typeof group === 'string' ? group : group?.id}`,
        type: 'chat_message',
        title: `Activity in ${groupName}`,
        description: 'Open chat to see the latest messages.',
        timeLabel: 'recently',
        actionLabel: 'Open Chat',
      });
    });

    // Fallback if no real data yet
    if (items.length === 0 && buddyTrendRows.length > 0) {
      items.push({
        id: 'chat-fallback',
        type: 'chat_message',
        title: 'New chat message in your buddy group',
        description: 'Open chat to reply and keep your training circle active.',
        timeLabel: 'just now',
      });
    }

    return items.slice(0, 5);
  }, [chatBootstrap, buddyTrendRows, serverNotifications]);

  const buddyActivityItems = useMemo(() => {
    const items = buddyTrendRows.slice(0, 3).map((row) => {
      const distanceKm = Number(row.activityTotals?.runningDistanceKm || 0);
      const minutes = Number(row.activityTotals?.runningMinutes || 0);
      const description = distanceKm > 0
        ? `${distanceKm.toFixed(1)} km in ${minutes || '--'} min.`
        : `${minutes > 0 ? `${minutes} min` : 'A fresh session'} of wellness activity.`;
      return {
        id: row.id,
        avatar: String(row.name || 'B').slice(0, 1).toUpperCase(),
        title: `${row.name || 'Buddy'} just posted a new run`,
        description: `Completed ${description}`,
      };
    });

    if (items.length > 0) return items;
    return [{
      id: 'sample-activity',
      avatar: 'H',
      title: 'Hardi just made a record',
      description: 'Hardi just made a record of 8.3 km in 68 min with image.',
    }];
  }, [buddyTrendRows]);

  const notificationCount = notifications.length;

  const showWellnessSectionLoader = wellnessLoading && !wellnessReady;
  const showStrategiesSectionLoader = strategiesLoading && !strategiesReady;
  const showBuddiesSectionLoader = buddiesLoading && !buddiesReady;

  if (!sessionReady || !user) {
    return (
      <CosmixLoader
        variant="full"
        theme={theme}
        label="Loading dashboard"
        sublabel="Preparing your wellness and market cockpit..."
      />
    );
  }

  return (
    <div style={{ minHeight: '100vh', padding: '24px', background: theme.pageBg, color: theme.textPrimary, fontFamily: theme.font }} className="dashboard-page">
      <style>{`
        * { box-sizing: border-box; }
        html, body, #__next { min-height: 100%; margin: 0; }
        .dashboard-tab-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin-top: 16px;
          padding: 6px;
          border-radius: 18px;
          background: rgba(15,23,42,0.42);
          border: 1px solid rgba(148,163,184,0.2);
        }
        .dashboard-tab-btn {
          appearance: none;
          border: 1px solid transparent;
          border-radius: 14px;
          background: transparent;
          color: inherit;
          padding: 11px 12px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 800;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          transition: background 0.15s, border-color 0.15s, transform 0.12s;
        }
        .dashboard-tab-btn.is-active {
          background: rgba(59,130,246,0.2);
          border-color: rgba(59,130,246,0.45);
          box-shadow: 0 8px 20px rgba(59,130,246,0.18);
        }
        .dashboard-tab-icon { font-size: 18px; line-height: 1; }
        .dashboard-tab-label { letter-spacing: 0.04em; }
        @media (max-width: 1024px) {
          .dashboard-top-grid, .dashboard-market-grid, .dashboard-lower-grid { grid-template-columns: 1fr !important; }
          .dashboard-header { align-items: flex-start !important; }
          .dashboard-profile-shell { grid-template-columns: 1fr !important; }
          .dashboard-profile-meta { align-content: start !important; }
        }
        @media (max-width: 720px) {
          .dashboard-page { padding: 12px 12px 88px !important; }
          .dashboard-buddies-stack { gap: 12px !important; }
          .dashboard-buddy-grid { grid-template-columns: 1fr !important; gap: 12px !important; }
          .dashboard-buddies-title { font-size: 20px !important; }
          .dashboard-buddy-legend { flex-direction: column; align-items: stretch; }
          .dashboard-buddy-legend-chip { width: 100%; }
          .dashboard-chart-scroll {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            margin: 0 -2px;
            padding: 0 2px;
          }
          .dashboard-buddy-activity-row { min-width: 0; }
          .dashboard-buddy-activity-text { min-width: 0; overflow: hidden; }
          .dashboard-leaderboard-link {
            width: 100%;
            justify-content: center;
            margin-top: 4px;
          }
          .dashboard-top-shell {
            display: grid !important;
            gap: 10px !important;
            padding: 12px 14px !important;
            border-radius: 18px !important;
            border: 1px solid rgba(148,163,184,0.18) !important;
            background: linear-gradient(135deg, rgba(15,23,42,0.92), rgba(30,41,59,0.78)) !important;
            box-shadow: 0 12px 32px rgba(0,0,0,0.22) !important;
          }
          .dashboard-header {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) auto !important;
            align-items: center !important;
            gap: 10px !important;
            margin: 0 !important;
          }
          .dashboard-header-intro { min-width: 0 !important; }
          .dashboard-header-eyebrow { margin-bottom: 4px !important; font-size: 10px !important; }
          .dashboard-title { font-size: 22px !important; line-height: 1.1 !important; }
          .dashboard-header-actions {
            width: auto !important;
            order: 0 !important;
            gap: 8px !important;
            flex-wrap: nowrap !important;
          }
          .dashboard-header-actions button {
            min-width: 44px !important;
            min-height: 44px !important;
            padding: 10px !important;
          }
          .dashboard-tab-row {
            position: sticky;
            top: 0;
            z-index: 40;
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 6px !important;
            margin-top: 0 !important;
            padding: 6px !important;
            border-radius: 16px !important;
            background: rgba(15,23,42,0.55) !important;
            border: 1px solid rgba(148,163,184,0.18) !important;
            backdrop-filter: blur(10px);
          }
          .dashboard-tab-btn {
            min-width: 0 !important;
            width: 100% !important;
            padding: 10px 6px !important;
            font-size: 11px !important;
          }
          .dashboard-tab-icon { font-size: 16px !important; }
          .dashboard-module-grid, .dashboard-scorecard-grid, .dashboard-market-modules { grid-template-columns: 1fr !important; }
          .dashboard-club-grid { grid-template-columns: 1fr !important; }
          .dashboard-profile-shell {
            grid-template-columns: 88px minmax(0, 1fr) !important;
            gap: 12px !important;
            align-items: start !important;
          }
          .dashboard-avatar-wrap {
            min-height: 0 !important;
            padding: 4px !important;
            align-self: start !important;
          }
          .dashboard-avatar-glow { width: 72px !important; height: 72px !important; }
          .dashboard-avatar-stage { display: none !important; }
          .dashboard-profile-meta .dashboard-profile-name { font-size: 20px !important; }
          .dashboard-profile-meta .dashboard-profile-quote { font-size: 12px !important; line-height: 1.45 !important; }
        }
        @media (max-width: 560px) {
          .dashboard-page { padding: 10px 10px 88px !important; }
          .dashboard-buddies-title { font-size: 18px !important; }
          .dashboard-title { font-size: 20px !important; }
          .dashboard-panel { border-radius: 18px !important; padding: 12px !important; gap: 10px !important; }
          .dashboard-profile-shell { gap: 8px !important; }
          .dashboard-avatar-wrap { padding: 2px !important; }
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
        .dashboard-club-module-link {
          appearance: none;
          font-family: inherit;
          width: 100%;
        }
        .dashboard-club-module-link:focus-visible {
          outline: 2px solid rgba(255, 255, 255, 0.85);
          outline-offset: 2px;
        }
      `}</style>

      <div style={{ maxWidth: '1320px', margin: '0 auto', display: 'grid', gap: '18px' }}>
        <div className="dashboard-top-shell">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }} className="dashboard-header">
          <div className="dashboard-header-intro">
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.14em', color: theme.textMuted, fontWeight: 800, marginBottom: '8px' }} className="dashboard-header-eyebrow">Cosmix dashboard</div>
            <h1 style={{ margin: 0, fontSize: '34px', color: theme.textHeading }} className="dashboard-title">Welcome back, {user.username}</h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }} className="dashboard-header-actions">
            {/* Notifications — standalone pill */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowNotifications((v) => !v)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', borderRadius: '999px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, color: theme.textHeading, padding: '10px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.09em', boxShadow: `0 4px 14px ${theme.shadow}` }}
              >
                <BellIcon color={theme.textHeading} />
                <span style={{ minWidth: '22px', height: '22px', borderRadius: '999px', display: 'inline-grid', placeItems: 'center', background: notificationCount > 0 ? theme.orange : theme.cardBorder, color: notificationCount > 0 ? '#fff' : theme.textMuted, fontSize: '11px', fontWeight: 900 }}>{notificationCount}</span>
              </button>
            </div>

            {/* Settings — separate standalone pill */}
            <button
              type="button"
              onClick={() => { setShowNotifications(false); router.push('/settings'); }}
              aria-label="Open settings"
              title="Settings"
              className="dashboard-settings-icon-btn"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', borderRadius: '14px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, color: theme.textHeading, padding: 0, cursor: 'pointer', boxShadow: `0 4px 14px ${theme.shadow}` }}
            >
              <SettingsIcon color={theme.textHeading} />
            </button>
          </div>
        </header>
        </div>

        {showNotifications ? (
          <NotificationModule
            theme={theme}
            notifications={notifications}
            onOpenChat={() => router.push('/chat')}
            onOpenProfile={() => router.push('/profile')}
            onOpenFitstagram={openFitstagram}
          />
        ) : null}

        <div className="dashboard-tab-row" role="tablist" aria-label="Dashboard sections">
          {[
            { id: 'home', label: 'Home', icon: '🏠' },
            { id: 'posts', label: 'Fitstagram', icon: '📷' },
            { id: 'buddies', label: 'Buddies', icon: '👥' },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`dashboard-tab-btn${isActive ? ' is-active' : ''}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (router.isReady) {
                    router.push({ pathname: '/dashboard', query: { ...router.query, tab: tab.id } }, undefined, { shallow: true });
                  }
                }}
              >
                <span className="dashboard-tab-icon" aria-hidden="true">{tab.icon}</span>
                <span className="dashboard-tab-label">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <section style={{ display: activeTab === 'home' ? 'grid' : 'none', gridTemplateColumns: 'minmax(0, 1.12fr) minmax(320px, 0.88fr)', gap: '16px' }} className="dashboard-top-grid">
          <div style={{ borderRadius: '30px', border: `1px solid ${theme.cardBorder}`, background: `radial-gradient(circle at top left, ${theme.orange}20, transparent 24%), radial-gradient(circle at 78% 16%, ${theme.cyan}16, transparent 22%), linear-gradient(135deg, ${theme.cardBg}, ${theme.cyan}08, ${theme.orange}08)`, padding: '18px', boxShadow: `0 24px 64px ${theme.shadow}`, display: 'grid', gap: '16px' }} className="dashboard-panel">
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: '14px', alignItems: 'stretch' }} className="dashboard-profile-shell">
              <div style={{ borderRadius: '24px', padding: '12px', background: 'transparent', border: 'none', display: 'grid', placeItems: 'center', position: 'relative', overflow: 'hidden', minHeight: '260px' }} className="dashboard-avatar-wrap">
                <div style={{ position: 'absolute', inset: '26px 18px 0', borderRadius: '28px 28px 0 0', background: `linear-gradient(180deg, ${theme.panelBg}, transparent)`, border: `1px solid ${theme.cardBorder}`, borderBottom: 'none', opacity: 0.75 }} className="dashboard-avatar-stage" />
                <div style={{ position: 'absolute', width: '220px', height: '220px', borderRadius: '50%', filter: 'blur(38px)', background: `${theme.blue}44` }} className="dashboard-avatar-glow" />
                <div style={{ position: 'absolute', bottom: '18px', width: '68%', height: '26px', borderRadius: '999px', background: 'rgba(15,23,42,0.26)', filter: 'blur(12px)' }} />
                <Avatar user={user} size={isNarrowScreen ? 88 : 236} theme={theme} />
              </div>

              <div style={{ display: 'grid', alignContent: 'stretch' }} className="dashboard-profile-meta">
                <div style={{ display: 'grid', gap: '6px', marginBottom: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: theme.textMuted }}>Personal cockpit</div>
                  <div style={{ fontSize: '28px', fontWeight: 900, color: theme.textHeading, lineHeight: 1.02 }} className="dashboard-profile-name">{user.name || user.username}</div>
                  <div style={{ fontSize: '14px', lineHeight: 1.6, color: theme.textSecondary }} className="dashboard-profile-quote">{user.quote || 'Building better decisions, one signal at a time.'}</div>
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

            <SectionLoadingShell loading={showWellnessSectionLoader} label="Loading wellness trend..." theme={theme} height={156}>
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
            </SectionLoadingShell>

            <MetricGrid items={wellnessCards} theme={theme} />
          </div>
        </section>

        <section style={{ display: activeTab === 'home' ? 'grid' : 'none', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }} className="dashboard-top-grid">
          <div
            style={{ borderRadius: '24px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '14px', display: 'grid', gap: '10px', boxShadow: `0 18px 40px ${theme.shadow}` }}
            role="button"
            tabIndex={0}
            onClick={() => router.push('/wellness')}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') router.push('/wellness');
            }}
          >
            <div style={{ fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: theme.textMuted, fontWeight: 800 }}>Wellness Club</div>
            <div style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=80"
                alt="Live fitness training"
                style={{ width: '100%', height: '160px', borderRadius: '16px', objectFit: 'cover', border: `1px solid ${theme.cardBorder}` }}
              />
              <div style={{ position: 'absolute', left: '16px', bottom: '16px', right: '16px', display: 'grid', gap: '8px', padding: '10px', borderRadius: '18px', background: 'rgba(15,23,42,0.72)' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#fff', letterSpacing: '0.08em' }}>Wellness modules</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
                  {wellnessClubModules.map((item) => (
                    <ClubModuleLink key={item.title} module={item} variant="wellness" onNavigate={(path) => router.push(path)} />
                  ))}
                </div>
              </div>
            </div>
            <div style={{ fontSize: '13px', color: theme.textSecondary, lineHeight: 1.45 }}>Live wellness program shortcuts, quick access to workouts, recovery plans, and coach guidance.</div>
          </div>

          <div
            style={{ borderRadius: '24px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '14px', display: 'grid', gap: '10px', boxShadow: `0 18px 40px ${theme.shadow}` }}
            role="button"
            tabIndex={0}
            onClick={() => router.push('/nifty-strategies')}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') router.push('/nifty-strategies');
            }}
          >
            <div style={{ fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: theme.textMuted, fontWeight: 800 }}>Nifty Club</div>
            <div style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1200&q=80"
                alt="Stock market dashboard"
                style={{ width: '100%', height: '160px', borderRadius: '16px', objectFit: 'cover', border: `1px solid ${theme.cardBorder}` }}
              />
              <div style={{ position: 'absolute', left: '16px', bottom: '16px', right: '16px', display: 'grid', gap: '8px', padding: '10px', borderRadius: '18px', background: 'rgba(15,23,42,0.72)' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#fff', letterSpacing: '0.08em' }}>Nifty modules</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
                  {niftyClubModules.map((item) => (
                    <ClubModuleLink key={item.title} module={item} variant="nifty" onNavigate={(path) => router.push(path)} />
                  ))}
                </div>
              </div>
            </div>
            <div style={{ fontSize: '13px', color: theme.textSecondary, lineHeight: 1.45 }}>Market and strategy shortcuts for quick entries, trend checks, and live trade ideas.</div>
          </div>
        </section>

        <section
          style={{ display: activeTab === 'buddies' ? 'grid' : 'none', borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '16px', boxShadow: `0 20px 56px ${theme.shadow}`, gap: '12px' }}
          className="dashboard-panel dashboard-buddies-panel"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800 }}>Buddy showdown</div>
              <div className="dashboard-buddies-title" style={{ fontSize: '24px', fontWeight: 800, color: theme.textHeading, marginTop: '6px' }}>{showdownTitle}</div>
            </div>
            <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: 700 }}>{`${Math.max(0, comparisonTrendRows.length - 1)} rivals`}</div>
          </div>

          <div style={{ fontSize: '12px', color: theme.textSecondary, lineHeight: 1.55 }}>Fight mode: each line keeps a fixed color, rank badges (1,2,3...) are stamped at the finish, and legend chips map rank to plan and player.</div>

          <SectionLoadingShell loading={showBuddiesSectionLoader} label="Loading buddy race..." theme={theme} height={isNarrowScreen ? 200 : 210}>
            <ComparisonTrendChart rows={comparisonTrendRows} theme={theme} compact={isNarrowScreen} emptyLabel="Add wellness activity and active buddies to start the score sprint" />
          </SectionLoadingShell>
          <button
            type="button"
            className="dashboard-leaderboard-link"
            onClick={() => router.push('/leaderboard')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-start', borderRadius: '999px', border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.textHeading, padding: '10px 16px', cursor: 'pointer', fontSize: '12px', fontWeight: 800 }}
          >
            Open leaderboard →
          </button>
        </section>

        <section style={{ display: activeTab === 'buddies' ? 'grid' : 'none', borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '18px', boxShadow: `0 20px 56px ${theme.shadow}`, gap: '14px' }} className="dashboard-panel dashboard-buddies-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800 }}>Buddy activity</div>
              <div className="dashboard-buddies-title" style={{ fontSize: '24px', fontWeight: 800, color: theme.textHeading, marginTop: '6px' }}>Friends on the move</div>
            </div>
            <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: 700 }}>Live activity highlights from your training circle</div>
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            {buddyActivityItems.map((item) => (
              <div key={item.id} style={{ display: 'grid', gap: '10px', borderRadius: '20px', border: `1px solid ${theme.cardBorder}`, padding: '14px', background: theme.cardBg }}>
                <div className="dashboard-buddy-activity-row" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '16px', display: 'grid', placeItems: 'center', background: `${theme.blue}10`, color: theme.blue, fontWeight: 800, fontSize: '18px', flexShrink: 0 }}>{item.avatar}</div>
                  <div className="dashboard-buddy-activity-text" style={{ display: 'grid', gap: '4px', flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: theme.textHeading }}>{item.title}</div>
                    <div style={{ fontSize: '12px', color: theme.textSecondary, lineHeight: 1.4 }}>{item.description}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ display: activeTab === 'posts' ? 'grid' : 'none', borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '18px', boxShadow: `0 20px 56px ${theme.shadow}`, gap: '14px' }} className="dashboard-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800 }}>Buddy feed</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: theme.textHeading, marginTop: '6px' }}>Fitstagram</div>
            </div>
            <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: 700 }}>{`${feedPosts.filter((p) => !p.seen).length} new · ${feedPosts.length} posts · refreshes every 30s`}</div>
          </div>

          <PostFeedModule posts={feedPosts.slice(0, 12)} theme={theme} onLike={likePost} onView={markPostViewed} />
        </section>

        <section style={{ display: activeTab === 'buddies' ? 'grid' : 'none', borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '18px', boxShadow: `0 20px 56px ${theme.shadow}`, gap: '18px' }} className="dashboard-panel dashboard-buddies-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800 }}>Buddy insights</div>
              <div className="dashboard-buddies-title" style={{ fontSize: '24px', fontWeight: 800, color: theme.textHeading, marginTop: '6px' }}>Your training circle</div>
            </div>
            <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: 700 }}>{`${buddyRows.length} buddies • performance graphs`}</div>
          </div>

          {buddyRows.length === 0 ? (
            <div style={{ borderRadius: '20px', border: `1px solid ${theme.cardBorder}`, padding: '18px', color: theme.textMuted, background: theme.cardBg }}>No buddies are active yet. Add a buddy to compare performance and see side-by-side trend graphs.</div>
          ) : (
            <div className="dashboard-buddy-grid" style={{ display: 'grid', gridTemplateColumns: isNarrowScreen ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              {displayedBuddyRows.slice(0, 4).map((buddy) => (
                <BuddyCard key={buddy.id} buddy={buddy} theme={theme} compact={isNarrowScreen} />
              ))}
            </div>
          )}

          <div style={{ borderRadius: '24px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: theme.textHeading, marginBottom: '12px' }}>Shared performance comparison</div>
            <SectionLoadingShell loading={showBuddiesSectionLoader} label="Loading buddy trends..." theme={theme} height={isNarrowScreen ? 200 : 210}>
              <ComparisonTrendChart rows={displayedBuddyRows.slice(0, 6)} theme={theme} compact={isNarrowScreen} emptyLabel="Add buddies to unlock shared trend comparisons" />
            </SectionLoadingShell>
          </div>
        </section>

        <section style={{ display: activeTab === 'buddies' ? 'grid' : 'none', borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '16px', boxShadow: `0 20px 56px ${theme.shadow}`, gap: '12px' }} className="dashboard-panel dashboard-buddies-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800 }}>Activity duel board</div>
              <div className="dashboard-buddies-title" style={{ fontSize: '24px', fontWeight: 800, color: theme.textHeading, marginTop: '6px' }}>Who Trained More?</div>
            </div>
            <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: 700 }}>{`${Math.max(0, activityShowdownRows.length - 1)} rivals`}</div>
          </div>

          <div className="dashboard-buddy-legend" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {activityShowdownRows.map((row) => (
              <div key={`${row.id}-activity-legend`} className="dashboard-buddy-legend-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '11px', color: theme.textSecondary, fontWeight: 700, padding: '6px 10px', borderRadius: '999px', background: `${row.color}10`, border: `1px solid ${row.color}33`, maxWidth: '100%' }}>
                <span style={{ minWidth: '18px', height: '18px', borderRadius: '999px', background: row.color, color: '#fff', display: 'inline-grid', placeItems: 'center', fontSize: '10px', fontWeight: 900, flexShrink: 0 }}>{row.rank}</span>
                <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: row.color, flexShrink: 0 }} />
                <span style={{ color: theme.textHeading, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.displayPlanName || row.name}</span>
              </div>
            ))}
          </div>

          <SectionLoadingShell loading={showBuddiesSectionLoader} label="Loading activity duel..." theme={theme} height={isNarrowScreen ? 240 : 320}>
            <ActivityFaceoffChart rows={activityShowdownRows} theme={theme} compact={isNarrowScreen} emptyLabel="Add activity minutes for you and your buddies to unlock the duel board" />
          </SectionLoadingShell>
          <button
            type="button"
            className="dashboard-leaderboard-link"
            onClick={() => router.push('/leaderboard')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-start', borderRadius: '999px', border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.textHeading, padding: '10px 16px', cursor: 'pointer', fontSize: '12px', fontWeight: 800 }}
          >
            Open leaderboard →
          </button>
        </section>

        <section style={{ display: activeTab === 'home' ? 'grid' : 'none', borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '16px', boxShadow: `0 20px 56px ${theme.shadow}`, gap: '12px' }} className="dashboard-market-grid">
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

            <SectionLoadingShell loading={showStrategiesSectionLoader} label="Loading market trend..." theme={theme} height={144}>
              <LineChart points={strategySummary.profitTrend} theme={theme} emptyLabel="Close trades to surface your daily P/L trend" color={theme.emerald} valueAccessor={(point) => Number(point.value || 0)} labelAccessor={(point) => String(point.label || '')} gradientId="strategy-line-fill" vivid height={144} annotationFormatter={(value) => formatCurrency(value)} />
            </SectionLoadingShell>

            <MetricGrid items={marketCards} theme={theme} />
          </div>
        </section>

      </div>

      <MobileBottomNav
        theme={theme}
        activeId={activeTab}
        items={[
          { id: 'home', label: 'Home', icon: '🏠', onClick: () => { setActiveTab('home'); if (router.isReady) router.push({ pathname: '/dashboard', query: { tab: 'home' } }, undefined, { shallow: true }); } },
          { id: 'chat', label: 'Threads', icon: '🧵', href: '/chat' },
          { id: 'posts', label: 'Posts', icon: '📷', onClick: () => { setActiveTab('posts'); if (router.isReady) router.push({ pathname: '/dashboard', query: { tab: 'posts' } }, undefined, { shallow: true }); } },
          { id: 'buddies', label: 'Buddies', icon: '👥', onClick: () => { setActiveTab('buddies'); if (router.isReady) router.push({ pathname: '/dashboard', query: { tab: 'buddies' } }, undefined, { shallow: true }); } },
          { id: 'nifty', label: 'Nifty', icon: '📊', href: '/nifty-strategies' },
          { id: 'wellness', label: 'Well', icon: '💪', href: '/wellness' },
        ]}
      />
    </div>
  );
}
