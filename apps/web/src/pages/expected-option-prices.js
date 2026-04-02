import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';

const DEFAULT_STRIKES = '';
const DEFAULT_EXPIRIES = '2026-04-07,2026-04-14';
const FORMULA_DETAILS = {
  intrinsic: 'Intrinsic Value: max(S - K, 0) for CE, max(K - S, 0) for PE',
  blackScholes: 'Black-Scholes: C = S*N(d1) - K*e^(-rT)*N(d2), P = K*e^(-rT)*N(-d2) - S*N(-d1)',
  binomialCrr: 'Binomial CRR: backward induction on a Cox-Ross-Rubinstein tree with u = e^(sigma*sqrt(dt)) and d = 1/u',
  bachelier: 'Bachelier: discounted normal-model option price using forward minus strike over sigma*sqrt(T)',
  monteCarlo: 'Monte Carlo GBM: discounted average payoff from simulated terminal spots under geometric Brownian motion',
};

function buildUrl({ spot, strikes, expiries, rate }) {
  const params = new URLSearchParams({ symbol: 'NIFTY', expiries });
  if (String(spot || '').trim()) params.set('spot', spot);
  if (String(strikes || '').trim()) params.set('strikes', strikes);
  if (rate) params.set('rate', rate);
  return `/api/options-expected-price?${params.toString()}`;
}

function currency(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `Rs. ${Number(value).toFixed(2)}`;
}

export default function ExpectedOptionPrices() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [spot, setSpot] = useState('');
  const [strikes, setStrikes] = useState(DEFAULT_STRIKES);
  const [expiries, setExpiries] = useState(DEFAULT_EXPIRIES);
  const [rate, setRate] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');
  const [tooltipKey, setTooltipKey] = useState(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.push('/');
      return;
    }
    setUser(JSON.parse(storedUser));
  }, [router]);

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const response = await fetch(buildUrl({ spot, strikes, expiries, rate }));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load expected option prices');
      setPayload(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const groupedContracts = useMemo(() => {
    const map = new Map();
    (payload?.contracts || []).forEach((contract) => {
      if (!map.has(contract.expiryLabel)) map.set(contract.expiryLabel, []);
      map.get(contract.expiryLabel).push(contract);
    });
    return Array.from(map.entries());
  }, [payload]);

  if (!user) {
    return <div style={styles.loading}>Loading...</div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>Open-data pricing workspace</div>
          <h1 style={styles.title}>Expected NIFTY Option Prices</h1>
          <div style={styles.subtitle}>Formula-wise CE and PE estimates for selected strikes and expiries.</div>
        </div>
        <div style={styles.headerActions}>
          <button onClick={() => router.push('/dashboard')} style={styles.secondaryButton}>Back</button>
          <button onClick={() => loadData(true)} style={styles.primaryButton} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div style={styles.layout}>
        <div style={styles.panel}>
          <div style={styles.panelTitle}>Scenario</div>
          <label style={styles.label}>Reference spot</label>
          <input value={spot} onChange={(event) => setSpot(event.target.value)} style={styles.input} placeholder={payload ? `Live NIFTY ${payload.liveSpot}` : 'Uses current NIFTY automatically'} />
          <div style={styles.fieldHint}>Leave empty to use the current live NIFTY price automatically.</div>

          <label style={styles.label}>Strikes</label>
          <input value={strikes} onChange={(event) => setStrikes(event.target.value)} style={styles.input} placeholder={payload?.strikes?.length ? payload.strikes.join(', ') : 'Auto-center around live NIFTY'} />
          <div style={styles.fieldHint}>
            {String(strikes).trim()
              ? 'Enter comma-separated strikes to override the automatic centered set.'
              : `Using auto-centered strikes around live NIFTY${payload?.strikes?.length ? `: ${payload.strikes.join(', ')}` : ''}.`}
          </div>

          <label style={styles.label}>Expiries</label>
          <input value={expiries} onChange={(event) => setExpiries(event.target.value)} style={styles.input} />

          <label style={styles.label}>Risk-free rate override (%)</label>
          <input value={rate} onChange={(event) => setRate(event.target.value)} style={styles.input} placeholder="Optional" />

          <button onClick={() => loadData()} style={{ ...styles.primaryButton, width: '100%', marginTop: 18 }} disabled={loading}>
            {loading ? 'Calculating…' : 'Calculate expected prices'}
          </button>

          <div style={styles.noteBox}>
            <div style={styles.noteTitle}>Supported models</div>
            <div style={styles.noteText}>This screen shows open formulas implemented in the app: Intrinsic Value, Black-Scholes, Binomial CRR, Bachelier, and Monte Carlo GBM.</div>
          </div>
        </div>

        <div style={styles.content}>
          {error ? <div style={styles.error}>{error}</div> : null}

          {payload ? (
            <>
              <div style={styles.summaryGrid}>
                <div style={styles.heroCard}>
                  <div style={styles.heroLabel}>Reference spot used</div>
                  <div style={styles.heroValue}>{currency(payload.referenceSpot)}</div>
                  <div style={styles.heroMeta}>Live spot {currency(payload.liveSpot)}</div>
                </div>
                <div style={styles.heroCard}>
                  <div style={styles.heroLabel}>Volatility index</div>
                  <div style={styles.heroValue}>{payload.sources.volatilityIndex.value?.toFixed(2) ?? '—'}</div>
                  <div style={styles.heroMeta}>{payload.sources.volatilityIndex.source}</div>
                </div>
                <div style={styles.heroCard}>
                  <div style={styles.heroLabel}>Risk-free rate</div>
                  <div style={styles.heroValue}>{payload.sources.riskFreeRate.value.toFixed(2)}%</div>
                  <div style={styles.heroMeta}>{payload.sources.riskFreeRate.source}</div>
                </div>
              </div>

              <div style={styles.panel}>
                <div style={styles.panelTitle}>Open-source inputs</div>
                <div style={styles.sourceRow}><strong>Spot:</strong> {payload.sources.spot.source}</div>
                <div style={styles.sourceRow}><strong>Volatility index:</strong> {payload.sources.volatilityIndex.source}</div>
                <div style={styles.sourceRow}><strong>Option-chain IV:</strong> {payload.sources.optionsChain.source}</div>
                <div style={styles.sourceRow}><strong>Rate:</strong> {payload.sources.riskFreeRate.note}</div>
                {payload.sources.candidateOpenSources.map((source) => (
                  <div key={source} style={styles.sourceBullet}>• {source}</div>
                ))}
              </div>

              {groupedContracts.map(([expiryLabel, contracts]) => (
                <div key={expiryLabel} style={styles.expirySection}>
                  <div style={styles.expiryHeader}>
                    <div>
                      <div style={styles.expiryTitle}>{expiryLabel}</div>
                      <div style={styles.expirySubtitle}>Expected prices for CE and PE at 22500, 22600, 22700</div>
                    </div>
                  </div>

                  {contracts.map((contract) => (
                    <div key={`${contract.expiryUnix}-${contract.strike}-${contract.type}`} style={styles.contractCard}>
                      <div style={styles.contractHeader}>
                        <div>
                          <div style={styles.contractTitle}>{contract.strike} {contract.type}</div>
                          <div style={styles.contractMeta}>Applied IV {contract.appliedVolatility}% via {contract.volatilitySource}</div>
                        </div>
                        <div style={styles.contractMeta}>Live premium {currency(contract.livePremium)}</div>
                      </div>

                      <div style={styles.formulaGrid}>
                        {contract.formulaResults.map((formula) => (
                          <div key={formula.key} style={styles.formulaCard}>
                            <div
                              style={styles.formulaNameWrap}
                              onMouseEnter={() => setTooltipKey(`${contract.expiryUnix}-${contract.strike}-${contract.type}-${formula.key}`)}
                              onMouseLeave={() => setTooltipKey(null)}
                            >
                              <div style={styles.formulaName}>{formula.name}</div>
                              {tooltipKey === `${contract.expiryUnix}-${contract.strike}-${contract.type}-${formula.key}` ? (
                                <div style={styles.tooltipBox}>
                                  <div style={styles.tooltipTitle}>{formula.name}</div>
                                  <div style={styles.tooltipText}>{FORMULA_DETAILS[formula.key] || formula.name}</div>
                                </div>
                              ) : null}
                            </div>
                            <div style={styles.formulaPrice}>{currency(formula.price)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </>
          ) : null}

          {loading && !payload ? <div style={styles.loading}>Calculating expected prices…</div> : null}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    padding: '32px',
    background: 'radial-gradient(circle at top left, #173753 0%, #08131d 55%, #04090d 100%)',
    color: '#e8f1f8',
    fontFamily: 'Consolas, Monaco, monospace',
  },
  loading: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#dbeafe',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '24px',
  },
  eyebrow: {
    color: '#7dd3fc',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    fontSize: '11px',
    marginBottom: '8px',
  },
  title: {
    margin: 0,
    fontSize: '36px',
    lineHeight: 1.1,
  },
  subtitle: {
    marginTop: '10px',
    color: '#94a3b8',
    maxWidth: '720px',
  },
  headerActions: {
    display: 'flex',
    gap: '12px',
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(280px, 340px) minmax(0, 1fr)',
    gap: '20px',
    alignItems: 'start',
  },
  panel: {
    background: 'rgba(8, 16, 24, 0.82)',
    border: '1px solid rgba(125, 211, 252, 0.18)',
    borderRadius: '22px',
    padding: '20px',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.24)',
  },
  panelTitle: {
    fontSize: '18px',
    fontWeight: 700,
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    color: '#93c5fd',
    marginBottom: '6px',
    marginTop: '14px',
  },
  input: {
    width: '100%',
    borderRadius: '12px',
    border: '1px solid #1d4f74',
    background: '#071019',
    color: '#e8f1f8',
    padding: '12px 14px',
    fontSize: '14px',
  },
  fieldHint: {
    color: '#7b92a8',
    fontSize: '11px',
    marginTop: '6px',
  },
  primaryButton: {
    background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
    border: 'none',
    borderRadius: '999px',
    color: '#041118',
    fontWeight: 800,
    padding: '12px 18px',
    cursor: 'pointer',
  },
  secondaryButton: {
    background: 'transparent',
    border: '1px solid #315b7c',
    borderRadius: '999px',
    color: '#cbd5e1',
    padding: '12px 18px',
    cursor: 'pointer',
  },
  noteBox: {
    marginTop: '18px',
    padding: '14px',
    borderRadius: '16px',
    background: 'rgba(14, 165, 233, 0.09)',
    border: '1px solid rgba(125, 211, 252, 0.15)',
  },
  noteTitle: {
    fontWeight: 700,
    marginBottom: '8px',
  },
  noteText: {
    color: '#cbd5e1',
    fontSize: '12px',
    lineHeight: 1.45,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
  },
  heroCard: {
    background: 'linear-gradient(145deg, rgba(15, 35, 53, 0.95), rgba(8, 16, 24, 0.95))',
    border: '1px solid rgba(125, 211, 252, 0.18)',
    borderRadius: '18px',
    padding: '18px',
  },
  heroLabel: {
    color: '#7dd3fc',
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
  },
  heroValue: {
    marginTop: '10px',
    fontSize: '28px',
    fontWeight: 800,
  },
  heroMeta: {
    marginTop: '6px',
    color: '#94a3b8',
    fontSize: '12px',
  },
  sourceRow: {
    color: '#dbeafe',
    marginBottom: '8px',
    fontSize: '14px',
  },
  sourceBullet: {
    color: '#94a3b8',
    fontSize: '13px',
    marginTop: '4px',
  },
  expirySection: {
    background: 'rgba(4, 10, 16, 0.88)',
    border: '1px solid rgba(125, 211, 252, 0.16)',
    borderRadius: '18px',
    padding: '16px',
  },
  expiryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  expiryTitle: {
    fontSize: '18px',
    fontWeight: 800,
  },
  expirySubtitle: {
    marginTop: '4px',
    color: '#94a3b8',
    fontSize: '12px',
  },
  contractCard: {
    borderTop: '1px solid rgba(125, 211, 252, 0.1)',
    paddingTop: '12px',
    marginTop: '12px',
  },
  contractHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: '8px',
  },
  contractTitle: {
    fontSize: '16px',
    fontWeight: 700,
  },
  contractMeta: {
    color: '#94a3b8',
    fontSize: '11px',
  },
  formulaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(108px, 1fr))',
    gap: '6px',
  },
  formulaCard: {
    borderRadius: '10px',
    background: 'linear-gradient(180deg, rgba(9, 22, 33, 0.95), rgba(6, 14, 20, 0.95))',
    border: '1px solid rgba(49, 91, 124, 0.55)',
    padding: '8px 9px',
    position: 'relative',
    overflow: 'visible',
    minHeight: '72px',
  },
  formulaNameWrap: {
    position: 'relative',
    display: 'inline-block',
  },
  formulaName: {
    color: '#93c5fd',
    fontSize: '10px',
    minHeight: '24px',
    cursor: 'help',
    lineHeight: 1.25,
  },
  formulaPrice: {
    fontSize: '16px',
    fontWeight: 800,
    marginTop: '4px',
  },
  tooltipBox: {
    position: 'absolute',
    left: 0,
    top: 'calc(100% + 8px)',
    width: '220px',
    zIndex: 10,
    padding: '10px 11px',
    borderRadius: '12px',
    background: 'rgba(2, 6, 23, 0.96)',
    border: '1px solid rgba(125, 211, 252, 0.28)',
    boxShadow: '0 18px 40px rgba(0, 0, 0, 0.35)',
  },
  tooltipTitle: {
    color: '#e2e8f0',
    fontSize: '11px',
    fontWeight: 700,
    marginBottom: '6px',
  },
  tooltipText: {
    color: '#cbd5e1',
    fontSize: '11px',
    lineHeight: 1.4,
  },
  error: {
    borderRadius: '16px',
    padding: '14px 16px',
    border: '1px solid rgba(248, 113, 113, 0.35)',
    background: 'rgba(127, 29, 29, 0.35)',
    color: '#fecaca',
  },
};