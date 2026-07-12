import { useRouter } from 'next/router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  { icon: 'SO', title: 'Strategy Optimizer', desc: 'VIX-aware multi-factor optimizer with payoff dashboards and calendar spreads.', path: '/strategy-optimizer', accent: '#7c3aed' },
  { icon: 'OP', title: 'Option Pricing', desc: 'Compare expected option prices across models and expiries.', path: '/expected-option-prices', accent: '#e11d48' },
];

const wellnessClubModules = [
  { title: 'Running Dashboard', path: '/running-analytics', accent: '#38bdf8' },
  { title: 'Leaderboard', path: '/leaderboard', accent: '#f97316' },
  { title: 'Wellness Dashboard', path: '/wellness', accent: '#22c55e' },
  { title: 'Buddy Safety', path: '/buddy-safety', accent: '#f43f5e' },
  { title: 'Threads', path: '/chat', accent: '#a78bfa' },
  { title: 'Media', path: '/media', accent: '#ec4899' },
];

const niftyClubModules = [
  { title: 'Nifty Tracker', path: '/nifty-strategies', accent: '#22c55e' },
  { title: 'Strategy History', path: '/strategy-history', accent: '#a78bfa' },
  { title: 'Strategy Builder', path: '/options-strategy', accent: '#2563eb' },
  { title: 'Strategy Optimizer', path: '/strategy-optimizer', accent: '#7c3aed' },
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

function computeLinearTrend(values = []) {
  const n = values.length;
  if (n < 2) return values.map((value) => Number(value || 0));
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + Number(value || 0), 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < n; index += 1) {
    numerator += (index - meanX) * (values[index] - meanY);
    denominator += (index - meanX) ** 2;
  }
  const slope = denominator ? numerator / denominator : 0;
  const intercept = meanY - slope * meanX;
  return values.map((_, index) => intercept + slope * index);
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

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const DASHBOARD_TABS = [
  { id: 'home', label: 'Home', icon: '🏠', accent: '#38bdf8', glow: 'rgba(56,189,248,0.24)' },
  { id: 'posts', label: 'Fitstagram', icon: '📷', accent: '#f472b6', glow: 'rgba(244,114,182,0.26)' },
  { id: 'buddies', label: 'Buddies', icon: '👥', accent: '#a78bfa', glow: 'rgba(167,139,250,0.26)' },
];

function NotificationsModal({
  open,
  onClose,
  theme,
  notifications,
  onOpenChat,
  onOpenProfile,
  onOpenFitstagram,
}) {
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="dashboard-notifications-backdrop" onClick={onClose} role="presentation">
      <div
        className="dashboard-notifications-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
      >
        <div className="dashboard-notifications-modal-head">
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800 }}>Notifications</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: theme.textHeading, marginTop: '4px' }}>Alerts & Requests</div>
          </div>
          <button type="button" className="dashboard-notifications-close" onClick={onClose} aria-label="Close notifications">✕</button>
        </div>
        <div className="dashboard-notifications-modal-body">
          <NotificationModule
            embedded
            theme={theme}
            notifications={notifications}
            onOpenChat={() => { onClose(); onOpenChat(); }}
            onOpenProfile={() => { onClose(); onOpenProfile(); }}
            onOpenFitstagram={(item) => { onClose(); onOpenFitstagram(item); }}
          />
        </div>
      </div>
    </div>
  );
}

function DashboardHero({ user, theme, notificationCount, activeTab, onTabChange, onOpenNotifications, onOpenSettings }) {
  const greeting = getTimeGreeting();
  const displayName = user?.name || user?.username || 'there';

  return (
    <section className="dashboard-hero dashboard-glass" aria-label="Dashboard header">
      <div className="dashboard-hero-aurora" aria-hidden="true">
        <span className="dashboard-hero-orb dashboard-hero-orb-a" />
        <span className="dashboard-hero-orb dashboard-hero-orb-b" />
        <span className="dashboard-hero-orb dashboard-hero-orb-c" />
      </div>
      <div className="dashboard-hero-grid" aria-hidden="true" />
      <div className="dashboard-hero-inner">
        <header className="dashboard-header">
          <div className="dashboard-header-intro">
            <div className="dashboard-header-eyebrow">
              <span className="dashboard-hero-pulse" />
              {greeting}
            </div>
            <h1 className="dashboard-title">
              <span className="dashboard-title-gradient">{displayName}</span>
            </h1>
          </div>

          <div className="dashboard-header-actions">
            <button
              type="button"
              className="dashboard-hero-action"
              onClick={onOpenNotifications}
              aria-label={`Notifications${notificationCount ? `, ${notificationCount} unread` : ''}`}
            >
              <BellIcon color="currentColor" />
              {notificationCount > 0 ? (
                <span className="dashboard-hero-badge">{notificationCount}</span>
              ) : null}
            </button>
            <button
              type="button"
              className="dashboard-hero-action"
              onClick={onOpenSettings}
              aria-label="Open settings"
              title="Settings"
            >
              <SettingsIcon color="currentColor" />
            </button>
          </div>
        </header>

        <div className="dashboard-tab-row" role="tablist" aria-label="Dashboard sections">
          {DASHBOARD_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`dashboard-tab-btn dashboard-tab-btn--${tab.id}${isActive ? ' is-active' : ''}`}
                onClick={() => onTabChange(tab.id)}
                style={isActive ? {
                  borderColor: `${tab.accent}88`,
                  background: `linear-gradient(135deg, ${tab.glow}, rgba(15,23,42,0.2))`,
                  boxShadow: `0 10px 24px ${tab.glow}, inset 0 1px 0 rgba(255,255,255,0.08)`,
                  color: '#fff',
                } : {
                  '--tab-accent': tab.accent,
                }}
              >
                <span className="dashboard-tab-icon" aria-hidden="true">{tab.icon}</span>
                <span className="dashboard-tab-label">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
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

function getAvatarBackgroundUrl(user) {
  const avatar = resolveAvatarPresentation(user?.avatar || '');
  return avatar.displaySrc || avatar.src || '';
}

function PersonalCockpitPanel({
  user,
  theme,
  stats = [],
  trendPoints = [],
  wellnessLoading = false,
  wellnessReady = true,
  onOpenWellness,
}) {
  const bgUrl = getAvatarBackgroundUrl(user);
  const fallbackInitial = String(user?.username || user?.name || 'U').slice(0, 1).toUpperCase();
  const midpoint = Math.ceil(stats.length / 2);
  const leftStats = stats.slice(0, midpoint);
  const rightStats = stats.slice(midpoint);
  const showWellnessLoader = wellnessLoading && !wellnessReady;

  const renderStatTile = (item) => (
    <article
      key={item.label}
      className="dashboard-stat-tile"
      title={[item.label, item.value, item.meta].filter(Boolean).join(' · ')}
      style={{ '--stat-accent': item.accent || theme.textHeading }}
    >
      <div className="dashboard-stat-tile-label">{item.label}</div>
      <div className="dashboard-stat-tile-value">{item.value}</div>
      {item.meta ? <div className="dashboard-stat-tile-meta">{item.meta}</div> : null}
    </article>
  );

  return (
    <section className="dashboard-cockpit" aria-label="Profile overview">
      <div className="dashboard-cockpit-bg" aria-hidden="true">
        {bgUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bgUrl} alt="" className="dashboard-cockpit-bg-img" />
        ) : (
          <div className="dashboard-cockpit-fallback" data-initial={fallbackInitial} />
        )}
        <div className="dashboard-cockpit-scrim" />
        <div className="dashboard-cockpit-grid" />
      </div>

      <div className="dashboard-cockpit-content">
        <div className="dashboard-cockpit-topline">
          <p className="dashboard-cockpit-topline-text">
            {user?.quote || 'Building better decisions, one signal at a time.'}
          </p>
        </div>

        <div className="dashboard-cockpit-rails">
          <div className="dashboard-cockpit-rail dashboard-cockpit-rail--left" aria-label="Left stats">
            {leftStats.map(renderStatTile)}
          </div>

          <div className="dashboard-cockpit-center" aria-hidden="true" />

          <div className="dashboard-cockpit-rail dashboard-cockpit-rail--right" aria-label="Right stats">
            {rightStats.map(renderStatTile)}
          </div>
        </div>

        <div className="dashboard-cockpit-chart-panel" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} role="presentation">
          <div className="dashboard-cockpit-chart-head">
            <div className="dashboard-cockpit-chart-title">Wellness trend</div>
            {onOpenWellness ? (
              <button type="button" className="dashboard-wellness-open" onClick={onOpenWellness}>Open →</button>
            ) : null}
          </div>
          <SectionLoadingShell loading={showWellnessLoader} label="Loading wellness trend..." theme={theme} height={148}>
            <ScrollableTrendChart
              points={trendPoints}
              theme={theme}
              emptyLabel="Add wellness entries to see your trend"
              color={theme.blue}
              height={128}
              gradientId="wellness-line-fill"
              ariaLabel="Wellness score trend"
            />
          </SectionLoadingShell>
        </div>
      </div>
    </section>
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

function ScrollableTrendChart({
  points,
  theme,
  height = 128,
  emptyLabel = 'Add entries to see your trend',
  color,
  gradientId = 'dashboard-trend-fill',
  pointSpacing = 12,
  annotationFormatter = (value) => `${value >= 0 ? '+' : ''}${Number(value || 0).toFixed(1)}`,
  ariaLabel = 'Trend',
  hintText = 'Scroll up/down or drag sideways for older days',
  variant = 'wellness',
}) {
  const shellRef = useRef(null);
  const scrollRef = useRef(null);

  const chartWidth = useMemo(() => {
    if (!points.length) return 280;
    const pad = { left: 12, right: 18 };
    const plotWidth = Math.max(180, (points.length - 1) * pointSpacing);
    return pad.left + plotWidth + pad.right;
  }, [points.length, pointSpacing]);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollLeft = node.scrollWidth - node.clientWidth;
  }, [chartWidth, points]);

  useEffect(() => {
    const scrollNode = scrollRef.current;
    const shellNode = shellRef.current;
    if (!scrollNode) return undefined;

    const applyWheelScroll = (event) => {
      const maxScroll = scrollNode.scrollWidth - scrollNode.clientWidth;
      if (maxScroll <= 0) return;
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      scrollNode.scrollLeft = Math.max(0, Math.min(maxScroll, scrollNode.scrollLeft + delta));
      event.preventDefault();
      event.stopPropagation();
    };

    let dragging = false;
    let dragStartX = 0;
    let scrollStart = 0;

    const onPointerDown = (event) => {
      if (event.button !== 0) return;
      dragging = true;
      dragStartX = event.clientX;
      scrollStart = scrollNode.scrollLeft;
      scrollNode.setPointerCapture(event.pointerId);
      scrollNode.classList.add('is-dragging');
    };

    const onPointerMove = (event) => {
      if (!dragging) return;
      scrollNode.scrollLeft = scrollStart - (event.clientX - dragStartX);
    };

    const endDrag = (event) => {
      if (!dragging) return;
      dragging = false;
      scrollNode.classList.remove('is-dragging');
      try { scrollNode.releasePointerCapture(event.pointerId); } catch (_) { /* ignore */ }
    };

    let touchStartX = 0;
    let touchStartY = 0;
    let touchScrollStart = 0;

    const onTouchStart = (event) => {
      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
      touchScrollStart = scrollNode.scrollLeft;
    };

    const onTouchMove = (event) => {
      const dx = touchStartX - event.touches[0].clientX;
      const dy = touchStartY - event.touches[0].clientY;
      if (Math.abs(dy) >= Math.abs(dx)) {
        scrollNode.scrollLeft = touchScrollStart + dy;
      } else {
        scrollNode.scrollLeft = touchScrollStart + dx;
      }
      event.preventDefault();
    };

    const wheelTargets = [scrollNode, shellNode].filter(Boolean);
    wheelTargets.forEach((node) => {
      node.addEventListener('wheel', applyWheelScroll, { passive: false, capture: true });
    });
    scrollNode.addEventListener('pointerdown', onPointerDown);
    scrollNode.addEventListener('pointermove', onPointerMove);
    scrollNode.addEventListener('pointerup', endDrag);
    scrollNode.addEventListener('pointercancel', endDrag);
    scrollNode.addEventListener('touchstart', onTouchStart, { passive: true });
    scrollNode.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      wheelTargets.forEach((node) => {
        node.removeEventListener('wheel', applyWheelScroll, { capture: true });
      });
      scrollNode.removeEventListener('pointerdown', onPointerDown);
      scrollNode.removeEventListener('pointermove', onPointerMove);
      scrollNode.removeEventListener('pointerup', endDrag);
      scrollNode.removeEventListener('pointercancel', endDrag);
      scrollNode.removeEventListener('touchstart', onTouchStart);
      scrollNode.removeEventListener('touchmove', onTouchMove);
    };
  }, [chartWidth, points]);

  if (!points.length) {
    return <div style={{ minHeight: `${height}px`, display: 'grid', placeItems: 'center', color: theme.textSecondary, fontSize: '13px' }}>{emptyLabel}</div>;
  }

  const pad = { left: 12, right: 18, top: 14, bottom: 22 };
  const values = points.map((point) => Number(point.value || 0));
  const trendValues = computeLinearTrend(values);
  const rawMin = Math.min(...values, ...trendValues, 0);
  const rawMax = Math.max(...values, ...trendValues, 0);
  const rawRange = rawMax - rawMin || 1;
  const yPad = rawRange * 0.1;
  const min = rawMin - yPad;
  const max = rawMax + yPad;
  const range = max - min || 1;
  const plotWidth = Math.max(180, (points.length - 1) * pointSpacing);
  const width = pad.left + plotWidth + pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const xFor = (index) => pad.left + (index * pointSpacing);
  const yFor = (value) => pad.top + plotHeight - (((value - min) / range) * plotHeight);
  const clampY = (value) => Math.min(pad.top + plotHeight, Math.max(pad.top, yFor(value)));
  const lastIndex = points.length - 1;
  const stroke = color || (variant === 'profit' && values[lastIndex] < 0 ? theme.red : theme.blue);
  const isProfitLoss = variant === 'profit' && values[lastIndex] < 0;
  const polyline = points.map((_, index) => `${xFor(index)},${clampY(values[index])}`).join(' ');
  const trendLine = trendValues.map((value, index) => `${xFor(index)},${clampY(value)}`).join(' ');
  const zeroY = yFor(0);
  const labelEvery = points.length > 28 ? Math.ceil(points.length / 8) : points.length > 14 ? 3 : points.length > 7 ? 2 : 1;
  const showDots = points.length <= 28;
  const clipId = `${gradientId}-plot-clip`;

  return (
    <div
      ref={shellRef}
      className="dashboard-wellness-chart-shell"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      role="presentation"
    >
      <div className="dashboard-wellness-chart-meta">
        <span className="dashboard-wellness-trend-key">
          <span className="dashboard-wellness-trend-swatch" />
          Trend
        </span>
        <span className="dashboard-wellness-latest">
          {annotationFormatter(values[lastIndex], points[lastIndex])}
        </span>
      </div>
      <div
        className="dashboard-wellness-chart-scroll"
        ref={scrollRef}
      >
        <div className="dashboard-wellness-chart-track" style={{ width: `${width}px` }}>
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{ display: 'block' }}
            aria-label={ariaLabel}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
                {isProfitLoss ? (
                  <>
                    <stop offset="0%" stopColor="#ef4444" stopOpacity="0.22" />
                    <stop offset="45%" stopColor="#f97316" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.04" />
                  </>
                ) : (
                  <>
                    <stop offset="0%" stopColor="#22c55e" stopOpacity="0.22" />
                    <stop offset="45%" stopColor="#06b6d4" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.04" />
                  </>
                )}
              </linearGradient>
              <linearGradient id={`${gradientId}-stroke`} x1="0" x2="1" y1="0" y2="0">
                {isProfitLoss ? (
                  <>
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset="50%" stopColor="#f97316" />
                    <stop offset="100%" stopColor="#fb7185" />
                  </>
                ) : (
                  <>
                    <stop offset="0%" stopColor="#22c55e" />
                    <stop offset="50%" stopColor="#06b6d4" />
                    <stop offset="100%" stopColor="#38bdf8" />
                  </>
                )}
              </linearGradient>
              <clipPath id={clipId}>
                <rect x={pad.left} y={pad.top} width={plotWidth} height={plotHeight} />
              </clipPath>
            </defs>
            <rect x={pad.left} y={pad.top} width={plotWidth} height={plotHeight} rx="10" fill="rgba(255,255,255,0.55)" stroke="rgba(148,163,184,0.22)" />
            <line x1={pad.left} y1={zeroY} x2={width - pad.right} y2={zeroY} stroke={theme.graphGridLine} strokeDasharray="4 4" />
            {points.map((point, index) => {
              if (index !== 0 && index !== lastIndex && index % labelEvery !== 0) return null;
              const x = xFor(index);
              return (
                <g key={`grid-${point.label}-${index}`}>
                  <line x1={x} y1={pad.top} x2={x} y2={height - pad.bottom} stroke={theme.graphGridLine} strokeOpacity="0.14" />
                  <text x={x} y={height - 6} textAnchor="middle" fill={theme.textMuted} fontSize="9">{point.label}</text>
                </g>
              );
            })}
            <g clipPath={`url(#${clipId})`}>
              <polygon fill={`url(#${gradientId})`} points={`${pad.left},${zeroY} ${polyline} ${width - pad.right},${zeroY}`} />
              <polyline
                fill="none"
                stroke={`url(#${gradientId}-stroke)`}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={polyline}
              />
              <polyline
                fill="none"
                stroke={theme.orange || '#f59e0b'}
                strokeWidth="1.4"
                strokeDasharray="5 4"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={trendLine}
                opacity="0.95"
              />
              {showDots ? points.map((point, index) => (
                <circle
                  key={`dot-${point.label}-${index}`}
                  cx={xFor(index)}
                  cy={clampY(values[index])}
                  r={index === lastIndex ? '3.2' : '2'}
                  fill={index === lastIndex ? stroke : '#fff'}
                  stroke={stroke}
                  strokeWidth={index === lastIndex ? '0' : '1'}
                />
              )) : (
                <circle cx={xFor(lastIndex)} cy={clampY(values[lastIndex])} r="3.2" fill={stroke} />
              )}
            </g>
          </svg>
        </div>
      </div>
      <div className="dashboard-wellness-chart-hint">{hintText}</div>
    </div>
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

    const trendPoints = cumulativeSeries.map((point) => ({
      label: point.date.slice(5),
      value: point.cumulative,
      date: point.date,
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
    const totalRunningKm = entries.reduce((sum, entry) => sum + Number(entry.runningDistanceKm || 0), 0);

    return {
      trendPoints,
      currentWellnessScore,
      maxWellnessScore: Number((maxScoreFromDaily || 0).toFixed(1)),
      fastestRunPace,
      longestRun,
      longestRunningStreak,
      totalRunningKm: Number(totalRunningKm.toFixed(1)),
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
    totalRunningKm: wellnessSummary.totalRunningKm,
    plannedGoals: wellnessSummary.plannedGoals,
    completedGoals: wellnessSummary.completedGoals,
  }), [wellnessSummary]);

  const primaryStats = useMemo(() => ([
    { label: 'Wellness score', value: displayStatNumber(profileInsights.currentWellnessScore, { hideZero: false }), accent: theme.blue },
    { label: 'Max Wellness score', value: displayStatNumber(profileInsights.maxWellnessScore, { hideZero: false }), accent: theme.cyan },
    { label: 'Lifetime km', value: displayDistance(profileInsights.totalRunningKm), accent: theme.green },
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
      <div className="dashboard-backdrop" aria-hidden="true" />
      <style>{`
        * { box-sizing: border-box; }
        html, body, #__next { min-height: 100%; margin: 0; }
        .dashboard-page {
          position: relative;
          overflow-x: hidden;
          perspective: 1200px;
        }
        .dashboard-backdrop {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background:
            radial-gradient(ellipse 70% 45% at 12% -8%, rgba(56,189,248,0.16), transparent 55%),
            radial-gradient(ellipse 55% 40% at 88% 8%, rgba(249,115,22,0.14), transparent 52%),
            radial-gradient(ellipse 50% 35% at 50% 100%, rgba(34,197,94,0.1), transparent 55%);
        }
        .dashboard-backdrop::after {
          content: '';
          position: absolute;
          inset: 0;
          opacity: 0.28;
          background-image:
            linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px);
          background-size: 44px 44px;
          mask-image: radial-gradient(ellipse 75% 65% at 50% 20%, black, transparent);
        }
        .dashboard-shell {
          position: relative;
          z-index: 1;
        }
        .dashboard-panel {
          position: relative;
          transform-style: preserve-3d;
          transition: transform 0.28s cubic-bezier(0.22,1,0.36,1), box-shadow 0.28s ease, border-color 0.28s ease;
          min-width: 0;
        }
        .dashboard-panel::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 42%, transparent 58%, rgba(255,255,255,0.04) 100%);
          opacity: 0.55;
        }
        @media (hover: hover) and (pointer: fine) {
          .dashboard-panel:hover {
            transform: translateY(-3px) translateZ(8px);
            box-shadow: 0 28px 56px rgba(0,0,0,0.32) !important;
          }
        }
        .dashboard-glass {
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
        .dashboard-hero {
          position: relative;
          overflow: hidden;
          border-radius: 28px;
          border: 1px solid rgba(148,163,184,0.18);
          background:
            linear-gradient(145deg, rgba(15,23,42,0.88) 0%, rgba(15,23,42,0.72) 48%, rgba(30,41,59,0.65) 100%);
          box-shadow:
            0 24px 60px rgba(0,0,0,0.35),
            inset 0 1px 0 rgba(255,255,255,0.08);
        }
        .dashboard-hero-aurora {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }
        .dashboard-hero-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(42px);
          opacity: 0.75;
        }
        .dashboard-hero-orb-a {
          width: 220px;
          height: 220px;
          top: -80px;
          left: -40px;
          background: rgba(56,189,248,0.35);
        }
        .dashboard-hero-orb-b {
          width: 180px;
          height: 180px;
          top: -50px;
          right: 8%;
          background: rgba(249,115,22,0.28);
        }
        .dashboard-hero-orb-c {
          width: 140px;
          height: 140px;
          bottom: -60px;
          left: 42%;
          background: rgba(34,197,94,0.22);
        }
        .dashboard-hero-grid {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.35;
          background-image:
            linear-gradient(rgba(148,163,184,0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148,163,184,0.07) 1px, transparent 1px);
          background-size: 32px 32px;
          mask-image: linear-gradient(180deg, black 0%, transparent 88%);
        }
        .dashboard-hero-inner {
          position: relative;
          z-index: 1;
          display: grid;
          gap: 16px;
          padding: 20px 20px 16px;
        }
        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          flex-wrap: wrap;
        }
        .dashboard-header-intro {
          min-width: 0;
          flex: 1;
        }
        .dashboard-header-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
          padding: 6px 12px 6px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #94a3b8;
          border: 1px solid rgba(148,163,184,0.2);
          background: rgba(2,6,23,0.45);
        }
        .dashboard-hero-pulse {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 0 0 rgba(34,197,94,0.55);
          animation: dashboard-pulse 2s ease infinite;
        }
        @keyframes dashboard-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.45); }
          50% { box-shadow: 0 0 0 8px rgba(34,197,94,0); }
        }
        .dashboard-title {
          margin: 0;
          font-size: clamp(26px, 5vw, 36px);
          font-weight: 900;
          line-height: 1.05;
          letter-spacing: -0.03em;
        }
        .dashboard-title-gradient {
          background: linear-gradient(135deg, #fff 0%, #fda4af 42%, #38bdf8 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .dashboard-header-sub {
          margin: 10px 0 0;
          max-width: 520px;
          font-size: 13px;
          line-height: 1.55;
          color: #94a3b8;
        }
        .dashboard-hero {
          margin-bottom: 14px;
        }
        .dashboard-top-grid--lead {
          margin-top: 10px;
        }
        .dashboard-notifications-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1200;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(2, 6, 23, 0.62);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .dashboard-notifications-modal {
          width: min(520px, 100%);
          max-height: min(78vh, 720px);
          overflow: hidden;
          display: grid;
          grid-template-rows: auto 1fr;
          border-radius: 22px;
          border: 1px solid rgba(148,163,184,0.28);
          background: linear-gradient(180deg, rgba(15,23,42,0.98), rgba(30,41,59,0.96));
          box-shadow: 0 28px 60px rgba(0,0,0,0.45);
        }
        .dashboard-notifications-modal-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          padding: 16px 18px 12px;
          border-bottom: 1px solid rgba(148,163,184,0.18);
        }
        .dashboard-notifications-close {
          appearance: none;
          border: 1px solid rgba(148,163,184,0.28);
          border-radius: 12px;
          width: 36px;
          height: 36px;
          background: rgba(2,6,23,0.55);
          color: #e2e8f0;
          cursor: pointer;
          font-size: 16px;
          line-height: 1;
        }
        .dashboard-notifications-modal-body {
          overflow-y: auto;
          padding: 14px 18px 18px;
        }
        .dashboard-tab-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          padding: 6px;
          border-radius: 18px;
          background: rgba(2,6,23,0.5);
          border: 1px solid rgba(148,163,184,0.16);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
        }
        .dashboard-tab-btn {
          appearance: none;
          border: 1px solid transparent;
          border-radius: 14px;
          background: rgba(15,23,42,0.35);
          color: #cbd5e1;
          padding: 11px 12px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 800;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          transition: background 0.18s, border-color 0.18s, transform 0.15s, color 0.18s, box-shadow 0.18s;
        }
        .dashboard-tab-btn--home:not(.is-active):hover {
          color: #bae6fd;
          border-color: rgba(56,189,248,0.28);
          background: rgba(56,189,248,0.08);
        }
        .dashboard-tab-btn--posts:not(.is-active):hover {
          color: #fbcfe8;
          border-color: rgba(244,114,182,0.28);
          background: rgba(244,114,182,0.08);
        }
        .dashboard-tab-btn--buddies:not(.is-active):hover {
          color: #ddd6fe;
          border-color: rgba(167,139,250,0.28);
          background: rgba(167,139,250,0.08);
        }
        .dashboard-tab-btn.is-active {
          transform: translateY(-1px);
        }
        .dashboard-tab-surface--posts {
          background:
            radial-gradient(circle at top right, rgba(244,114,182,0.12), transparent 34%),
            linear-gradient(180deg, rgba(30,41,59,0.96), rgba(15,23,42,0.98)) !important;
          border-color: rgba(244,114,182,0.28) !important;
        }
        .dashboard-tab-surface--buddies {
          background:
            radial-gradient(circle at top left, rgba(167,139,250,0.14), transparent 36%),
            linear-gradient(180deg, rgba(30,41,59,0.96), rgba(15,23,42,0.98)) !important;
          border-color: rgba(167,139,250,0.28) !important;
        }
        .dashboard-tab-surface-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          flex-wrap: wrap;
        }
        .dashboard-tab-surface-eyebrow {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-weight: 800;
        }
        .dashboard-tab-surface-eyebrow--posts { color: #f9a8d4; }
        .dashboard-tab-surface-eyebrow--buddies { color: #c4b5fd; }
        .dashboard-tab-surface-title {
          font-size: 24px;
          font-weight: 900;
          margin-top: 6px;
          line-height: 1.1;
        }
        .dashboard-tab-surface-title--posts {
          background: linear-gradient(135deg, #fff 0%, #fbcfe8 55%, #f472b6 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .dashboard-tab-surface-title--buddies {
          background: linear-gradient(135deg, #fff 0%, #ddd6fe 55%, #a78bfa 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .dashboard-tab-icon { font-size: 18px; line-height: 1; }
        .dashboard-tab-label { letter-spacing: 0.04em; }
        .dashboard-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }
        .dashboard-hero-action {
          position: relative;
          appearance: none;
          display: inline-grid;
          place-items: center;
          width: 46px;
          height: 46px;
          border-radius: 14px;
          border: 1px solid rgba(148,163,184,0.22);
          background: rgba(2,6,23,0.55);
          color: #e2e8f0;
          cursor: pointer;
          box-shadow: 0 8px 22px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06);
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
        }
        .dashboard-hero-action:hover {
          transform: translateY(-2px);
          border-color: rgba(56,189,248,0.45);
          background: rgba(15,23,42,0.85);
        }
        .dashboard-hero-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          min-width: 18px;
          height: 18px;
          padding: 0 5px;
          border-radius: 999px;
          display: inline-grid;
          place-items: center;
          background: linear-gradient(135deg, #f97316, #fb7185);
          color: #fff;
          font-size: 10px;
          font-weight: 900;
          border: 2px solid rgba(15,23,42,0.9);
        }
        .dashboard-cockpit {
          position: relative;
          overflow: hidden;
          border-radius: 24px;
          min-height: 460px;
          border: 1px solid rgba(148,163,184,0.16);
          box-shadow: 0 24px 56px rgba(0,0,0,0.38);
          transform-style: preserve-3d;
        }
        .dashboard-cockpit-bg {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .dashboard-cockpit-bg-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center center;
          filter: saturate(1.12) contrast(1.02);
        }
        .dashboard-cockpit-fallback {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 30% 20%, rgba(56,189,248,0.35), transparent 45%),
            radial-gradient(circle at 80% 30%, rgba(249,115,22,0.28), transparent 42%),
            linear-gradient(160deg, #0f172a 0%, #1e293b 55%, #0b1220 100%);
        }
        .dashboard-cockpit-fallback::after {
          content: attr(data-initial);
          position: absolute;
          right: 8%;
          top: 8%;
          font-size: clamp(120px, 28vw, 220px);
          font-weight: 900;
          line-height: 1;
          color: rgba(255,255,255,0.06);
          pointer-events: none;
        }
        .dashboard-cockpit-scrim {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, rgba(2,6,23,0.1) 0%, rgba(2,6,23,0.02) 48%, rgba(2,6,23,0.2) 100%),
            linear-gradient(105deg, rgba(2,6,23,0.12) 0%, transparent 58%, rgba(2,6,23,0.08) 100%);
        }
        .dashboard-cockpit-grid {
          position: absolute;
          inset: 0;
          opacity: 0.05;
          background-image:
            linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px);
          background-size: 36px 36px;
          mask-image: linear-gradient(180deg, black 10%, transparent 90%);
        }
        .dashboard-cockpit-content {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          min-height: 460px;
          padding: 10px 8px 12px;
        }
        .dashboard-cockpit-chart-panel {
          margin-top: 8px;
          padding: 10px 12px 8px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.42);
          background: linear-gradient(180deg, rgba(255,255,255,0.34), rgba(255,255,255,0.18));
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.55);
        }
        .dashboard-cockpit-chart-panel .dashboard-wellness-chart-scroll {
          border: 1px solid rgba(148,163,184,0.22);
          background: rgba(255,255,255,0.38);
        }
        .dashboard-cockpit-chart-panel .dashboard-wellness-trend-key {
          color: #64748b;
        }
        .dashboard-cockpit-chart-panel .dashboard-wellness-latest {
          color: #0f172a;
        }
        .dashboard-cockpit-chart-panel .dashboard-wellness-chart-hint {
          color: #64748b;
        }
        .dashboard-cockpit-chart-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          margin-bottom: 6px;
        }
        .dashboard-cockpit-chart-title {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #64748b;
          font-weight: 800;
        }
        .dashboard-cockpit-topline {
          position: relative;
          z-index: 2;
          flex-shrink: 0;
          text-align: center;
          padding: 4px 92px 8px;
          pointer-events: none;
        }
        .dashboard-cockpit-topline-text {
          display: inline-block;
          margin: 0;
          max-width: 100%;
          padding: 7px 12px;
          border-radius: 12px;
          font-size: clamp(12px, 3.2vw, 16px);
          font-weight: 800;
          line-height: 1.35;
          letter-spacing: 0.01em;
          color: #fef3c7;
          background: rgba(15,23,42,0.62);
          border: 1px solid rgba(251,191,36,0.35);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.1);
          text-shadow: 0 1px 2px rgba(0,0,0,0.85);
        }
        .dashboard-cockpit-rails {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: stretch;
          gap: 6px;
          flex: 1;
          min-height: 300px;
        }
        .dashboard-cockpit-rail {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 5px;
          width: 96px;
          max-height: 300px;
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .dashboard-cockpit-rail::-webkit-scrollbar {
          display: none;
        }
        .dashboard-cockpit-rail--left {
          align-items: flex-start;
        }
        .dashboard-cockpit-rail--right {
          align-items: flex-end;
        }
        .dashboard-cockpit-rail--right .dashboard-stat-tile {
          border-left: 1px solid rgba(255,255,255,0.2);
          border-right: 2px solid var(--stat-accent);
        }
        .dashboard-cockpit-center {
          min-width: 0;
        }
        .dashboard-stat-tile {
          --stat-accent: #38bdf8;
          position: relative;
          width: 96px;
          max-width: 96px;
          padding: 6px 8px 7px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.24);
          border-left: 2px solid var(--stat-accent);
          background: linear-gradient(145deg, rgba(15,23,42,0.78), rgba(30,41,59,0.68));
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.12);
          flex-shrink: 0;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
        }
        .dashboard-stat-tile-label {
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #e2e8f0;
          text-shadow: none;
          line-height: 1.25;
          white-space: normal;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .dashboard-stat-tile-value {
          margin-top: 3px;
          font-size: 14px;
          font-weight: 900;
          line-height: 1.1;
          color: var(--stat-accent);
          text-shadow: none;
          white-space: normal;
          word-break: break-word;
        }
        .dashboard-stat-tile-meta {
          margin-top: 2px;
          font-size: 8px;
          font-weight: 600;
          color: #cbd5e1;
          line-height: 1.25;
          text-shadow: none;
          white-space: normal;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        @media (hover: hover) and (pointer: fine) {
          .dashboard-stat-tile:hover {
            transform: translateY(-1px);
            border-color: rgba(255,255,255,0.28);
            box-shadow: 0 6px 14px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.14);
          }
        }
        @media (min-width: 900px) {
          .dashboard-cockpit-rail,
          .dashboard-stat-tile {
            width: 104px;
            max-width: 104px;
          }
          .dashboard-cockpit {
            min-height: 500px;
          }
          .dashboard-cockpit-content {
            min-height: 500px;
          }
          .dashboard-cockpit-rails {
            min-height: 330px;
          }
          .dashboard-cockpit-rail {
            max-height: 330px;
          }
          .dashboard-cockpit-topline {
            padding-left: 112px;
            padding-right: 112px;
          }
          .dashboard-stat-tile-label {
            font-size: 8px;
          }
          .dashboard-stat-tile-value {
            font-size: 15px;
          }
        }
        .dashboard-wellness-chart-shell {
          display: grid;
          gap: 6px;
          min-width: 0;
        }
        .dashboard-wellness-chart-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 0 2px;
        }
        .dashboard-wellness-trend-key {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          font-weight: 700;
          color: #94a3b8;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .dashboard-wellness-trend-swatch {
          width: 18px;
          height: 0;
          border-top: 2px dashed #f59e0b;
        }
        .dashboard-wellness-latest {
          font-size: 12px;
          font-weight: 800;
          color: #0f172a;
        }
        .dashboard-wellness-chart-scroll {
          overflow-x: auto;
          overflow-y: hidden;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
          touch-action: none;
          scrollbar-width: none;
          -ms-overflow-style: none;
          border-radius: 14px;
          border: 1px solid rgba(148,163,184,0.22);
          background: rgba(255,255,255,0.42);
          cursor: grab;
          max-width: 100%;
        }
        .dashboard-wellness-chart-scroll.is-dragging {
          cursor: grabbing;
          user-select: none;
        }
        .dashboard-wellness-chart-scroll::-webkit-scrollbar {
          display: none;
        }
        .dashboard-wellness-chart-scroll:active {
          cursor: grabbing;
        }
        .dashboard-wellness-chart-track {
          flex-shrink: 0;
          display: block;
        }
        .dashboard-wellness-chart-hint {
          font-size: 10px;
          color: #64748b;
          text-align: right;
          padding-right: 2px;
        }
        .dashboard-wellness-open {
          appearance: none;
          border: 1px solid rgba(148,163,184,0.28);
          background: rgba(255,255,255,0.72);
          color: #334155;
          border-radius: 999px;
          padding: 7px 12px;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
        }
        .dashboard-market-panel {
          border-radius: 24px;
          border: 1px solid rgba(148,163,184,0.22);
          background: rgba(255,255,255,0.68);
          padding: 14px;
          box-shadow: 0 16px 40px rgba(15,23,42,0.08);
          display: grid;
          gap: 12px;
          cursor: pointer;
        }
        .dashboard-market-chart-panel {
          padding: 10px 12px 8px;
          border-radius: 16px;
          border: 1px solid rgba(148,163,184,0.2);
          background: linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0.48));
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
        }
        .dashboard-market-chart-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 6px;
        }
        .dashboard-market-chart-title {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #64748b;
          font-weight: 800;
        }
        .dashboard-market-net {
          display: grid;
          gap: 2px;
          justify-items: end;
          margin-left: auto;
        }
        .dashboard-market-net-label {
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #64748b;
          font-weight: 700;
        }
        .dashboard-market-net strong {
          font-size: 15px;
          font-weight: 800;
        }
        @media (max-width: 1024px) {
          .dashboard-top-grid, .dashboard-market-grid, .dashboard-lower-grid { grid-template-columns: 1fr !important; }
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
          .dashboard-hero-inner {
            padding: 14px 14px 12px !important;
            gap: 12px !important;
          }
          .dashboard-header {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) auto !important;
            align-items: start !important;
            gap: 10px !important;
          }
          .dashboard-header-intro { min-width: 0 !important; }
          .dashboard-header-eyebrow {
            margin-bottom: 8px !important;
            font-size: 10px !important;
            padding: 5px 10px 5px 7px !important;
          }
          .dashboard-title { font-size: 22px !important; }
          .dashboard-header-sub {
            font-size: 12px !important;
            margin-top: 8px !important;
          }
          .dashboard-header-actions { gap: 8px !important; }
          .dashboard-hero-action {
            width: 44px !important;
            height: 44px !important;
          }
          .dashboard-tab-row {
            position: sticky;
            top: 0;
            z-index: 40;
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
          .dashboard-cockpit { min-height: 340px !important; border-radius: 20px !important; }
          .dashboard-cockpit-content { min-height: 340px !important; padding: 8px 6px !important; }
          .dashboard-cockpit-topline { padding: 2px 84px 6px !important; }
          .dashboard-cockpit-topline-text { font-size: 12px !important; padding: 6px 10px !important; }
          .dashboard-cockpit-rails { min-height: 280px !important; gap: 4px !important; }
          .dashboard-cockpit-rail { width: 88px !important; max-height: 280px !important; gap: 4px !important; }
          .dashboard-stat-tile { width: 88px !important; max-width: 88px !important; padding: 5px 7px 6px !important; }
          .dashboard-stat-tile-value { font-size: 13px !important; }
          .dashboard-top-grid { gap: 12px !important; }
          .dashboard-wellness-chart-hint { text-align: center !important; }
        }
        @media (max-width: 560px) {
          .dashboard-page { padding: 10px 10px 88px !important; }
          .dashboard-buddies-title { font-size: 18px !important; }
          .dashboard-title { font-size: 20px !important; }
          .dashboard-panel { border-radius: 18px !important; padding: 12px !important; gap: 10px !important; }
          .dashboard-cockpit { border-radius: 18px !important; }
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

      <div className="dashboard-shell" style={{ maxWidth: '1320px', margin: '0 auto', display: 'grid', gap: '18px' }}>
        <DashboardHero
          user={user}
          theme={theme}
          notificationCount={notificationCount}
          activeTab={activeTab}
          onTabChange={(tabId) => {
            setActiveTab(tabId);
            if (router.isReady) {
              router.push({ pathname: '/dashboard', query: { ...router.query, tab: tabId } }, undefined, { shallow: true });
            }
          }}
          onOpenNotifications={() => setShowNotifications(true)}
          onOpenSettings={() => { setShowNotifications(false); router.push('/settings'); }}
        />

        <NotificationsModal
          open={showNotifications}
          onClose={() => setShowNotifications(false)}
          theme={theme}
          notifications={notifications}
          onOpenChat={() => router.push('/chat')}
          onOpenProfile={() => router.push('/profile')}
          onOpenFitstagram={openFitstagram}
        />

        <section style={{ display: activeTab === 'home' ? 'grid' : 'none' }} className="dashboard-top-grid dashboard-top-grid--lead">
          <PersonalCockpitPanel
            user={user}
            theme={theme}
            stats={primaryStats}
            trendPoints={wellnessSummary.trendPoints}
            wellnessLoading={wellnessLoading}
            wellnessReady={wellnessReady}
            onOpenWellness={() => router.push('/wellness')}
          />
        </section>

        <section style={{ display: activeTab === 'home' ? 'grid' : 'none', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }} className="dashboard-top-grid">
          <div
            style={{ borderRadius: '24px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '14px', display: 'grid', gap: '10px', boxShadow: `0 18px 40px ${theme.shadow}` }}
            className="dashboard-panel dashboard-glass"
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
            className="dashboard-panel dashboard-glass"
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
          className="dashboard-panel dashboard-buddies-panel dashboard-tab-surface dashboard-tab-surface--buddies"
        >
          <div className="dashboard-tab-surface-head">
            <div>
              <div className="dashboard-tab-surface-eyebrow dashboard-tab-surface-eyebrow--buddies">Buddy showdown</div>
              <div className="dashboard-tab-surface-title dashboard-tab-surface-title--buddies">{showdownTitle}</div>
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

        <section style={{ display: activeTab === 'posts' ? 'grid' : 'none', borderRadius: '28px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, padding: '18px', boxShadow: `0 20px 56px ${theme.shadow}`, gap: '14px' }} className="dashboard-panel dashboard-tab-surface dashboard-tab-surface--posts">
          <div className="dashboard-tab-surface-head">
            <div>
              <div className="dashboard-tab-surface-eyebrow dashboard-tab-surface-eyebrow--posts">Buddy feed</div>
              <div className="dashboard-tab-surface-title dashboard-tab-surface-title--posts">Fitstagram</div>
            </div>
            <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: 700, padding: '8px 12px', borderRadius: '999px', border: '1px solid rgba(244,114,182,0.28)', background: 'rgba(244,114,182,0.08)' }}>{`${feedPosts.filter((p) => !p.seen).length} new · ${feedPosts.length} posts`}</div>
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

        <section style={{ display: activeTab === 'home' ? 'grid' : 'none' }} className="dashboard-market-grid">
          <div
            className="dashboard-panel dashboard-glass dashboard-market-panel"
            role="button"
            tabIndex={0}
            onClick={() => router.push('/nifty-strategies')}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') router.push('/nifty-strategies');
            }}
          >
            <div
              className="dashboard-market-chart-panel"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              role="presentation"
            >
              <div className="dashboard-market-chart-head">
                <div className="dashboard-market-chart-title">Market overview</div>
                <div className="dashboard-market-net">
                  <span className="dashboard-market-net-label">Net P/L</span>
                  <strong style={{ color: strategySummary.totalPnl >= 0 ? theme.green : theme.red }}>
                    {formatCurrency(strategySummary.totalPnl)}
                  </strong>
                </div>
                <button
                  type="button"
                  className="dashboard-wellness-open"
                  onClick={() => router.push('/nifty-strategies')}
                >
                  Open →
                </button>
              </div>

              <SectionLoadingShell loading={showStrategiesSectionLoader} label="Loading market trend..." theme={theme} height={168}>
                <ScrollableTrendChart
                  points={strategySummary.profitTrend}
                  theme={theme}
                  variant="profit"
                  emptyLabel="Close trades to surface your cumulative P/L trend"
                  color={strategySummary.totalPnl >= 0 ? theme.emerald : theme.red}
                  height={148}
                  gradientId="market-line-fill"
                  annotationFormatter={(value) => formatCurrency(value)}
                  ariaLabel="Cumulative P/L trend"
                  hintText="Scroll up/down or drag sideways for older trading days"
                />
              </SectionLoadingShell>
            </div>

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
