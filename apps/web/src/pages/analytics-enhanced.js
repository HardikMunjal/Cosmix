import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { restoreUserSession } from '../lib/auth-client';
import { useTheme } from '../lib/ThemePicker';
import {
  buildDayWiseProfitLoss,
  computeDailyStats,
  computeStrategyStats,
  formatCurrency,
} from '../lib/userInsights';

function StrategyLineChart({ points, theme }) {
  if (!points?.length) {
    return <div style={{ color: theme.textMuted, textAlign: 'center', padding: '22px 0' }}>No day-wise P/L yet.</div>;
  }

  const width = 520;
  const height = 190;
  const pad = { left: 24, right: 8, top: 10, bottom: 22 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const values = points.map((p) => Number(p.net || 0));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;
  const xFor = (i) => pad.left + ((points.length === 1 ? 0 : i / (points.length - 1)) * plotW);
  const yFor = (v) => pad.top + plotH - (((v - min) / range) * plotH);
  const stroke = values[values.length - 1] >= 0 ? theme.green : theme.red;
  const poly = points.map((p, i) => `${xFor(i)},${yFor(Number(p.net || 0))}`).join(' ');
  const zeroY = yFor(0);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: 190, display: 'block' }}>
      <line x1={pad.left} y1={zeroY} x2={width - pad.right} y2={zeroY} stroke={theme.graphGridLine || theme.cardBorder} strokeDasharray="4 3" />
      <polyline fill="none" stroke={stroke} strokeWidth="2.4" points={poly} />
      {points.map((p, i) => (
        <circle key={`${p.date}-${i}`} cx={xFor(i)} cy={yFor(Number(p.net || 0))} r={i === points.length - 1 ? 3.8 : 2.8} fill={stroke} />
      ))}
      {points.map((p, i) => (
        <text key={`t-${p.date}-${i}`} x={xFor(i)} y={height - 5} textAnchor="middle" fill={theme.textMuted} fontSize="9">{p.label}</text>
      ))}
    </svg>
  );
}

function StrategyBarChart({ items, theme }) {
  if (!items?.length) {
    return <div style={{ color: theme.textMuted, textAlign: 'center', padding: '22px 0' }}>No strategy P/L yet.</div>;
  }

  const maxAbs = Math.max(...items.map((i) => Math.abs(Number(i.totalPnl || 0))), 1);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 180, paddingTop: 14 }}>
      {items.map((item) => {
        const value = Number(item.totalPnl || 0);
        const h = Math.max(8, (Math.abs(value) / maxAbs) * 120);
        const positive = value >= 0;
        return (
          <div key={item.name} style={{ flex: 1, minWidth: 0, display: 'grid', gap: 6, justifyItems: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: positive ? theme.green : theme.red }}>{value >= 0 ? '+' : ''}{Math.round(value)}</div>
            <div style={{ width: '80%', height: h, background: positive ? theme.green : theme.red, borderRadius: '6px 6px 0 0', opacity: 0.86 }} />
            <div style={{ fontSize: 10, color: theme.textSecondary, textAlign: 'center' }}>{item.name}</div>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, accent, theme }) {
  return (
    <div style={{ background: theme.cardBgAlt || theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 11, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 17, fontWeight: 800, color: accent || theme.textHeading }}>{value}</div>
    </div>
  );
}

export default function AnalyticsEnhanced() {
  const router = useRouter();
  const { theme } = useTheme();
  const [user, setUser] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    restoreUserSession(router, setUser);
  }, [router]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/options-strategies');
      const data = await response.json();
      setStrategies(Array.isArray(data?.strategies) ? data.strategies : []);
    } catch (_) {
      setStrategies([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user, loadData]);

  const dayWise = useMemo(() => buildDayWiseProfitLoss(strategies), [strategies]);
  const dailyStats = useMemo(() => computeDailyStats(strategies), [strategies]);
  const strategyStats = useMemo(() => computeStrategyStats(strategies), [strategies]);
  const firstTradeDate = useMemo(() => dayWise[0]?.date || null, [dayWise]);

  if (!user) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: theme.pageBgSolid, color: theme.textPrimary, fontFamily: theme.font }}>Loading...</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: theme.pageBg, color: theme.textPrimary, padding: 24, fontFamily: theme.font }}>
      <style>{`
        * { box-sizing: border-box; }
        @media (max-width: 900px) {
          .strategy-grid, .strategy-kpi-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: theme.textHeading }}>Strategy Analytics</h1>
          <p style={{ margin: '5px 0 0 0', color: theme.textSecondary, fontSize: 13 }}>Nifty strategy P/L dashboard</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={loadData} style={{ background: theme.buttonSecondaryBg || theme.cardBgAlt, color: theme.buttonSecondaryText || theme.textPrimary, border: `1px solid ${theme.buttonSecondaryBorder || theme.cardBorder}`, borderRadius: 10, padding: '9px 14px', cursor: 'pointer' }}>Refresh</button>
          <button onClick={() => router.push('/dashboard')} style={{ background: theme.buttonSecondaryBg || theme.cardBgAlt, color: theme.buttonSecondaryText || theme.textPrimary, border: `1px solid ${theme.buttonSecondaryBorder || theme.cardBorder}`, borderRadius: 10, padding: '9px 14px', cursor: 'pointer' }}>Dashboard</button>
        </div>
      </div>

      <div style={{ marginBottom: 12, color: theme.textSecondary, fontSize: 12 }}>
        Overall profit since: <strong style={{ color: theme.textHeading }}>{firstTradeDate || 'N/A'}</strong>
      </div>

      {loading ? (
        <div style={{ padding: 28, textAlign: 'center', color: theme.textSecondary }}>Loading analytics...</div>
      ) : (
        <>
          <div className="strategy-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
            <StatCard label="Total P/L" value={formatCurrency(dailyStats.totalPL)} accent={dailyStats.totalPL >= 0 ? theme.green : theme.red} theme={theme} />
            <StatCard label="Last Week P/L" value={formatCurrency(dailyStats.lastWeekPL)} accent={dailyStats.lastWeekPL >= 0 ? theme.green : theme.red} theme={theme} />
            <StatCard label="Most Profit Day" value={dailyStats.bestDay ? `${formatCurrency(dailyStats.bestDay.net)} (${dailyStats.bestDay.date})` : 'N/A'} accent={theme.green} theme={theme} />
            <StatCard label="Most Loss Day" value={dailyStats.worstDay ? `${formatCurrency(dailyStats.worstDay.net)} (${dailyStats.worstDay.date})` : 'N/A'} accent={theme.red} theme={theme} />
            <StatCard label="Most Profit Strategy" value={strategyStats.mostProfit ? `${strategyStats.mostProfit.name} (${formatCurrency(strategyStats.mostProfit.totalPnl)})` : 'N/A'} accent={theme.green} theme={theme} />
            <StatCard label="Most Loss Strategy" value={strategyStats.mostLoss ? `${strategyStats.mostLoss.name} (${formatCurrency(strategyStats.mostLoss.totalPnl)})` : 'N/A'} accent={theme.red} theme={theme} />
          </div>

          <div className="strategy-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: theme.textHeading, marginBottom: 10 }}>Day-wise Profit/Loss</div>
              <StrategyLineChart points={dayWise.slice(-14)} theme={theme} />
            </div>

            <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: theme.textHeading, marginBottom: 10 }}>Strategy vs Profit/Loss</div>
              <StrategyBarChart items={strategyStats.all.slice(-8)} theme={theme} />
              <div style={{ marginTop: 8, fontSize: 11, color: theme.textSecondary }}>Loss bars are shown in red, profit bars in green.</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
