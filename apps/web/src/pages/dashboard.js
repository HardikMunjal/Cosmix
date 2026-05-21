import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveAvatarPresentation } from '../lib/avatarProfile';
import { logoutClientSession, restoreUserSession } from '../lib/auth-client';
import { useTheme } from '../lib/ThemePicker';
import { buildStrategySummary, formatCurrency } from '../lib/userInsights';
import NotificationModule from '../modules/dashboard/NotificationModule';

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
const activityMetricDefs = [
  { key: 'badmintonMinutes', label: 'Badminton' },
  { key: 'runningMinutes', label: 'Running' },
  { key: 'cyclingMinutes', label: 'Cycling' },
  { key: 'swimmingMinutes', label: 'Swimming' },
  { key: 'yogaMinutes', label: 'Yoga' },
];

function aggregateActivityTotals(entries = []) {
  const totals = Object.fromEntries(activityMetricDefs.map((metric) => [metric.key, 0]));
  for (const entry of Array.isArray(entries) ? entries : []) {
    for (const metric of activityMetricDefs) {
      const value = Number(entry?.[metric.key] || 0);
      if (Number.isFinite(value) && value > 0) {
        totals[metric.key] += value;
      }
    }
  }

  return Object.fromEntries(
    Object.entries(totals).map(([key, value]) => [key, Number(value.toFixed(1))]),
  );
}

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

function ProfileIcon({ color }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19c1.4-3 3.8-4.6 7-4.6s5.6 1.6 7 4.6" />
    </svg>
  );
}

function LogoutIcon({ color }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 6V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-2" />
      <path d="M15 12H3" />
      <path d="m8 8-4 4 4 4" />
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

function ComparisonTrendChart({ rows, theme, height = 210, emptyLabel = 'No active wellness comparison data yet' }) {
  if (!rows.length) {
    return <div style={{ minHeight: `${height}px`, display: 'grid', placeItems: 'center', color: theme.textSecondary, fontSize: '14px' }}>{emptyLabel}</div>;
  }

  const width = 640;
  const pad = { left: 16, right: 30, top: 18, bottom: 30 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
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
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: `${height}px`, display: 'block' }}>
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
        <line x1={finishX} y1={pad.top} x2={finishX} y2={height - pad.bottom} stroke={theme.textHeading} strokeOpacity="0.22" strokeDasharray="6 6" />
        {(referenceRow?.series || []).map((point, index) => {
          if (index !== 0 && index !== referenceRow.series.length - 1 && index % labelStep !== 0) return null;
          const alignedIndex = (maxSeriesLength - referenceRow.series.length) + index;
          const x = xFor(alignedIndex);
          return (
            <g key={`${point.date}-${index}`}>
              <line x1={x} y1={pad.top} x2={x} y2={height - pad.bottom} stroke={theme.graphGridLine} strokeOpacity="0.22" />
              <text x={x} y={height - 8} textAnchor="middle" fill={theme.textMuted} fontSize="10">{String(point.date || '').slice(5)}</text>
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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 12px' }}>
        {rows.map((row) => (
          <div key={`${row.id}-legend`} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '11px', color: theme.textSecondary, fontWeight: 700, padding: '6px 10px', borderRadius: '999px', background: `${row.color}10`, border: `1px solid ${row.color}33` }}>
            <span style={{ minWidth: '18px', height: '18px', borderRadius: '999px', background: row.color, color: '#fff', display: 'inline-grid', placeItems: 'center', fontSize: '10px', fontWeight: 900 }}>{row.rank}</span>
            <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: row.color, boxShadow: `0 0 0 3px ${row.color}22` }} />
            <span style={{ color: theme.textHeading }}>{row.displayPlanName || row.planName || row.label || row.name}</span>
            <span style={{ color: theme.textMuted }}>{row.isSelf ? '(you)' : `(${row.name})`}</span>
            <span>{`${Number(row.current || 0).toFixed(1)}`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityFaceoffChart({ rows, theme, height = 320, emptyLabel = 'No activity comparison data yet' }) {
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
  }));

  const maxValue = Math.max(1, ...metrics.flatMap((metric) => metric.values.map((point) => point.value)));
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
  const [strategies, setStrategies] = useState([]);
  const [wellnessData, setWellnessData] = useState({ entries: [], dailyScores: [], plans: [], plan: null });
  const [buddyTrendRows, setBuddyTrendRows] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [chatBootstrap, setChatBootstrap] = useState({ incomingRequests: [], groups: [] });

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
    if (!user) return;
    const baseUid = resolveWellnessUserId(user);
    if (!baseUid) return;
    try {
      const normalizedUsername = String(user?.username || '').trim();
      const legacyUsernameId = normalizedUsername ? `usr-${normalizedUsername.toLowerCase()}` : '';

      const primaryCandidateIds = Array.from(new Set([
        String(baseUid || '').trim(),
        String(user?.id || '').trim(),
        String(user?.email || '').trim(),
        normalizedUsername,
        legacyUsernameId,
      ].filter(Boolean)));
      const storageCandidateIds = [];

      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          for (let index = 0; index < window.localStorage.length; index += 1) {
            const key = String(window.localStorage.key(index) || '');
            if (!key.startsWith('cosmix-wellness-') || !key.endsWith('-entries')) continue;
            const maybeId = key.slice('cosmix-wellness-'.length, key.length - '-entries'.length).trim();
            if (maybeId) storageCandidateIds.push(maybeId);
          }
        } catch (_) {
          // Ignore localStorage scan failures.
        }
      }

      if (user?.username) {
        try {
          const lookupResponse = await fetch(`/api/chat/buddy-search?q=${encodeURIComponent(String(user.username).trim())}`);
          const lookupData = await lookupResponse.json().catch(() => ({}));
          const match = (Array.isArray(lookupData?.results) ? lookupData.results : [])
            .find((entry) => String(entry?.username || '').toLowerCase() === String(user.username || '').toLowerCase());
          const resolvedId = String(match?.id || '').trim();
          if (resolvedId) primaryCandidateIds.unshift(resolvedId);
        } catch (_) {
          // Ignore lookup failures and continue with available IDs.
        }
      }

      let selectedData = null;
      let selectedScore = -1;
      let lastError = null;
      const tryCandidates = async (ids) => {
        const uniqueCandidates = Array.from(new Set(ids.filter(Boolean)));

        for (const uid of uniqueCandidates) {
          try {
            const response = await fetch(`${API_BASE}/wellness/data/${encodeURIComponent(uid)}`);
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              lastError = new Error(data?.message || `Unable to load wellness data for ${uid}`);
              continue;
            }

            const score =
              (Array.isArray(data?.dailyScores) ? data.dailyScores.length * 10 : 0)
              + (Array.isArray(data?.entries) ? data.entries.length : 0)
              + (data?.plan ? 5 : 0)
              + (Array.isArray(data?.plans) ? Math.min(data.plans.length, 5) : 0);

            if (score > selectedScore) {
              selectedData = data;
              selectedScore = score;
            }
          } catch (error) {
            lastError = error;
          }
        }
      };

      await tryCandidates(primaryCandidateIds);
      if (selectedScore <= 0) {
        await tryCandidates(storageCandidateIds);
      }

      if (!selectedData && lastError) throw lastError;
      if (!selectedData) {
        setWellnessData({ entries: [], dailyScores: [], plans: [], plan: null });
        return;
      }

      setWellnessData({
        entries: Array.isArray(selectedData.entries) ? selectedData.entries : [],
        dailyScores: Array.isArray(selectedData.dailyScores) ? selectedData.dailyScores : [],
        plans: Array.isArray(selectedData.plans) ? selectedData.plans : [],
        plan: selectedData.plan || null,
      });
    } catch (_) {
      setWellnessData({ entries: [], dailyScores: [], plans: [], plan: null });
    }
  }, [API_BASE, user]);

  const loadBuddyTrendRows = useCallback(async () => {
    const selfUserId = resolveWellnessUserId(user);
    const selfUsername = String(user?.username || '').trim();
    if (!selfUserId || !selfUsername) {
      setBuddyTrendRows([]);
      return;
    }

    try {
      const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      const isLocalHost = host === 'localhost' || host === '127.0.0.1';
      const chatBase = isLocalHost ? `http://${host}:3002/chat` : '/chat-api/chat';

      const bootstrapResponse = await fetch(`${chatBase}/bootstrap?username=${encodeURIComponent(selfUsername)}`);
      const bootstrapData = await bootstrapResponse.json().catch(() => ({}));
      const friends = Array.isArray(bootstrapData?.friends) ? bootstrapData.friends : [];
      setChatBootstrap({
        incomingRequests: Array.isArray(bootstrapData?.incomingRequests) ? bootstrapData.incomingRequests : [],
        groups: Array.isArray(bootstrapData?.groups) ? bootstrapData.groups : [],
      });

      const buddyLookups = await Promise.all(friends.map(async (username) => {
        const normalized = String(username || '').trim();
        if (!normalized) return null;
        try {
          const searchResponse = await fetch(`/api/chat/buddy-search?q=${encodeURIComponent(normalized)}`);
          const searchData = await searchResponse.json();
          const match = (Array.isArray(searchData?.results) ? searchData.results : [])
            .find((entry) => String(entry?.username || '').toLowerCase() === normalized.toLowerCase());
          return {
            username: normalized,
            displayName: String(match?.name || match?.username || normalized).trim(),
            userId: String(match?.id || match?.email || match?.username || normalized).trim(),
          };
        } catch (_) {
          return {
            username: normalized,
            displayName: normalized,
            userId: normalized,
          };
        }
      }));

      const participants = Array.from(new Map(
        buddyLookups
          .filter(Boolean)
          .filter((entry) => String(entry.userId || '').trim().toLowerCase() !== selfUserId.toLowerCase())
          .map((entry) => [String(entry.userId).toLowerCase(), entry]),
      ).values());

      const nextRows = await Promise.all(participants.map(async (participant) => {
        try {
          const [summaryResponse, fullResponse] = await Promise.all([
            fetch(`${API_BASE}/wellness/plan-summary/${encodeURIComponent(participant.userId)}`),
            fetch(`${API_BASE}/wellness/data/${encodeURIComponent(participant.userId)}`),
          ]);
          const data = await summaryResponse.json().catch(() => ({}));
          const fullData = await fullResponse.json().catch(() => ({}));
          if (!summaryResponse.ok || !data?.hasActivePlan || !Array.isArray(data.series) || !data.series.length) return null;
          const series = [...data.series]
            .sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')))
            .slice(-14)
            .map((point) => ({ date: String(point.date || ''), cumulative: Number(point.cumulative || 0) }));
          if (!series.length) return null;
          const entries = Array.isArray(fullData?.entries) ? fullData.entries : [];
          return {
            id: participant.userId,
            name: participant.displayName,
            planName: String(data?.plan?.name || ''),
            current: Number(data.cumulativeTotal || series[series.length - 1]?.cumulative || 0),
            activityTotals: entries.length ? aggregateActivityTotals(entries) : null,
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
    }
  }, [API_BASE, user]);

  useEffect(() => {
    if (!user) return undefined;
    loadStrategies();
    loadWellnessData();
    loadBuddyTrendRows();
    const interval = setInterval(loadStrategies, 30000);
    const wellnessInterval = setInterval(loadWellnessData, 30000);
    const buddyInterval = setInterval(loadBuddyTrendRows, 30000);
    return () => {
      clearInterval(interval);
      clearInterval(wellnessInterval);
      clearInterval(buddyInterval);
    };
  }, [user, loadStrategies, loadWellnessData, loadBuddyTrendRows]);

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
    const selfRows = selfSeries.length ? [{
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

  const notifications = useMemo(() => {
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
  }, [chatBootstrap, buddyTrendRows]);

  const notificationCount = notifications.length;

  if (!user) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: theme.pageBgSolid, color: theme.textPrimary, fontFamily: theme.font }}><div style={{ display: 'grid', gap: '10px', justifyItems: 'center' }}><div style={{ width: '76px', height: '76px', borderRadius: '999px', border: `3px solid ${theme.cardBorder}`, borderTopColor: theme.orange, borderRightColor: theme.cyan, animation: 'cosmixDashPulse 1s linear infinite' }} /><div style={{ fontSize: '13px', fontWeight: 700, color: theme.textMuted }}>Loading dashboard...</div></div></div>;
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
          .dashboard-club-grid { grid-template-columns: 1fr !important; }
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }} className="dashboard-header-actions">
            {/* Notifications — standalone pill */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => { setShowNotifications((v) => !v); setShowSettingsMenu(false); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '999px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, color: theme.textHeading, padding: '10px 16px', cursor: 'pointer', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.09em', boxShadow: `0 4px 14px ${theme.shadow}` }}
              >
                <BellIcon color={theme.textHeading} />
                Notifications
                <span style={{ minWidth: '22px', height: '22px', borderRadius: '999px', display: 'inline-grid', placeItems: 'center', background: notificationCount > 0 ? theme.orange : theme.cardBorder, color: notificationCount > 0 ? '#fff' : theme.textMuted, fontSize: '11px', fontWeight: 900 }}>{notificationCount}</span>
              </button>
            </div>

            {/* Settings — separate standalone pill */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => { setShowSettingsMenu((v) => !v); setShowNotifications(false); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '999px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, color: theme.textHeading, padding: '10px 16px', cursor: 'pointer', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.09em', boxShadow: `0 4px 14px ${theme.shadow}` }}
              >
                <SettingsIcon color={theme.textHeading} />
                Settings
              </button>
              {showSettingsMenu ? (
                <div style={{ position: 'absolute', right: 0, top: '52px', width: '220px', borderRadius: '14px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, boxShadow: `0 18px 36px ${theme.shadow}`, padding: '8px', display: 'grid', gap: '6px', zIndex: 10 }}>
                  <button type="button" onClick={() => { setShowSettingsMenu(false); router.push('/profile'); }} style={{ borderRadius: '10px', border: 'none', background: `${theme.blue}12`, color: theme.textHeading, padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <ProfileIcon color={theme.textHeading} />
                    Open Profile
                  </button>
                  <button type="button" onClick={() => { setShowSettingsMenu(false); logoutClientSession(router); }} style={{ borderRadius: '10px', border: 'none', background: 'rgba(239,68,68,0.12)', color: '#b91c1c', padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <LogoutIcon color="#b91c1c" />
                    Logout
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {showNotifications ? (
          <NotificationModule
            theme={theme}
            notifications={notifications}
            onOpenChat={() => router.push('/chat')}
            onOpenProfile={() => router.push('/profile')}
          />
        ) : null}

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }} className="dashboard-club-grid">
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=80"
              alt="Live fitness training"
              style={{ width: '100%', height: '160px', borderRadius: '16px', objectFit: 'cover', border: `1px solid ${theme.cardBorder}` }}
            />
            <div style={{ fontSize: '13px', color: theme.textSecondary, lineHeight: 1.45 }}>All wellness modules, buddy trends, activity duels and running consistency in one training command center.</div>
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1200&q=80"
              alt="Live market screen"
              style={{ width: '100%', height: '160px', borderRadius: '16px', objectFit: 'cover', border: `1px solid ${theme.cardBorder}` }}
            />
            <div style={{ fontSize: '13px', color: theme.textSecondary, lineHeight: 1.45 }}>All Nifty strategy modules, option pricing and market analytics grouped in one active trading workspace.</div>
          </div>
        </section>

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

        <section
          style={{ borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '16px', boxShadow: `0 20px 56px ${theme.shadow}`, display: 'grid', gap: '12px', cursor: 'pointer' }}
          className="dashboard-panel"
          role="button"
          tabIndex={0}
          onClick={() => router.push('/leaderboard')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') router.push('/leaderboard');
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800 }}>Wellness showdown</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: theme.textHeading, marginTop: '6px' }}>{showdownTitle}</div>
            </div>
            <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: 700 }}>{`${Math.max(0, comparisonTrendRows.length - 1)} rivals • open leaderboard`}</div>
          </div>

          <div style={{ fontSize: '12px', color: theme.textSecondary, lineHeight: 1.55 }}>Fight mode: each line keeps a fixed color, rank badges (1,2,3...) are stamped at the finish, and legend chips map rank to plan and player.</div>

          <ComparisonTrendChart rows={comparisonTrendRows} theme={theme} emptyLabel="Add wellness activity and active buddies to start the score sprint" />
        </section>

        <section
          style={{ borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '16px', boxShadow: `0 20px 56px ${theme.shadow}`, display: 'grid', gap: '12px', cursor: 'pointer' }}
          className="dashboard-panel"
          role="button"
          tabIndex={0}
          onClick={() => router.push('/leaderboard')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') router.push('/leaderboard');
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800 }}>Activity duel board</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: theme.textHeading, marginTop: '6px' }}>Who Trained More?</div>
            </div>
            <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: 700 }}>{`${Math.max(0, activityShowdownRows.length - 1)} rivals • open leaderboard`}</div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 12px' }}>
            {activityShowdownRows.map((row) => (
              <div key={`${row.id}-activity-legend`} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '11px', color: theme.textSecondary, fontWeight: 700, padding: '6px 10px', borderRadius: '999px', background: `${row.color}10`, border: `1px solid ${row.color}33` }}>
                <span style={{ minWidth: '18px', height: '18px', borderRadius: '999px', background: row.color, color: '#fff', display: 'inline-grid', placeItems: 'center', fontSize: '10px', fontWeight: 900 }}>{row.rank}</span>
                <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: row.color }} />
                <span style={{ color: theme.textHeading }}>{row.displayPlanName || row.name}</span>
              </div>
            ))}
          </div>

          <ActivityFaceoffChart rows={activityShowdownRows} theme={theme} emptyLabel="Add activity minutes for you and your buddies to unlock the duel board" />
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
