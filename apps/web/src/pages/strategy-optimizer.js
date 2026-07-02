import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { restoreUserSession } from '../lib/auth-client';
import { useTheme } from '../lib/ThemePicker';
import { applyTheme } from '../lib/themes';
import { MobileBottomNav } from '../lib/MobileNav';
import { CosmixLoader } from '../lib/CosmixLoader';
import { classifyVixRegime } from '../lib/optionsMarketContext';

const RechartsWrap = dynamic(
  () => import('recharts').then((mod) => ({
    default: ({ children }) => children(mod),
  })),
  { ssr: false, loading: () => <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>Loading chart…</div> },
);

const STRIKE_STEP = 50;
const PRICING_SOURCES = [
  { value: 'blend', label: 'Formula Blend (recommended)' },
  { value: 'blackScholes', label: 'Black-Scholes' },
  { value: 'binomialCrr', label: 'Binomial CRR' },
  { value: 'monteCarlo', label: 'Monte Carlo' },
];

function formatExpiryDisplay(unixSeconds) {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ms = Number(unixSeconds) * 1000 + IST_OFFSET_MS;
  const d = new Date(ms);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatRs(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function PayoffMiniChart({ curve = [], spot, theme }) {
  if (!curve.length) return null;
  return (
    <RechartsWrap>
      {(mod) => {
        const { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } = mod;
        return (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={curve} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.green} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={theme.red} stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <XAxis dataKey="spot" tick={{ fill: theme.textMuted, fontSize: 10 }} />
              <YAxis tick={{ fill: theme.textMuted, fontSize: 10 }} />
              <Tooltip contentStyle={{ background: theme.panelDarkBg, border: `1px solid ${theme.cardBorder}`, fontSize: 12 }} />
              <ReferenceLine y={0} stroke={theme.textMuted} strokeDasharray="4 4" />
              {spot ? <ReferenceLine x={spot} stroke={theme.cyan} strokeDasharray="3 3" /> : null}
              <Area type="monotone" dataKey="pnl" stroke={theme.cyan} fill="url(#pnlGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        );
      }}
    </RechartsWrap>
  );
}

function FactorBars({ factors, theme }) {
  if (!factors) return null;
  const entries = Object.entries(factors);
  const max = Math.max(...entries.map(([, v]) => Math.abs(v)), 0.01);
  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
      {entries.map(([key, value]) => (
        <div key={key} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 40px', gap: 8, alignItems: 'center', fontSize: 11 }}>
          <span style={{ color: theme.textSecondary }}>{key}</span>
          <div style={{ background: theme.panelDarkBg, borderRadius: 999, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, (Math.abs(value) / max) * 100)}%`, height: '100%', background: value < 0 ? theme.red : theme.green }} />
          </div>
          <span style={{ color: theme.textPrimary, textAlign: 'right' }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function MarketContextPanel({ context, indices, theme, styles }) {
  const vix = context?.indiaVix ?? indices?.INDIAVIX?.price;
  const vixInfo = classifyVixRegime(vix);
  return (
    <div style={styles.card}>
      <div style={styles.eyebrow}>Market intelligence</div>
      <h2 style={styles.sectionTitle}>India VIX & global triggers</h2>
      <div style={styles.metricGrid}>
        <div style={styles.metricTile}>
          <div style={styles.metricLabel}>India VIX</div>
          <div style={{ ...styles.metricValue, color: theme.yellow }}>{vix?.toFixed?.(2) ?? '—'}</div>
          <div style={{ fontSize: 12, color: theme.textSecondary }}>{vixInfo.label}</div>
        </div>
        <div style={styles.metricTile}>
          <div style={styles.metricLabel}>NIFTY 50</div>
          <div style={styles.metricValue}>{indices?.NIFTY50?.price?.toLocaleString?.('en-IN') ?? '—'}</div>
        </div>
        <div style={styles.metricTile}>
          <div style={styles.metricLabel}>Premium bias</div>
          <div style={styles.metricValue}>{context?.premiumBias || vixInfo.premiumBias}</div>
        </div>
        <div style={styles.metricTile}>
          <div style={styles.metricLabel}>Event risk</div>
          <div style={{ ...styles.metricValue, color: context?.eventRisk?.level === 'high' ? theme.red : theme.green }}>
            {context?.eventRisk?.level || '—'}
          </div>
        </div>
      </div>
      {context?.recommendedPosture ? (
        <p style={{ ...styles.hint, marginTop: 12, color: theme.cyan }}>{context.recommendedPosture}</p>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 14 }}>
        {(context?.sessions || []).map((s) => (
          <div key={s.key} style={{ ...styles.metricTile, borderColor: s.open ? `${theme.green}55` : theme.cardBorder }}>
            <div style={styles.metricLabel}>{s.label}</div>
            <div style={{ fontSize: 13, color: s.open ? theme.green : theme.textMuted }}>{s.open ? 'OPEN' : 'Closed'}</div>
            <div style={{ fontSize: 11, color: theme.textSecondary }}>{s.window}</div>
            {s.note ? <div style={{ fontSize: 11, color: theme.yellow, marginTop: 4 }}>{s.note}</div> : null}
          </div>
        ))}
      </div>
      {context?.upcomingEvents?.length ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.textPrimary, marginBottom: 8 }}>Upcoming macro events</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {context.upcomingEvents.map((e) => (
              <div key={`${e.date}-${e.title}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '8px 10px', background: theme.panelDarkBg, borderRadius: 8, border: `1px solid ${theme.cardBorder}` }}>
                <span style={{ color: theme.textPrimary }}>{e.title}</span>
                <span style={{ color: e.impact === 'high' ? theme.red : theme.yellow }}>{e.daysAway}d · {e.region}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div style={{ marginTop: 14, fontSize: 12, color: theme.textSecondary }}>
        Global bias: {context?.globalVolBias?.detail || 'Loading…'}
      </div>
    </div>
  );
}

export default function StrategyOptimizerPage() {
  const router = useRouter();
  const { themeId, theme } = useTheme();
  const styles = useMemo(() => applyTheme({
    page: { minHeight: '100vh', background: 'linear-gradient(180deg, #0b1220 0%, #111827 100%)', color: '#e2e8f0', padding: '24px 16px 100px' },
    container: { maxWidth: 1200, margin: '0 auto' },
    card: { background: 'rgba(15,23,42,0.92)', border: '1px solid rgba(148,163,184,0.18)', borderRadius: 22, padding: 20, marginBottom: 16 },
    eyebrow: { fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 },
    sectionTitle: { margin: 0, fontSize: 22, fontWeight: 800 },
    hint: { fontSize: 13, color: '#94a3b8', lineHeight: 1.5 },
    input: { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.25)', background: '#0f172a', color: '#e2e8f0' },
    button: { padding: '10px 18px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #2563eb, #7c3aed)', color: '#fff', fontWeight: 700, cursor: 'pointer' },
    secondaryButton: { padding: '10px 18px', borderRadius: 12, border: '1px solid rgba(148,163,184,0.3)', background: 'transparent', color: '#e2e8f0', cursor: 'pointer' },
    metricGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 12 },
    metricTile: { background: 'rgba(2,6,23,0.55)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 14, padding: 12 },
    metricLabel: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' },
    metricValue: { fontSize: 20, fontWeight: 800, marginTop: 4 },
    tabRow: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
    tab: { padding: '8px 14px', borderRadius: 999, border: '1px solid rgba(148,163,184,0.25)', background: 'transparent', color: '#cbd5e1', cursor: 'pointer' },
    tabActive: { padding: '8px 14px', borderRadius: 999, border: '1px solid #38bdf8', background: 'rgba(56,189,248,0.15)', color: '#fff', cursor: 'pointer' },
  }, themeId, theme), [themeId, theme]);

  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('single');
  const [spotPrice, setSpotPrice] = useState(24000);
  const [lotSize, setLotSize] = useState(65);
  const [ivInput, setIvInput] = useState('');
  const [rateInput, setRateInput] = useState('6');
  const [pricingSource, setPricingSource] = useState('blend');
  const [expiryOptions, setExpiryOptions] = useState([]);
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [calSellExpiry, setCalSellExpiry] = useState('');
  const [calBuyExpiry, setCalBuyExpiry] = useState('');
  const [indices, setIndices] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [selectedStrategy, setSelectedStrategy] = useState(null);

  useEffect(() => { restoreUserSession(router, setUser); }, [router]);

  useEffect(() => {
    (async () => {
      try {
        const [idxRes, chainRes] = await Promise.all([
          fetch('/api/market-indices'),
          fetch('/api/options-chain?symbol=NIFTY'),
        ]);
        const idxData = await idxRes.json();
        const chainData = await chainRes.json();
        const map = {};
        (idxData.indices || []).forEach((item) => { map[item.key] = item; });
        setIndices(map);
        if (chainData.spot) setSpotPrice(Number(chainData.spot.toFixed(0)));
        if (chainData.expiries?.length) {
          setExpiryOptions(chainData.expiries);
          setSelectedExpiry(String(chainData.expiries[0]));
          setCalSellExpiry(String(chainData.expiries[0]));
          setCalBuyExpiry(String(chainData.expiries[1] || chainData.expiries[0]));
        }
        if (map.INDIAVIX?.price) setIvInput(String(map.INDIAVIX.price.toFixed(2)));
      } catch (_) { /* ignore */ }
    })();
  }, []);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError('');
    setResult(null);
    setSelectedStrategy(null);
    try {
      const body = {
        spot: spotPrice,
        lotSize,
        pricingSource,
        rate: Number(rateInput) || 6,
        iv: Number(ivInput) || indices.INDIAVIX?.price || 14,
        indices,
      };
      if (mode === 'calendar') {
        if (!calSellExpiry || !calBuyExpiry) throw new Error('Select both sell and buy expiries.');
        body.calendar = true;
        body.sellExpiry = Number(calSellExpiry);
        body.buyExpiry = Number(calBuyExpiry);
      } else {
        body.expiry = Number(selectedExpiry) || 0;
      }
      const response = await fetch('/api/options-best-strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Optimizer failed');
      setResult(data);
      const first = data.profiles?.[0]?.strategies?.[0];
      if (first) setSelectedStrategy(first);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [mode, spotPrice, lotSize, pricingSource, rateInput, ivInput, indices, selectedExpiry, calSellExpiry, calBuyExpiry]);

  const openInBuilder = useCallback((strategy) => {
    sessionStorage.setItem('nifty-optimizer-handoff', JSON.stringify({
      strategy,
      expiry: mode === 'calendar' ? calSellExpiry : selectedExpiry,
      sellExpiry: calSellExpiry,
      buyExpiry: calBuyExpiry,
      strategyName: `${strategy.family} · Optimizer`,
    }));
    router.push('/options-strategy?fromOptimizer=1');
  }, [router, mode, selectedExpiry, calSellExpiry, calBuyExpiry]);

  if (!user) {
    return <CosmixLoader message="Loading Strategy Optimizer…" />;
  }

  const marketContext = result?.marketContext;

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div style={styles.eyebrow}>Nifty Club</div>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900 }}>Strategy Optimizer</h1>
            <p style={styles.hint}>Multi-factor hedging engine — VIX regime, global sessions, macro events, payoff ranges.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={styles.secondaryButton} onClick={() => router.push('/dashboard')}>Dashboard</button>
            <button type="button" style={styles.secondaryButton} onClick={() => router.push('/options-strategy')}>Strategy Builder</button>
          </div>
        </div>

        <MarketContextPanel context={marketContext} indices={indices} theme={theme} styles={styles} />

        <div style={styles.card}>
          <div style={styles.tabRow}>
            <button type="button" style={mode === 'single' ? styles.tabActive : styles.tab} onClick={() => setMode('single')}>Single expiry</button>
            <button type="button" style={mode === 'calendar' ? styles.tabActive : styles.tab} onClick={() => setMode('calendar')}>Cross-expiry (calendar)</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <label>Spot<input value={spotPrice} onChange={(e) => setSpotPrice(Number(e.target.value))} style={styles.input} /></label>
            <label>Lot size<input value={lotSize} onChange={(e) => setLotSize(Number(e.target.value))} style={styles.input} /></label>
            <label>IV / VIX<input value={ivInput} onChange={(e) => setIvInput(e.target.value)} style={styles.input} /></label>
            <label>Rate %<input value={rateInput} onChange={(e) => setRateInput(e.target.value)} style={styles.input} /></label>
            <label>Model
              <select value={pricingSource} onChange={(e) => setPricingSource(e.target.value)} style={styles.input}>
                {PRICING_SOURCES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            {mode === 'single' ? (
              <label>Expiry
                <select value={selectedExpiry} onChange={(e) => setSelectedExpiry(e.target.value)} style={styles.input}>
                  {expiryOptions.map((d) => <option key={d} value={d}>{formatExpiryDisplay(d)}</option>)}
                </select>
              </label>
            ) : (
              <>
                <label>Sell expiry
                  <select value={calSellExpiry} onChange={(e) => setCalSellExpiry(e.target.value)} style={styles.input}>
                    {expiryOptions.map((d) => <option key={`s-${d}`} value={d}>{formatExpiryDisplay(d)}</option>)}
                  </select>
                </label>
                <label>Buy expiry
                  <select value={calBuyExpiry} onChange={(e) => setCalBuyExpiry(e.target.value)} style={styles.input}>
                    {expiryOptions.map((d) => <option key={`b-${d}`} value={d}>{formatExpiryDisplay(d)}</option>)}
                  </select>
                </label>
              </>
            )}
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" style={styles.button} disabled={loading} onClick={runAnalysis}>
              {loading ? 'Evaluating…' : mode === 'calendar' ? 'Run Calendar Optimizer' : 'Run Optimizer'}
            </button>
            {result ? (
              <span style={{ color: theme.green, fontSize: 13 }}>
                {result.totalCombinationsEvaluated?.toLocaleString()} combos · {result.viableCandidates?.toLocaleString()} viable
                {result.computeTimeMs ? ` · ${(result.computeTimeMs / 1000).toFixed(1)}s` : ''}
              </span>
            ) : null}
          </div>
          {error ? <div style={{ marginTop: 10, color: theme.red }}>{error}</div> : null}
        </div>

        {loading ? <CosmixLoader message="Running multi-factor optimizer…" /> : null}

        {result && selectedStrategy ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 16 }}>
            <div style={styles.card}>
              <div style={styles.eyebrow}>Selected strategy</div>
              <h3 style={{ margin: '0 0 8px' }}>{selectedStrategy.family}</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {selectedStrategy.legs.map((leg, i) => (
                  <span key={i} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 999, background: leg.side === 'SELL' ? `${theme.red}22` : `${theme.green}22`, color: leg.side === 'SELL' ? theme.red : theme.green }}>
                    {leg.side} {leg.strike} {leg.type}
                  </span>
                ))}
              </div>
              <div style={styles.metricGrid}>
                <div style={styles.metricTile}><div style={styles.metricLabel}>Max profit</div><div style={{ ...styles.metricValue, color: theme.green }}>{formatRs(selectedStrategy.maxProfit)}</div></div>
                <div style={styles.metricTile}><div style={styles.metricLabel}>Max loss</div><div style={{ ...styles.metricValue, color: theme.red }}>{formatRs(Math.abs(selectedStrategy.maxLoss))}</div></div>
                <div style={styles.metricTile}><div style={styles.metricLabel}>Credit</div><div style={styles.metricValue}>{formatRs(selectedStrategy.entryCredit)}</div></div>
                <div style={styles.metricTile}><div style={styles.metricLabel}>Profit zone</div><div style={styles.metricValue}>{selectedStrategy.profitZoneWidth} pts</div></div>
              </div>
              <FactorBars factors={selectedStrategy.factorScores} theme={theme} />
              <button type="button" style={{ ...styles.button, marginTop: 14, width: '100%' }} onClick={() => openInBuilder(selectedStrategy)}>
                Open in Strategy Builder
              </button>
            </div>
            <div style={styles.card}>
              <div style={styles.eyebrow}>Payoff at expiry</div>
              <PayoffMiniChart curve={selectedStrategy.payoffCurve} spot={result.spot} theme={theme} />
              <div style={{ marginTop: 10, fontSize: 12, color: theme.textSecondary }}>
                Break-evens: {selectedStrategy.breakEvens?.join(', ') || '—'} · R:R {selectedStrategy.rewardToRisk ? `1:${selectedStrategy.rewardToRisk}` : '—'}
              </div>
            </div>
          </div>
        ) : null}

        {result?.profiles?.map((profile) => (
          <div key={profile.key} style={styles.card}>
            <h3 style={{ margin: '0 0 6px' }}>{profile.label}</h3>
            <p style={styles.hint}>{profile.description}</p>
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              {(profile.strategies || []).map((strat) => (
                <button
                  key={`${profile.key}-${strat.rank}`}
                  type="button"
                  onClick={() => setSelectedStrategy(strat)}
                  style={{
                    textAlign: 'left',
                    background: selectedStrategy?.rank === strat.rank && selectedStrategy?.family === strat.family ? 'rgba(56,189,248,0.12)' : theme.panelDarkBg,
                    border: `1px solid ${selectedStrategy?.rank === strat.rank && selectedStrategy?.family === strat.family ? theme.cyan : theme.cardBorder}`,
                    borderRadius: 14,
                    padding: 14,
                    color: theme.textPrimary,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <strong>#{strat.rank} {strat.family}</strong>
                    <span style={{ color: theme.green }}>{formatRs(strat.maxProfit)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 6 }}>
                    Loss {formatRs(Math.abs(strat.maxLoss))} · Zone {strat.profitZoneWidth} pts · {strat.legCount} legs
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <MobileBottomNav activeId="dashboard" />
    </div>
  );
}
