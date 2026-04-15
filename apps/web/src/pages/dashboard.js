import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { useTheme, ThemePicker } from '../lib/ThemePicker';
import { applyTheme } from '../lib/themes';

const TRANSACTION_COST_PER_ORDER = 30;

function formatCurrency(value) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

function computeTransactionCost(strategy) {
  return (strategy?.transactions || []).length * TRANSACTION_COST_PER_ORDER;
}

function ProfitBarChart({ items = [], styles, theme }) {
  if (!items.length) return <div style={styles.chartEmpty}>No strategy data yet</div>;

  const scale = Math.max(...items.map((item) => Math.abs(item.value)), 1);
  return (
    <div style={styles.chartList}>
      {items.map((item) => {
        const positive = item.value >= 0;
        return (
          <div key={item.label} style={styles.chartRow}>
            <div style={styles.chartRowLabel}>{item.label}</div>
            <div style={styles.chartTrack}>
              <div style={{ ...styles.chartFill, width: `${Math.max(8, (Math.abs(item.value) / scale) * 100)}%`, background: positive ? theme.green : theme.red }} />
            </div>
            <div style={{ ...styles.chartValue, color: positive ? theme.green : theme.red }}>{formatCurrency(item.value)}</div>
          </div>
        );
      })}
    </div>
  );
}

function ProfitTrendChart({ items = [], styles, theme }) {
  if (!items.length) return <div style={styles.chartEmpty}>No closed strategy trend yet</div>;

  const W = 420; const H = 220;
  const pad = { left: 46, right: 16, top: 18, bottom: 34 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;
  const minY = Math.min(0, ...items.map((item) => item.value));
  const maxY = Math.max(0, ...items.map((item) => item.value));
  const yRange = maxY - minY || 1;
  const xFor = (index) => pad.left + ((items.length === 1 ? 0 : index / (items.length - 1)) * cw);
  const yFor = (value) => pad.top + ch - (((value - minY) / yRange) * ch);
  const polyline = items.map((item, index) => `${xFor(index)},${yFor(item.value)}`).join(' ');
  const finalPositive = items[items.length - 1].value >= 0;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 'auto', maxHeight: '240px', display: 'block' }}>
      <line x1={pad.left} y1={yFor(0)} x2={W - pad.right} y2={yFor(0)} stroke={theme.textMuted} strokeDasharray="6 4" />
      <polyline fill="none" stroke={finalPositive ? theme.green : theme.red} strokeWidth="2.5" points={polyline} />
      {items.map((item, index) => (
        <g key={`${item.label}-${index}`}>
          <circle cx={xFor(index)} cy={yFor(item.value)} r="3.5" fill={item.value >= 0 ? theme.green : theme.red}>
            <title>{`${item.label}: ${formatCurrency(item.delta)} | Running ${formatCurrency(item.value)}`}</title>
          </circle>
          <text x={xFor(index)} y={H - 8} fontSize="9" fill={theme.textSecondary} textAnchor="middle" fontFamily="monospace">{index + 1}</text>
        </g>
      ))}
      <text x={pad.left - 6} y={pad.top + 4} fontSize="10" fill={theme.textSecondary} textAnchor="end" fontFamily="monospace">{Math.round(maxY).toLocaleString('en-IN')}</text>
      <text x={pad.left - 6} y={yFor(0) + 4} fontSize="10" fill={theme.textSecondary} textAnchor="end" fontFamily="monospace">0</text>
      <text x={pad.left - 6} y={H - pad.bottom + 4} fontSize="10" fill={theme.textSecondary} textAnchor="end" fontFamily="monospace">{Math.round(minY).toLocaleString('en-IN')}</text>
      <text x={pad.left + cw / 2} y={H - 2} fontSize="10" fill={theme.textMuted} textAnchor="middle" fontFamily="monospace">Closed strategy sequence</text>
    </svg>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { theme, themeId, setTheme } = useTheme();
  const [user, setUser] = useState(null);
  const [indices, setIndices] = useState([]);
  const [strategies, setStrategies] = useState([]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.push('/');
    } else {
      setUser(JSON.parse(storedUser));
    }
  }, [router]);

  useEffect(() => {
    const loadIndices = async () => {
      try {
        const response = await fetch('/api/market-indices');
        const data = await response.json();
        if (response.ok) {
          const allowed = ['NIFTY50', 'BANKNIFTY'];
          setIndices((data.indices || []).filter((i) => allowed.includes(i.key)));
        }
      } catch (_) {}
    };
    loadIndices();
    const interval = setInterval(loadIndices, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadStrategies = async () => {
      try {
        const response = await fetch('/api/options-strategies');
        const data = await response.json();
        if (response.ok) setStrategies(data.strategies || []);
      } catch (_) {}
    };

    loadStrategies();
    const interval = setInterval(loadStrategies, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    router.push('/');
  };

  const styles = useMemo(() => applyTheme(darkStyles, themeId, theme), [themeId]);

  const strategyStats = useMemo(() => {
    const active = strategies.filter((strategy) => strategy.status === 'active');
    const closed = strategies.filter((strategy) => strategy.status === 'closed');
    const transactionCost = strategies.reduce((sum, strategy) => sum + computeTransactionCost(strategy), 0);
    const bookedProfit = closed.reduce((sum, strategy) => sum + (computeStrategyRealized(strategy) - computeTransactionCost(strategy)), 0);
    const openMtm = active.reduce((sum, strategy) => sum + computeStrategyLiveMtm(strategy), 0);
    const totalProfit = bookedProfit + openMtm;
    const bars = strategies
      .map((strategy) => ({
        label: String(strategy.name || 'Unnamed').slice(0, 16),
        value: Number((computeStrategyRealized(strategy) - computeTransactionCost(strategy) + computeStrategyLiveMtm(strategy)).toFixed(2)),
      }))
      .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
      .slice(0, 6);

    const cumulativeClosed = [];
    let running = 0;
    closed
      .slice()
      .sort((left, right) => new Date(left.updatedAt || left.createdAt || 0).getTime() - new Date(right.updatedAt || right.createdAt || 0).getTime())
      .forEach((strategy) => {
        const delta = computeStrategyRealized(strategy) - computeTransactionCost(strategy);
        running += delta;
        cumulativeClosed.push({
          label: String(strategy.name || 'Closed').slice(0, 14),
          delta: Number(delta.toFixed(2)),
          value: Number(running.toFixed(2)),
        });
      });

    return {
      activeCount: active.length,
      closedCount: closed.length,
      transactionCost: Number(transactionCost.toFixed(2)),
      bookedProfit: Number(bookedProfit.toFixed(2)),
      openMtm: Number(openMtm.toFixed(2)),
      totalProfit: Number(totalProfit.toFixed(2)),
      bars,
      cumulativeClosed,
    };
  }, [strategies]);

  if (!user) return <div style={styles.loading}>Loading...</div>;

  const modules = [
    { icon: '📊', title: 'Strategy Tracker', desc: 'Track active positions, P/L, and manage your Nifty strategies', path: '/nifty-strategies', accent: '#22c55e' },
    { icon: '🧮', title: 'Strategy Builder', desc: 'Build and save new options strategies with live chain data', path: '/options-strategy', accent: '#a78bfa' },
    { icon: '📈', title: 'Analytics', desc: 'Charts for wellness, P/L trends, and portfolio overview', path: '/analytics', accent: '#f59e0b' },
    { icon: '🧠', title: 'Option Pricing', desc: 'Black-Scholes, Binomial, Monte Carlo — compare fair values', path: '/expected-option-prices', accent: '#38bdf8' },
    { icon: '🏋️', title: 'Wellness Tracker', desc: 'Daily habits, activity scores, and health guidance', path: '/wellness', accent: '#34d399' },
    { icon: '💬', title: 'Chat', desc: 'Real-time messaging system', path: '/chat', accent: '#818cf8' },
    { icon: '📸', title: 'Media Manager', desc: 'Upload, organize, and browse photos & videos', path: '/media', accent: '#fb923c' },
    { icon: '👤', title: 'Profile', desc: 'Account settings and preferences', path: '/profile', accent: '#94a3b8' },
  ];

  return (
    <div style={styles.container}>
      <style>{`
        .dash-card { transition: transform 0.18s, border-color 0.18s, box-shadow 0.18s; }
        .dash-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,0,0,0.35); }
        .dash-ticker { animation: tickerPulse 2s ease-in-out infinite; }
        @keyframes tickerPulse { 0%,100%{opacity:1} 50%{opacity:0.85} }
        @media (max-width: 640px) {
          .dash-header { flex-direction: column !important; align-items: flex-start !important; }
          .dash-grid { grid-template-columns: 1fr !important; }
          .dash-ticker-strip { flex-direction: column !important; }
          .dash-strategy-summary { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .dash-strategy-charts { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={styles.header} className="dash-header">
        <div>
          <h1 style={styles.title}>Welcome, {user.username}</h1>
          <p style={styles.subtitle}>Your command center</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <ThemePicker theme={theme} themeId={themeId} setTheme={setTheme} />
          <button onClick={handleLogout} style={styles.logoutBtn}>Logout</button>
        </div>
      </div>

      {indices.length > 0 && (
        <div style={styles.tickerStrip} className="dash-ticker-strip">
          {indices.map((idx) => (
            <div key={idx.key} style={styles.tickerCard} className="dash-ticker">
              <span style={styles.tickerName}>{idx.name}</span>
              <span style={styles.tickerPrice}>{Number(idx.price).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              <span style={{ ...styles.tickerChange, color: idx.change >= 0 ? theme.green : theme.red }}>
                {idx.change >= 0 ? '▲' : '▼'} {Math.abs(idx.change).toFixed(2)} ({idx.changePercent >= 0 ? '+' : ''}{Number(idx.changePercent).toFixed(2)}%)
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={styles.strategySection}>
        <div style={styles.strategySectionHeader}>
          <div>
            <div style={styles.strategySectionTitle}>Strategy Profit Snapshot</div>
            <div style={styles.strategySectionSubtitle}>Booked profit from closed strategies and current MTM from active positions.</div>
          </div>
          <button onClick={() => router.push('/nifty-strategies')} style={styles.sectionBtn}>Open Tracker</button>
        </div>

        <div style={styles.strategySummaryGrid} className="dash-strategy-summary">
          <div style={{ ...styles.strategySummaryCard, borderTopColor: strategyStats.totalProfit >= 0 ? theme.green : theme.red }}>
            <div style={styles.strategySummaryLabel}>Total Strategy P/L</div>
            <div style={{ ...styles.strategySummaryValue, color: strategyStats.totalProfit >= 0 ? theme.green : theme.red }}>{formatCurrency(strategyStats.totalProfit)}</div>
          </div>
          <div style={{ ...styles.strategySummaryCard, borderTopColor: strategyStats.bookedProfit >= 0 ? theme.green : theme.red }}>
            <div style={styles.strategySummaryLabel}>Booked Profit</div>
            <div style={{ ...styles.strategySummaryValue, color: strategyStats.bookedProfit >= 0 ? theme.green : theme.red }}>{formatCurrency(strategyStats.bookedProfit)}</div>
          </div>
          <div style={{ ...styles.strategySummaryCard, borderTopColor: theme.red }}>
            <div style={styles.strategySummaryLabel}>Transaction Cost</div>
            <div style={{ ...styles.strategySummaryValue, color: theme.red }}>{formatCurrency(strategyStats.transactionCost)}</div>
          </div>
          <div style={{ ...styles.strategySummaryCard, borderTopColor: strategyStats.openMtm >= 0 ? theme.green : theme.red }}>
            <div style={styles.strategySummaryLabel}>Open MTM</div>
            <div style={{ ...styles.strategySummaryValue, color: strategyStats.openMtm >= 0 ? theme.green : theme.red }}>{formatCurrency(strategyStats.openMtm)}</div>
          </div>
          <div style={styles.strategySummaryCard}>
            <div style={styles.strategySummaryLabel}>Active / Closed</div>
            <div style={styles.strategySummaryValue}>{strategyStats.activeCount} / {strategyStats.closedCount}</div>
          </div>
        </div>

        <div style={styles.strategyChartsGrid} className="dash-strategy-charts">
          <div style={styles.strategyChartCard}>
            <div style={styles.strategyChartTitle}>Top Strategy P/L</div>
            <ProfitBarChart items={strategyStats.bars} styles={styles} theme={theme} />
          </div>
          <div style={styles.strategyChartCard}>
            <div style={styles.strategyChartTitle}>Booked Profit Trend</div>
            <ProfitTrendChart items={strategyStats.cumulativeClosed} styles={styles} theme={theme} />
          </div>
        </div>
      </div>

      <div style={styles.grid} className="dash-grid">
        {modules.map((mod) => (
          <div
            key={mod.path}
            className="dash-card"
            style={{ ...styles.card, borderColor: `${mod.accent}33` }}
            onClick={() => router.push(mod.path)}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = mod.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${mod.accent}33`; }}
          >
            <div style={styles.cardIcon}>{mod.icon}</div>
            <div style={styles.cardTitle}>{mod.title}</div>
            <div style={styles.cardDesc}>{mod.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const darkStyles = {
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
    marginBottom: '28px',
    gap: '16px',
    flexWrap: 'wrap',
  },
  title: {
    margin: 0,
    fontSize: '28px',
    fontWeight: '700',
    color: '#f8fafc',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    color: '#64748b',
    fontSize: '14px',
    marginTop: '4px',
  },
  logoutBtn: {
    background: '#1e293b',
    border: '1px solid #334155',
    color: '#f87171',
    padding: '10px 18px',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
  },
  tickerStrip: {
    display: 'flex',
    gap: '14px',
    marginBottom: '28px',
    flexWrap: 'wrap',
  },
  tickerCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    padding: '12px 18px',
    flex: 1,
    minWidth: '220px',
  },
  tickerName: {
    color: '#94a3b8',
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  tickerPrice: {
    color: '#f8fafc',
    fontSize: '18px',
    fontWeight: '700',
  },
  tickerChange: {
    fontSize: '13px',
    fontWeight: '600',
  },
  strategySection: {
    background: 'linear-gradient(135deg, rgba(15,23,42,0.96), rgba(30,41,59,0.8))',
    border: '1px solid #1e293b',
    borderRadius: '18px',
    padding: '18px',
    marginBottom: '26px',
  },
  strategySectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
    marginBottom: '16px',
  },
  strategySectionTitle: {
    fontSize: '18px',
    fontWeight: '800',
    color: '#f8fafc',
  },
  strategySectionSubtitle: {
    color: '#94a3b8',
    fontSize: '12px',
    marginTop: '4px',
  },
  sectionBtn: {
    background: '#0f172a',
    border: '1px solid #334155',
    color: '#bfdbfe',
    borderRadius: '10px',
    padding: '10px 14px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '700',
  },
  strategySummaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '10px',
    marginBottom: '16px',
  },
  strategySummaryCard: {
    background: '#0b1220',
    border: '1px solid #1e293b',
    borderTop: '3px solid #334155',
    borderRadius: '14px',
    padding: '14px',
  },
  strategySummaryLabel: {
    color: '#94a3b8',
    fontSize: '11px',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  strategySummaryValue: {
    color: '#f8fafc',
    fontSize: '22px',
    fontWeight: '800',
  },
  strategyChartsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '12px',
  },
  strategyChartCard: {
    background: '#0b1220',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    padding: '14px',
  },
  strategyChartTitle: {
    color: '#f8fafc',
    fontSize: '13px',
    fontWeight: '700',
    marginBottom: '10px',
  },
  chartEmpty: {
    color: '#94a3b8',
    fontSize: '12px',
    padding: '24px 0',
    textAlign: 'center',
  },
  chartList: {
    display: 'grid',
    gap: '10px',
  },
  chartRow: {
    display: 'grid',
    gridTemplateColumns: '100px 1fr 110px',
    gap: '8px',
    alignItems: 'center',
  },
  chartRowLabel: {
    color: '#e2e8f0',
    fontSize: '12px',
    fontWeight: '700',
  },
  chartTrack: {
    height: '10px',
    borderRadius: '999px',
    background: '#020617',
    overflow: 'hidden',
    border: '1px solid #1e293b',
  },
  chartFill: {
    height: '100%',
    borderRadius: '999px',
  },
  chartValue: {
    textAlign: 'right',
    fontSize: '11px',
    fontWeight: '700',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '16px',
  },
  card: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '16px',
    padding: '24px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  cardIcon: {
    fontSize: '28px',
    marginBottom: '4px',
  },
  cardTitle: {
    fontSize: '17px',
    fontWeight: '700',
    color: '#f8fafc',
  },
  cardDesc: {
    fontSize: '13px',
    color: '#94a3b8',
    lineHeight: '1.5',
  },
};