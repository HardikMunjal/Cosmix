import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.push('/');
      return;
    }
    setUser(JSON.parse(storedUser));
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

  const handleLogout = () => {
    localStorage.removeItem('user');
    router.push('/');
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