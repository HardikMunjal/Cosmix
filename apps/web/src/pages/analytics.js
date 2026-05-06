import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { restoreUserSession } from '../lib/auth-client';
import { useTheme } from '../lib/ThemePicker';
import { applyTheme } from '../lib/themes';

const TRANSACTION_COST_PER_ORDER = 30;

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function calculateTransactionCost(transactions = []) {
  return (transactions || []).length * TRANSACTION_COST_PER_ORDER;
}

function MiniLineChart({ data, color = '#22c55e', height = 100, label, theme }) {
  if (!data || data.length < 2) return <div style={darkS.emptyChart}>No data</div>;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const W = 300, H = height;
  const pad = { left: 6, right: 6, top: 10, bottom: 10 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const pts = data.map((v, i) => {
    const x = pad.left + (i / (data.length - 1)) * plotW;
    const y = pad.top + plotH - ((v - min) / range) * plotH;
    return `${x},${y}`;
  });

  return (
    <div>
      {label && <div style={darkS.miniLabel}>{label}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: `${H}px`, borderRadius: '8px', background: theme?.pageBgSolid || '#020617' }}>
        <line x1={pad.left} y1={pad.top + plotH * 0.5} x2={W - pad.right} y2={pad.top + plotH * 0.5} stroke={theme?.cardBorder || '#1e293b'} strokeDasharray="4 3" />
        <polyline fill="none" stroke={color} strokeWidth="2" points={pts.join(' ')} />
        <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r="3" fill={color} />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: theme?.textMuted || '#64748b', marginTop: '4px' }}>
        <span>Min: {formatCurrency(min)}</span>
        <span>Latest: {formatCurrency(data[data.length - 1])}</span>
        <span>Max: {formatCurrency(max)}</span>
      </div>
    </div>
  );
}

function BarChart({ items, height = 120, theme }) {
  if (!items || !items.length) return <div style={darkS.emptyChart}>No data</div>;
  const maxVal = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: `${height}px`, padding: '8px 0' }}>
      {items.map((item, idx) => {
        const h = Math.max(4, (Math.abs(item.value) / maxVal) * (height - 30));
        return (
          <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <div style={{ fontSize: '10px', color: item.value >= 0 ? (theme?.green || '#22c55e') : (theme?.red || '#f87171'), fontWeight: '600' }}>
              {item.value >= 0 ? '+' : ''}{formatCurrency(item.value)}
            </div>
            <div style={{ width: '100%', maxWidth: '40px', height: `${h}px`, borderRadius: '4px 4px 0 0', background: item.value >= 0 ? (theme?.green || '#22c55e') : (theme?.red || '#f87171'), opacity: 0.8 }} />
            <div style={{ fontSize: '10px', color: theme?.textSecondary || '#94a3b8', textAlign: 'center', lineHeight: '1.2' }}>{item.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function GaugeRing({ value, max, color, label, size = 80, theme }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={theme?.cardBorder || '#1e293b'} strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6" strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fill={theme?.textHeading || '#f8fafc'} fontSize="13" fontWeight="bold">{(pct * 100).toFixed(0)}%</text>
      </svg>
      <div style={{ fontSize: '11px', color: theme?.textSecondary || '#94a3b8', marginTop: '4px' }}>{label}</div>
    </div>
  );
}

function CumulativeClosedPnLChart({ items, height = 180, theme }) {
  if (!items || items.length < 1) return <div style={darkS.emptyChart}>No closed strategy trend yet</div>;
  const W = 320;
  const H = height;
  const pad = { left: 30, right: 10, top: 12, bottom: 24 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const min = Math.min(0, ...items.map((item) => item.value));
  const max = Math.max(0, ...items.map((item) => item.value));
  const range = max - min || 1;
  const points = items.map((item, index) => {
    const x = pad.left + ((items.length === 1 ? 0 : index / (items.length - 1)) * plotW);
    const y = pad.top + plotH - (((item.value - min) / range) * plotH);
    return { ...item, x, y };
  });
  const stroke = items[items.length - 1].value >= 0 ? (theme?.green || '#22c55e') : (theme?.red || '#f87171');
  const zeroY = pad.top + plotH - (((0 - min) / range) * plotH);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: `${H}px`, borderRadius: '8px', background: theme?.pageBgSolid || '#020617' }}>
      <line x1={pad.left} y1={zeroY} x2={W - pad.right} y2={zeroY} stroke={theme?.cardBorder || '#1e293b'} strokeDasharray="4 3" />
      <polyline fill="none" stroke={stroke} strokeWidth="2.5" points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
      {points.map((point, index) => (
        <g key={`${point.label}-${index}`}>
          <circle cx={point.x} cy={point.y} r="3" fill={point.value >= 0 ? (theme?.green || '#22c55e') : (theme?.red || '#f87171')}>
            <title>{`${point.label}: ${formatCurrency(point.delta)} | Running ${formatCurrency(point.value)}`}</title>
          </circle>
        </g>
      ))}
    </svg>
  );
}

export default function Analytics() {
  const router = useRouter();
  const { theme, themeId } = useTheme();
  const [user, setUser] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [indices, setIndices] = useState([]);

  useEffect(() => {
    restoreUserSession(router, setUser);
  }, [router]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [stratRes, idxRes] = await Promise.all([
        fetch('/api/options-strategies'),
        fetch('/api/market-indices'),
      ]);
      const stratData = await stratRes.json();
      const idxData = await idxRes.json();
      setStrategies(stratData.strategies || []);
      setIndices(idxData.indices || []);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const s = useMemo(() => applyTheme(darkS, themeId, theme), [themeId]);

  if (!user) return <div style={s.loading}>Loading...</div>;

  const activeStrats = strategies.filter((st) => st.status === 'active');
  const closedStrats = strategies.filter((st) => st.status === 'closed');
  const allStrats = strategies;

  const totalTransactionCost = allStrats.reduce((sum, st) => sum + calculateTransactionCost(st.transactions || []), 0);

  // Compute portfolio-level P/L
  const totalGrossRealizedPL = allStrats.reduce((sum, st) => {
    return sum + (st.closedLegs || []).reduce((s2, cl) => s2 + (Number(cl.pnl) || 0), 0);
  }, 0);
  const totalRealizedPL = totalGrossRealizedPL - totalTransactionCost;

  const totalUnrealizedPL = activeStrats.reduce((sum, st) => {
    const lotSize = Number(st.lotSize) || 65;
    return sum + (st.legs || []).reduce((s2, leg) => {
      const qty = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
      const entry = Number(leg.premium) || 0;
      const current = Number(leg.marketPremium ?? leg.premium) || 0;
      return s2 + (leg.side === 'SELL' ? (entry - current) * qty * lotSize : (current - entry) * qty * lotSize);
    }, 0);
  }, 0);

  const totalPL = totalRealizedPL + totalUnrealizedPL;

  // Per-strategy realized P/L for bar chart
  const strategyPLBars = closedStrats.slice(-8).map((st) => ({
    label: (st.name || 'Unnamed').slice(0, 12),
    value: (st.closedLegs || []).reduce((sum, cl) => sum + (Number(cl.pnl) || 0), 0) - calculateTransactionCost(st.transactions || []),
  }));

  const closedCumulativeTrend = (() => {
    let running = 0;
    return closedStrats
      .slice()
      .sort((left, right) => new Date(left.updatedAt || left.createdAt || 0).getTime() - new Date(right.updatedAt || right.createdAt || 0).getTime())
      .map((st) => {
        const delta = (st.closedLegs || []).reduce((sum, cl) => sum + (Number(cl.pnl) || 0), 0) - calculateTransactionCost(st.transactions || []);
        running += delta;
        return {
          label: (st.name || 'Closed').slice(0, 14),
          delta: Number(delta.toFixed(2)),
          value: Number(running.toFixed(2)),
        };
      });
  })();

  // Market sparklines from index history
  const niftyIdx = indices.find((i) => i.key === 'NIFTY50');
  const bnIdx = indices.find((i) => i.key === 'BANKNIFTY');

  // Compute active position values for risk distribution
  const activeLegCount = activeStrats.reduce((sum, st) => sum + (st.legs || []).length, 0);
  const closedLegCount = closedStrats.reduce((sum, st) => sum + (st.closedLegs || []).length, 0);

  return (
    <div style={s.container} className="analytics-page">
      <style>{`
        @media (max-width: 920px) {
          .analytics-grid { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)) !important; }
          .analytics-wide-card { grid-column: span 1 !important; }
        }
        @media (max-width: 640px) {
          .analytics-page { padding: 14px !important; }
          .analytics-grid { grid-template-columns: 1fr !important; }
          .analytics-header { flex-direction: column !important; align-items: flex-start !important; }
          .analytics-header-actions { width: 100%; flex-wrap: wrap; }
          .analytics-header-actions > * { flex: 1 1 140px; }
          .analytics-summary { grid-template-columns: 1fr !important; }
          .analytics-gauges { flex-wrap: wrap; gap: 18px !important; justify-content: flex-start !important; }
          .analytics-active-row { flex-wrap: wrap; align-items: flex-start !important; }
          .analytics-active-row > span:last-child { min-width: 0 !important; text-align: left !important; }
        }
        @media (max-width: 420px) {
          .analytics-page { padding: 10px !important; }
          .analytics-card { padding: 14px !important; }
        }
      `}</style>

      <div style={s.header} className="analytics-header">
        <div>
          <h1 style={s.title}>📈 Analytics</h1>
          <p style={s.subtitle}>Portfolio overview, P/L trends, and market data</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }} className="analytics-header-actions">
          <button onClick={loadData} style={s.secondaryBtn}>Refresh</button>
          <button onClick={() => router.push('/dashboard')} style={s.secondaryBtn}>← Dashboard</button>
        </div>
      </div>

      {loading && <div style={s.emptyChart}>Loading analytics...</div>}

      {!loading && (
        <>
          {/* Portfolio Summary Row */}
          <div style={s.summaryRow} className="analytics-summary">
            <div style={{ ...s.summaryCard, borderColor: totalPL >= 0 ? `${theme.greenDim}33` : `${theme.redDim}33` }}>
              <div style={s.summaryLabel}>Net Total P/L</div>
              <div style={{ ...s.summaryValue, color: totalPL >= 0 ? theme.green : theme.red }}>{formatCurrency(totalPL)}</div>
            </div>
            <div style={s.summaryCard}>
              <div style={s.summaryLabel}>Gross Realized</div>
              <div style={{ ...s.summaryValue, color: totalGrossRealizedPL >= 0 ? theme.green : theme.red, fontSize: '20px' }}>{formatCurrency(totalGrossRealizedPL)}</div>
            </div>
            <div style={s.summaryCard}>
              <div style={s.summaryLabel}>Transaction Cost</div>
              <div style={{ ...s.summaryValue, color: theme.red, fontSize: '20px' }}>{formatCurrency(totalTransactionCost)}</div>
            </div>
            <div style={s.summaryCard}>
              <div style={s.summaryLabel}>Net Realized</div>
              <div style={{ ...s.summaryValue, color: totalRealizedPL >= 0 ? theme.green : theme.red, fontSize: '20px' }}>{formatCurrency(totalRealizedPL)}</div>
            </div>
            <div style={s.summaryCard}>
              <div style={s.summaryLabel}>Unrealized</div>
              <div style={{ ...s.summaryValue, color: totalUnrealizedPL >= 0 ? theme.green : theme.red, fontSize: '20px' }}>{formatCurrency(totalUnrealizedPL)}</div>
            </div>
            <div style={s.summaryCard}>
              <div style={s.summaryLabel}>Active / Closed</div>
              <div style={{ ...s.summaryValue, color: theme.textHeading, fontSize: '20px' }}>{activeStrats.length} / {closedStrats.length}</div>
            </div>
          </div>

          {/* Charts Grid */}
          <div style={s.chartsGrid} className="analytics-grid">
            {/* Market Sparklines */}
            {niftyIdx && (
              <div style={s.chartCard} className="analytics-card">
                <div style={s.chartTitle}>Nifty 50 — Last 20 Sessions</div>
                <div style={s.chartMeta}>{niftyIdx.sourceLabel || niftyIdx.source || 'Unknown source'}</div>
                {niftyIdx.warning ? <div style={s.chartWarning}>{niftyIdx.warning}</div> : null}
                <MiniLineChart data={niftyIdx.history} color={theme.green} theme={theme} label={`${niftyIdx.price.toLocaleString('en-IN')} (${niftyIdx.changePercent >= 0 ? '+' : ''}${niftyIdx.changePercent}%)`} />
              </div>
            )}
            {bnIdx && (
              <div style={s.chartCard} className="analytics-card">
                <div style={s.chartTitle}>Bank Nifty — Last 20 Sessions</div>
                <div style={s.chartMeta}>{bnIdx.sourceLabel || bnIdx.source || 'Unknown source'}</div>
                {bnIdx.warning ? <div style={s.chartWarning}>{bnIdx.warning}</div> : null}
                <MiniLineChart data={bnIdx.history} color={theme.purple} theme={theme} label={`${bnIdx.price.toLocaleString('en-IN')} (${bnIdx.changePercent >= 0 ? '+' : ''}${bnIdx.changePercent}%)`} />
              </div>
            )}

            {/* Closed Strategy P/L Bars */}
            <div style={s.chartCard} className="analytics-card">
              <div style={s.chartTitle}>Closed Strategy Net P/L</div>
              {strategyPLBars.length > 0
                ? (
                  <div style={s.chartScrollX}>
                    <div style={{ minWidth: `${Math.max(420, strategyPLBars.length * 88)}px` }}>
                      <BarChart items={strategyPLBars} theme={theme} />
                    </div>
                  </div>
                )
                : <div style={s.emptyChart}>No closed strategies yet</div>
              }
            </div>

            <div style={s.chartCard} className="analytics-card">
              <div style={s.chartTitle}>Closed Strategy Profit Trend</div>
              {closedCumulativeTrend.length > 0
                ? <CumulativeClosedPnLChart items={closedCumulativeTrend} theme={theme} />
                : <div style={s.emptyChart}>No closed strategy trend yet</div>
              }
            </div>

            {/* Position Distribution */}
            <div style={s.chartCard} className="analytics-card">
              <div style={s.chartTitle}>Position Overview</div>
              <div style={{ display: 'flex', justifyContent: 'space-around', padding: '16px 0' }} className="analytics-gauges">
                <GaugeRing value={activeStrats.length} max={allStrats.length || 1} color={theme.green} label="Active" theme={theme} />
                <GaugeRing value={closedStrats.length} max={allStrats.length || 1} color={theme.textSecondary} label="Closed" theme={theme} />
                <GaugeRing value={activeLegCount} max={activeLegCount + closedLegCount || 1} color={theme.yellow} label="Open Legs" theme={theme} />
              </div>
            </div>

            {/* Active Strategies Quick View */}
            <div style={{ ...s.chartCard, gridColumn: 'span 2' }} className="analytics-card analytics-wide-card">
              <div style={s.chartTitle}>Active Positions Summary</div>
              {activeStrats.length === 0 && <div style={s.emptyChart}>No active positions</div>}
              {activeStrats.map((st) => {
                const lotSize = Number(st.lotSize) || 65;
                const mtm = (st.legs || []).reduce((sum, leg) => {
                  const qty = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
                  const entry = Number(leg.premium) || 0;
                  const current = Number(leg.marketPremium ?? leg.premium) || 0;
                  return sum + (leg.side === 'SELL' ? (entry - current) * qty * lotSize : (current - entry) * qty * lotSize);
                }, 0);
                return (
                  <div key={st.id} style={s.activeRow} className="analytics-active-row">
                    <span style={s.activeRowName}>{st.name}</span>
                    <span style={s.activeRowLegs}>{(st.legs || []).length} legs</span>
                    <span style={{ ...s.activeRowMtm, color: mtm >= 0 ? theme.green : theme.red }}>{formatCurrency(mtm)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const darkS = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #020617, #0f172a)',
    color: '#e2e8f0',
    padding: '24px',
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  },
  loading: {
    minHeight: '100vh',
    background: '#020617',
    color: '#e2e8f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    gap: '16px',
    flexWrap: 'wrap',
  },
  title: {
    margin: 0,
    fontSize: '26px',
    fontWeight: '700',
    color: '#f8fafc',
  },
  subtitle: {
    color: '#64748b',
    fontSize: '14px',
    marginTop: '4px',
  },
  secondaryBtn: {
    background: '#1e293b',
    border: '1px solid #334155',
    color: '#e2e8f0',
    borderRadius: '10px',
    padding: '10px 16px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
  },
  summaryRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '14px',
    marginBottom: '24px',
  },
  summaryCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    padding: '18px',
  },
  summaryLabel: {
    fontSize: '12px',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
  },
  summaryValue: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#f8fafc',
  },
  chartsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '16px',
  },
  chartCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    padding: '18px',
  },
  chartTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: '12px',
  },
  chartMeta: {
    fontSize: '11px',
    color: '#94a3b8',
    marginBottom: '6px',
  },
  chartWarning: {
    fontSize: '11px',
    color: '#f59e0b',
    marginBottom: '10px',
  },
  chartScrollX: {
    overflowX: 'auto',
    overflowY: 'hidden',
    WebkitOverflowScrolling: 'touch',
    paddingBottom: '4px',
  },
  emptyChart: {
    color: '#64748b',
    fontSize: '13px',
    padding: '24px 0',
    textAlign: 'center',
  },
  miniLabel: {
    fontSize: '12px',
    color: '#94a3b8',
    marginBottom: '4px',
    fontWeight: '600',
  },
  activeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderBottom: '1px solid #1e293b',
  },
  activeRowName: {
    flex: 1,
    fontSize: '14px',
    fontWeight: '600',
    color: '#e2e8f0',
  },
  activeRowLegs: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  activeRowMtm: {
    fontSize: '14px',
    fontWeight: '700',
    minWidth: '100px',
    textAlign: 'right',
  },
};
