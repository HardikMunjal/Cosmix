import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';

const DEFAULT_STRIKES = '';
const DEFAULT_STRIKE_GAP = '100';
const DEFAULT_STRIKE_LEVELS = '3';
const DEFAULT_EXPIRY_COUNT = '1';
const FORMULA_DETAILS = {
  intrinsic: 'Intrinsic Value: max(S - K, 0) for CE, max(K - S, 0) for PE',
  blackScholes: 'Black-Scholes: C = S*N(d1) - K*e^(-rT)*N(d2), P = K*e^(-rT)*N(-d2) - S*N(-d1)',
  binomialCrr: 'Binomial CRR: backward induction on a Cox-Ross-Rubinstein tree with u = e^(sigma*sqrt(dt)) and d = 1/u',
  bachelier: 'Bachelier: discounted normal-model option price using forward minus strike over sigma*sqrt(T)',
  monteCarlo: 'Monte Carlo GBM: discounted average payoff from simulated terminal spots under geometric Brownian motion',
};

function buildUrl({ spot, strikes, rate, strikeGap, strikeLevels, expiryCount }) {
  const params = new URLSearchParams({ symbol: 'NIFTY' });
  if (String(spot || '').trim()) params.set('spot', spot);
  if (String(strikes || '').trim()) params.set('strikes', strikes);
  if (rate) params.set('rate', rate);
  if (strikeGap) params.set('strikeGap', strikeGap);
  if (strikeLevels) params.set('strikeLevels', strikeLevels);
  if (expiryCount) params.set('expiryCount', expiryCount);
  return `/api/options-expected-price?${params.toString()}`;
}

function currency(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `Rs. ${Number(value).toFixed(2)}`;
}

function buildContractMap(contracts = []) {
  const map = new Map();
  contracts.forEach((contract) => {
    const baseKey = `${contract.expiryUnix}-${contract.strike}-${contract.type}`;
    map.set(`${baseKey}-livePremium`, contract.livePremium);
    map.set(`${baseKey}-appliedVolatility`, contract.appliedVolatility);
    (contract.formulaResults || []).forEach((formula) => {
      map.set(`${baseKey}-${formula.key}`, formula.price);
    });
  });
  return map;
}

function getValueTone(currentValue, previousValue) {
  if (currentValue == null || previousValue == null) return null;
  if (Number(currentValue) > Number(previousValue)) return 'up';
  if (Number(currentValue) < Number(previousValue)) return 'down';
  return null;
}

function getStrikeEmphasis(strike, spotValue, strikeGap = 100) {
  const distance = Math.abs(Number(strike) - Number(spotValue));
  const normalizedGap = Math.max(Number(strikeGap) || 100, 1);
  if (distance <= normalizedGap / 2) return 'atm';
  if (distance <= normalizedGap) return 'near';
  if (distance <= normalizedGap * 2) return 'mid';
  return 'far';
}

function getRowStyle(optionType) {
  return optionType === 'CE' ? styles.ceRow : styles.peRow;
}

function getTypeCellStyle(optionType) {
  return optionType === 'CE' ? styles.ceTypeCell : styles.peTypeCell;
}

function getSectionStyle(optionType) {
  return optionType === 'CE' ? styles.callsSection : styles.putsSection;
}

function getSectionTitle(optionType) {
  return optionType === 'CE' ? 'Calls (CE)' : 'Puts (PE)';
}

function toPascalCase(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function getStrikeBadge(strikeEmphasis) {
  if (strikeEmphasis === 'atm') return 'ATM';
  if (strikeEmphasis === 'near') return 'Near';
  return null;
}

function getStickyColumnStyle(left, background, zIndex = 2) {
  return {
    position: 'sticky',
    left,
    zIndex,
    background,
    boxShadow: '1px 0 0 rgba(49, 91, 124, 0.32), 10px 0 18px rgba(2, 6, 23, 0.18)',
  };
}

function getStickyHeadStyle(left, zIndex = 4) {
  return {
    position: 'sticky',
    left,
    zIndex,
    background: 'rgba(4, 12, 20, 0.99)',
    boxShadow: '1px 0 0 rgba(49, 91, 124, 0.34), 10px 0 18px rgba(2, 6, 23, 0.2)',
  };
}

function formatZoneList(zones = []) {
  if (!zones.length) return 'None';
  return zones
    .map((zone) => `${currency(zone.from)} to ${currency(zone.to)}`)
    .join(' · ');
}

function formatLeg(leg) {
  return `${leg.side} ${leg.quantity > 1 ? `${leg.quantity}x ` : ''}${leg.strike} ${leg.type}`;
}

export default function ExpectedOptionPrices() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [rate, setRate] = useState('');
  const [strikeGap, setStrikeGap] = useState(DEFAULT_STRIKE_GAP);
  const [strikeLevels, setStrikeLevels] = useState(DEFAULT_STRIKE_LEVELS);
  const [expiryCount, setExpiryCount] = useState(DEFAULT_EXPIRY_COUNT);
  const [autoSettingsOpen, setAutoSettingsOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');
  const [tooltipKey, setTooltipKey] = useState(null);
  const [flashMap, setFlashMap] = useState({});
  const flashTimeoutRef = useRef(null);

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
      const response = await fetch(buildUrl({ spot: '', strikes: '', rate, strikeGap, strikeLevels, expiryCount }));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load expected option prices');
      const previousMap = buildContractMap(payload?.contracts || []);
      const nextMap = buildContractMap(data?.contracts || []);
      const nextFlashMap = {};
      nextMap.forEach((currentValue, key) => {
        const tone = getValueTone(currentValue, previousMap.get(key));
        if (tone) nextFlashMap[key] = tone;
      });
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      setFlashMap(nextFlashMap);
      if (Object.keys(nextFlashMap).length) {
        flashTimeoutRef.current = setTimeout(() => setFlashMap({}), 1800);
      }
      setPayload(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => () => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    const interval = setInterval(() => {
      loadData(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [user, rate, strikeGap, strikeLevels, expiryCount]);

  const groupedContracts = useMemo(() => {
    const map = new Map();
    (payload?.contracts || []).forEach((contract) => {
      if (!map.has(contract.expiryLabel)) map.set(contract.expiryLabel, []);
      map.get(contract.expiryLabel).push(contract);
    });
    return Array.from(map.entries());
  }, [payload]);

  const strategySuggestionsByExpiry = useMemo(() => {
    const map = new Map();
    (payload?.strategySuggestions || []).forEach((entry) => {
      map.set(entry.expiryUnix, entry);
    });
    return map;
  }, [payload]);

  const renderContractsTable = (expiryLabel, contracts, optionType) => {
    const optionContracts = contracts.filter((contract) => contract.type === optionType);
    if (!optionContracts.length) return null;

    return (
      <div key={`${expiryLabel}-${optionType}`} style={{ ...styles.optionTypeSection, ...getSectionStyle(optionType) }}>
        <div style={styles.optionTypeHeader}>
          <div style={styles.optionTypeTitle}>{getSectionTitle(optionType)}</div>
          <div style={styles.optionTypeHint}>Same row height, clearer side separation, near-spot strikes tagged.</div>
        </div>

        <div style={styles.tableWrap} className="expected-prices-table-wrap">
          <table style={styles.table} className="expected-prices-table">
            <thead>
              <tr>
                <th className="expected-sticky-head expected-sticky-strike" style={{ ...styles.tableHead, ...getStickyHeadStyle(0, 7), ...styles.strikeHead }}>Strike</th>
                <th className="expected-sticky-head expected-sticky-type" style={{ ...styles.tableHead, ...getStickyHeadStyle(116, 7), ...styles.typeHead }}>Type</th>
                <th className="expected-sticky-head expected-sticky-live" style={{ ...styles.tableHead, ...getStickyHeadStyle(188, 7), ...styles.liveHead }}>Live</th>
                <th className="expected-sticky-head expected-sticky-iv" style={{ ...styles.tableHead, ...getStickyHeadStyle(304, 7), ...styles.ivHead }}>IV</th>
                {payload.formulas.map((formula) => (
                  <th key={`${expiryLabel}-${optionType}-${formula.key}`} style={styles.tableHead}>
                    <div
                      style={styles.formulaNameWrap}
                      onMouseEnter={() => setTooltipKey(`${expiryLabel}-${optionType}-${formula.key}`)}
                      onMouseLeave={() => setTooltipKey(null)}
                    >
                      <span style={styles.formulaHeadLabel}>{formula.name}</span>
                      {tooltipKey === `${expiryLabel}-${optionType}-${formula.key}` ? (
                        <div style={styles.tooltipBox}>
                          <div style={styles.tooltipTitle}>{formula.name}</div>
                          <div style={styles.tooltipText}>{FORMULA_DETAILS[formula.key] || formula.name}</div>
                        </div>
                      ) : null}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {optionContracts.map((contract) => {
                const rowStyle = getRowStyle(contract.type);
                const baseKey = `${contract.expiryUnix}-${contract.strike}-${contract.type}`;
                const liveTone = flashMap[`${baseKey}-livePremium`] || null;
                const ivTone = flashMap[`${baseKey}-appliedVolatility`] || null;
                const strikeEmphasis = getStrikeEmphasis(contract.strike, payload.referenceSpot, payload.inputs?.strikeGap || strikeGap);
                const strikeBand = toPascalCase(strikeEmphasis);
                const bandRowStyle = styles[`row${strikeBand}`] || null;
                const stickyBandStyle = styles[`sticky${strikeBand}`] || null;
                const stickyBackground = stickyBandStyle?.background || 'rgba(6, 14, 22, 0.97)';
                const strikeBadge = getStrikeBadge(strikeEmphasis);

                return (
                  <tr key={`${contract.expiryUnix}-${contract.strike}-${contract.type}`} style={{ ...rowStyle, ...bandRowStyle }}>
                    <td className="expected-sticky-cell expected-sticky-strike" style={{ ...styles.tableCellStrong, ...styles.strikeCell, ...styles[`strike${strikeBand}`], ...getStickyColumnStyle(0, stickyBackground, 6) }}>
                      <div style={styles.strikeCellContent}>
                        <span>{contract.strike}</span>
                        {strikeBadge ? <span style={strikeBadge === 'ATM' ? styles.strikeBadgeAtm : styles.strikeBadgeNear}>{strikeBadge}</span> : null}
                      </div>
                    </td>
                    <td className="expected-sticky-cell expected-sticky-type" style={{ ...getTypeCellStyle(contract.type), ...styles.typeCell, ...getStickyColumnStyle(116, stickyBackground, 6) }}>{contract.type}</td>
                    <td className="expected-sticky-cell expected-sticky-live" style={{ ...styles.tableCell, ...styles.liveCell, ...styles[`tone${liveTone ? liveTone.charAt(0).toUpperCase() + liveTone.slice(1) : 'Flat'}`], ...getStickyColumnStyle(188, stickyBackground, 6) }}>{currency(contract.livePremium)}</td>
                    <td className="expected-sticky-cell expected-sticky-iv" style={{ ...styles.tableCell, ...styles.ivCell, ...styles[`tone${ivTone ? ivTone.charAt(0).toUpperCase() + ivTone.slice(1) : 'Flat'}`], ...getStickyColumnStyle(304, stickyBackground, 6) }}>{contract.appliedVolatility}%</td>
                    {payload.formulas.map((formula) => {
                      const result = contract.formulaResults.find((entry) => entry.key === formula.key);
                      const tone = flashMap[`${baseKey}-${formula.key}`] || null;
                      return (
                        <td key={`${contract.expiryUnix}-${contract.strike}-${contract.type}-${formula.key}`} style={{ ...styles.tableCell, ...styles[`tone${tone ? tone.charAt(0).toUpperCase() + tone.slice(1) : 'Flat'}`] }}>
                          {currency(result?.price)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (!user) {
    return <div style={styles.loading}>Loading...</div>;
  }

  return (
    <>
      <style>{`
        @media (max-width: 900px) {
          .expected-prices-page {
            padding: 16px !important;
          }
          .expected-prices-layout {
            grid-template-columns: 1fr !important;
          }
          .expected-prices-header {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .expected-prices-actions {
            width: 100%;
          }
          .expected-prices-actions button {
            flex: 1;
          }
          .expected-prices-summary {
            grid-template-columns: 1fr !important;
          }
          .expected-prices-option-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 640px) {
          .expected-prices-page {
            padding: 12px !important;
          }
          .expected-prices-title {
            font-size: 26px !important;
          }
          .expected-prices-panel {
            padding: 14px !important;
            border-radius: 16px !important;
          }
          .expected-prices-table-wrap {
            border-radius: 12px !important;
          }
          .expected-prices-table {
            min-width: 760px !important;
          }
          .expected-prices-expiry {
            padding: 12px !important;
          }
          .expected-sticky-head,
          .expected-sticky-cell {
            position: static !important;
            left: auto !important;
            box-shadow: none !important;
          }
          .expected-prices-actions {
            flex-wrap: wrap !important;
          }
          .expected-prices-actions button {
            width: 100%;
          }
        }

        @media (max-width: 520px) {
          .expected-prices-table {
            min-width: 680px !important;
          }
          .expected-prices-title {
            font-size: 22px !important;
          }
          .expected-prices-panel {
            padding: 12px !important;
          }
          .expected-prices-option-grid {
            gap: 10px !important;
          }
        }
      `}</style>
      <div style={styles.page} className="expected-prices-page">
      <div style={styles.header} className="expected-prices-header">
        <div>
          <div style={styles.eyebrow}>Open-data pricing workspace</div>
          <h1 style={styles.title} className="expected-prices-title">Expected NIFTY Option Prices</h1>
          <div style={styles.subtitle}>Formula-wise CE and PE estimates for selected strikes and expiries.</div>
        </div>
        <div style={styles.headerActions} className="expected-prices-actions">
          <button onClick={() => router.push('/dashboard')} style={styles.secondaryButton}>Back</button>
          <button onClick={() => loadData(true)} style={styles.primaryButton} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div style={styles.layout} className="expected-prices-layout">
        <div style={styles.panel} className="expected-prices-panel">
          <div style={styles.panelTitle}>Scenario</div>
          <div style={styles.fieldHint}>Live NIFTY spot and nearby strikes are generated automatically.</div>

          <div style={styles.autoSettingsCard}>
            <button type="button" onClick={() => setAutoSettingsOpen((current) => !current)} style={styles.autoSettingsToggle}>
              <span style={styles.autoSettingsTitle}>Auto Settings</span>
              <span style={styles.autoSettingsChevron}>{autoSettingsOpen ? '−' : '+'}</span>
            </button>
            <div style={styles.autoSettingsHint}>These apply only when strikes or expiries are left blank.</div>

            {autoSettingsOpen ? (
              <>
                <div style={styles.settingBlock}>
                  <div style={styles.settingLabel}>Strikes each side</div>
                  <div style={styles.toggleRow}>
                    {['2', '3', '4', '5'].map((levelOption) => (
                      <button
                        key={levelOption}
                        type="button"
                        onClick={() => setStrikeLevels(levelOption)}
                        style={strikeLevels === levelOption ? styles.toggleButtonActive : styles.toggleButton}
                      >
                        {levelOption}
                      </button>
                    ))}
                  </div>
                  <div style={styles.fieldHint}>Shows {strikeLevels} strikes above and {strikeLevels} below the live spot.</div>
                </div>

                <div style={styles.settingBlock}>
                  <div style={styles.settingLabel}>Strike gap</div>
                  <div style={styles.toggleRow}>
                    {['50', '100', '150', '200'].map((gapOption) => (
                      <button
                        key={gapOption}
                        type="button"
                        onClick={() => setStrikeGap(gapOption)}
                        style={strikeGap === gapOption ? styles.toggleButtonActive : styles.toggleButton}
                      >
                        {gapOption}
                      </button>
                    ))}
                  </div>
                  <div style={styles.fieldHint}>Uses {strikeGap}-point spacing for auto-generated strikes.</div>
                </div>

                <div style={styles.settingBlock}>
                  <div style={styles.settingLabel}>Expiry count</div>
                  <div style={styles.toggleRow}>
                    {['1', '2', '3', '4'].map((countOption) => (
                      <button
                        key={countOption}
                        type="button"
                        onClick={() => setExpiryCount(countOption)}
                        style={expiryCount === countOption ? styles.toggleButtonActive : styles.toggleButton}
                      >
                        {countOption}
                      </button>
                    ))}
                  </div>
                  <div style={styles.fieldHint}>Shows the next {expiryCount} expiry{expiryCount === '1' ? '' : 'ies'} in auto mode.</div>
                </div>
              </>
            ) : null}
          </div>

          <label style={styles.label}>Risk-free rate override (%)</label>
          <input value={rate} onChange={(event) => setRate(event.target.value)} style={styles.input} placeholder="Optional" />

          <button onClick={() => loadData()} style={{ ...styles.primaryButton, width: '100%', marginTop: 18 }} disabled={loading}>
            {loading ? 'Calculating…' : 'Calculate expected prices'}
          </button>

          <div style={styles.noteBox}>
            <div style={styles.noteTitle}>Supported models</div>
            <div style={styles.noteText}>This screen shows open formulas implemented in the app: Intrinsic Value, Black-Scholes, Binomial CRR, Bachelier, and Monte Carlo GBM.</div>
          </div>

          {payload?.sources?.optionsChain?.source !== 'nse-public-options-chain' ? (
            <div style={styles.modelWarningBox}>
              <div style={styles.modelWarningTitle}>Live option-chain quotes unavailable</div>
              <div style={styles.modelWarningText}>
                Current option premiums on this screen are being estimated from the fallback volatility model, not pulled from the live NSE option chain. That means deep OTM weekly options can differ materially from the actual market premium.
              </div>
            </div>
          ) : null}
        </div>

        <div style={styles.content}>
          {error ? <div style={styles.error}>{error}</div> : null}

          {payload ? (
            <>
              <div style={styles.summaryGrid} className="expected-prices-summary">
                <div style={styles.heroCard}>
                  <div style={styles.heroLabel}>Reference spot used</div>
                  <div style={styles.heroValue}>{currency(payload.referenceSpot)}</div>
                  <div style={styles.heroMeta}>Live spot {currency(payload.liveSpot)} · refreshes every 10s</div>
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
                <div key={expiryLabel} style={styles.expirySection} className="expected-prices-expiry">
                  <div style={styles.expiryHeader}>
                    <div>
                      <div style={styles.expiryTitle}>{expiryLabel}</div>
                      <div style={styles.expirySubtitle}>Calls and puts are separated into different tables for faster scanning.</div>
                    </div>
                  </div>

                  {strategySuggestionsByExpiry.get(contracts[0]?.expiryUnix) ? (
                    <div style={styles.strategyBoard}>
                      <div style={styles.strategyBoardHeader}>
                        <div>
                          <div style={styles.strategyBoardTitle}>Suggested strategy combinations</div>
                          <div style={styles.strategyBoardHint}>The model scans multiple short-distance and wing-width patterns around spot, then ranks the best combinations for credit, range, and balance.</div>
                        </div>
                        <div style={styles.strategySpotChip}>Spot {currency(payload.referenceSpot)}</div>
                      </div>

                      {strategySuggestionsByExpiry.get(contracts[0]?.expiryUnix).families.map((family) => (
                        <div key={family.key} style={styles.strategyFamily}>
                          <div style={styles.strategyFamilyHeader}>
                            <div>
                              <div style={styles.strategyFamilyTitle}>{family.name}</div>
                              <div style={styles.strategyFamilyHint}>{family.description}</div>
                            </div>
                          </div>

                          <div style={styles.strategyProfilesGrid}>
                            {family.profiles.map((profile) => (
                              <div key={`${family.key}-${profile.key}`} style={styles.strategyProfileCard}>
                                <div style={styles.strategyProfileTop}>
                                  <div>
                                    <div style={styles.strategyProfileLabel}>{profile.label}</div>
                                    <div style={styles.strategyProfileHint}>{profile.description}</div>
                                  </div>
                                  <div style={styles.strategyPremiumBadge}>{profile.premiumMode === 'live-premium' ? 'Live premium' : profile.premiumMode === 'mixed' ? 'Mixed input' : 'Estimated premium'}</div>
                                </div>

                                <div style={styles.strategyLegList}>
                                  {profile.legs.map((leg) => (
                                    <div key={`${family.key}-${profile.key}-${leg.side}-${leg.quantity}-${leg.type}-${leg.strike}`} style={styles.strategyLegRow}>
                                      <span>{formatLeg(leg)}</span>
                                      <span>{currency(leg.premium)}</span>
                                    </div>
                                  ))}
                                </div>

                                <div style={styles.strategyMetricsGrid}>
                                  <div style={styles.strategyMetricBox}>
                                    <div style={styles.strategyMetricLabel}>Entry credit</div>
                                    <div style={styles.strategyMetricValue}>{currency(profile.entryCredit)}</div>
                                  </div>
                                  <div style={styles.strategyMetricBox}>
                                    <div style={styles.strategyMetricLabel}>Max profit</div>
                                    <div style={{ ...styles.strategyMetricValue, color: '#86efac' }}>{currency(profile.maxProfit)}</div>
                                  </div>
                                  <div style={styles.strategyMetricBox}>
                                    <div style={styles.strategyMetricLabel}>Max loss</div>
                                    <div style={{ ...styles.strategyMetricValue, color: '#fca5a5' }}>{currency(Math.abs(profile.maxLoss))}</div>
                                  </div>
                                  <div style={styles.strategyMetricBox}>
                                    <div style={styles.strategyMetricLabel}>Reward / risk</div>
                                    <div style={styles.strategyMetricValue}>{profile.rewardToRisk != null ? `${profile.rewardToRisk.toFixed(2)}x` : '—'}</div>
                                  </div>
                                  <div style={styles.strategyMetricBox}>
                                    <div style={styles.strategyMetricLabel}>Profit width</div>
                                    <div style={styles.strategyMetricValue}>{profile.profitZoneWidth.toFixed(0)} pts</div>
                                  </div>
                                  <div style={styles.strategyMetricBox}>
                                    <div style={styles.strategyMetricLabel}>Payoff at spot</div>
                                    <div style={{ ...styles.strategyMetricValue, color: profile.payoffAtSpot >= 0 ? '#93c5fd' : '#fca5a5' }}>{currency(profile.payoffAtSpot)}</div>
                                  </div>
                                </div>

                                <div style={styles.strategyMetaRow}><strong>Break-even:</strong> {profile.breakEvens.length ? profile.breakEvens.map((value) => currency(value)).join(' · ') : 'None inside sampled range'}</div>
                                <div style={styles.strategyMetaRow}><strong>Profit zones:</strong> {formatZoneList(profile.profitZones)}</div>
                                <div style={styles.strategyMetaRow}><strong>Loss zones:</strong> {formatZoneList(profile.lossZones)}</div>
                                <div style={styles.strategyMetaRow}><strong>Shape:</strong> Short strikes are {profile.shortDistance.toFixed(0)} points away from spot, wings are another {profile.wingWidth.toFixed(0)} points farther out.</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div style={styles.optionTypeGrid} className="expected-prices-option-grid">
                    {renderContractsTable(expiryLabel, contracts, 'CE')}
                    {renderContractsTable(expiryLabel, contracts, 'PE')}
                  </div>
                </div>
              ))}
            </>
          ) : null}

          {loading && !payload ? <div style={styles.loading}>Calculating expected prices…</div> : null}
        </div>
      </div>
      </div>
    </>
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
  autoSettingsCard: {
    marginTop: '14px',
    padding: '14px',
    borderRadius: '16px',
    background: 'rgba(7, 18, 28, 0.92)',
    border: '1px solid rgba(49, 91, 124, 0.3)',
  },
  autoSettingsToggle: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    textAlign: 'left',
  },
  autoSettingsTitle: {
    color: '#e2e8f0',
    fontSize: '13px',
    fontWeight: 800,
  },
  autoSettingsChevron: {
    color: '#7dd3fc',
    fontSize: '18px',
    fontWeight: 700,
    lineHeight: 1,
  },
  autoSettingsHint: {
    color: '#7b92a8',
    fontSize: '11px',
    marginTop: '4px',
    marginBottom: '10px',
  },
  settingBlock: {
    marginTop: '10px',
  },
  settingLabel: {
    color: '#93c5fd',
    fontSize: '11px',
    fontWeight: 700,
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  toggleRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginTop: '8px',
  },
  toggleButton: {
    border: '1px solid #315b7c',
    background: '#071019',
    color: '#cbd5e1',
    borderRadius: '999px',
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 700,
  },
  toggleButtonActive: {
    border: '1px solid #0ea5e9',
    background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.22), rgba(34, 197, 94, 0.2))',
    color: '#e0f2fe',
    borderRadius: '999px',
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 800,
    boxShadow: '0 0 0 1px rgba(14, 165, 233, 0.18) inset',
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
  modelWarningBox: {
    marginTop: '18px',
    padding: '14px',
    borderRadius: '16px',
    background: 'rgba(245, 158, 11, 0.1)',
    border: '1px solid rgba(245, 158, 11, 0.24)',
  },
  modelWarningTitle: {
    color: '#fde68a',
    fontWeight: 800,
    marginBottom: '6px',
  },
  modelWarningText: {
    color: '#fef3c7',
    fontSize: '12px',
    lineHeight: 1.5,
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
  strategyBoard: {
    marginBottom: '18px',
    borderRadius: '16px',
    padding: '14px',
    background: 'linear-gradient(180deg, rgba(5, 16, 24, 0.92), rgba(7, 18, 28, 0.82))',
    border: '1px solid rgba(125, 211, 252, 0.18)',
  },
  strategyBoardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    marginBottom: '12px',
  },
  strategyBoardTitle: {
    fontSize: '16px',
    fontWeight: 800,
    color: '#f8fafc',
  },
  strategyBoardHint: {
    marginTop: '4px',
    fontSize: '12px',
    color: '#94a3b8',
    maxWidth: '780px',
    lineHeight: 1.5,
  },
  strategySpotChip: {
    padding: '8px 12px',
    borderRadius: '999px',
    background: 'rgba(14, 165, 233, 0.12)',
    border: '1px solid rgba(125, 211, 252, 0.18)',
    color: '#bae6fd',
    fontSize: '12px',
    fontWeight: 700,
  },
  strategyFamily: {
    marginTop: '14px',
    paddingTop: '14px',
    borderTop: '1px solid rgba(49, 91, 124, 0.26)',
  },
  strategyFamilyHeader: {
    marginBottom: '10px',
  },
  strategyFamilyTitle: {
    fontSize: '15px',
    fontWeight: 800,
    color: '#e2e8f0',
  },
  strategyFamilyHint: {
    marginTop: '4px',
    color: '#9fb3c8',
    fontSize: '12px',
    lineHeight: 1.45,
  },
  strategyProfilesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '12px',
  },
  strategyProfileCard: {
    borderRadius: '16px',
    padding: '14px',
    background: 'rgba(7, 18, 28, 0.95)',
    border: '1px solid rgba(49, 91, 124, 0.34)',
    boxShadow: '0 12px 28px rgba(0, 0, 0, 0.22)',
  },
  strategyProfileTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '10px',
    marginBottom: '12px',
  },
  strategyProfileLabel: {
    fontSize: '14px',
    fontWeight: 800,
    color: '#f8fafc',
  },
  strategyProfileHint: {
    marginTop: '4px',
    color: '#94a3b8',
    fontSize: '11px',
    lineHeight: 1.45,
  },
  strategyPremiumBadge: {
    whiteSpace: 'nowrap',
    borderRadius: '999px',
    padding: '6px 10px',
    background: 'rgba(34, 197, 94, 0.12)',
    border: '1px solid rgba(34, 197, 94, 0.18)',
    color: '#bbf7d0',
    fontSize: '11px',
    fontWeight: 700,
  },
  strategyLegList: {
    display: 'grid',
    gap: '6px',
    marginBottom: '12px',
  },
  strategyLegRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    color: '#dbeafe',
    fontSize: '12px',
    padding: '8px 10px',
    borderRadius: '10px',
    background: 'rgba(5, 13, 20, 0.78)',
    border: '1px solid rgba(49, 91, 124, 0.18)',
  },
  strategyMetricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '8px',
    marginBottom: '12px',
  },
  strategyMetricBox: {
    borderRadius: '12px',
    padding: '10px',
    background: 'rgba(11, 24, 34, 0.88)',
    border: '1px solid rgba(49, 91, 124, 0.24)',
  },
  strategyMetricLabel: {
    fontSize: '10px',
    color: '#7dd3fc',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '6px',
  },
  strategyMetricValue: {
    fontSize: '15px',
    fontWeight: 800,
    color: '#f8fafc',
  },
  strategyMetaRow: {
    marginTop: '6px',
    fontSize: '12px',
    color: '#cbd5e1',
    lineHeight: 1.45,
  },
  expirySection: {
    background: 'rgba(4, 10, 16, 0.88)',
    border: '1px solid rgba(125, 211, 252, 0.16)',
    borderRadius: '18px',
    padding: '16px',
  },
  optionTypeGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '14px',
  },
  optionTypeSection: {
    borderRadius: '16px',
    padding: '12px',
    border: '1px solid rgba(49, 91, 124, 0.24)',
  },
  callsSection: {
    background: 'linear-gradient(180deg, rgba(12, 32, 22, 0.72), rgba(5, 13, 20, 0.7))',
  },
  putsSection: {
    background: 'linear-gradient(180deg, rgba(38, 14, 14, 0.72), rgba(5, 13, 20, 0.7))',
  },
  optionTypeHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    marginBottom: '10px',
  },
  optionTypeTitle: {
    fontSize: '14px',
    fontWeight: 800,
    color: '#f8fafc',
  },
  optionTypeHint: {
    fontSize: '11px',
    color: '#9fb3c8',
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
  tableWrap: {
    overflowX: 'auto',
    borderRadius: '14px',
    border: '1px solid rgba(49, 91, 124, 0.45)',
    background: 'rgba(5, 13, 20, 0.72)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '1040px',
  },
  tableHead: {
    position: 'relative',
    textAlign: 'left',
    padding: '10px 10px',
    color: '#93c5fd',
    fontSize: '10px',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    borderBottom: '1px solid rgba(49, 91, 124, 0.45)',
    background: 'rgba(8, 20, 30, 0.92)',
    whiteSpace: 'nowrap',
  },
  tableCell: {
    padding: '9px 10px',
    color: '#dbeafe',
    fontSize: '12px',
    borderTop: '1px solid rgba(49, 91, 124, 0.22)',
    whiteSpace: 'nowrap',
  },
  tableCellStrong: {
    padding: '9px 10px',
    color: '#f8fafc',
    fontSize: '12px',
    fontWeight: 700,
    borderTop: '1px solid rgba(49, 91, 124, 0.22)',
    whiteSpace: 'nowrap',
  },
  strikeHead: {
    minWidth: '96px',
  },
  typeHead: {
    minWidth: '72px',
  },
  liveHead: {
    minWidth: '116px',
  },
  ivHead: {
    minWidth: '84px',
  },
  strikeCell: {
    transition: 'background-color 160ms ease, color 160ms ease',
  },
  strikeCellContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  strikeBadgeAtm: {
    borderRadius: '999px',
    padding: '2px 8px',
    fontSize: '10px',
    fontWeight: 800,
    background: 'rgba(250, 204, 21, 0.22)',
    color: '#fde68a',
    border: '1px solid rgba(250, 204, 21, 0.35)',
  },
  strikeBadgeNear: {
    borderRadius: '999px',
    padding: '2px 8px',
    fontSize: '10px',
    fontWeight: 800,
    background: 'rgba(56, 189, 248, 0.18)',
    color: '#bae6fd',
    border: '1px solid rgba(56, 189, 248, 0.3)',
  },
  strikeAtm: {
    background: 'linear-gradient(90deg, rgba(250, 204, 21, 0.34), rgba(250, 204, 21, 0.16))',
    color: '#fef08a',
  },
  strikeNear: {
    background: 'linear-gradient(90deg, rgba(56, 189, 248, 0.22), rgba(56, 189, 248, 0.12))',
    color: '#bae6fd',
  },
  strikeMid: {
    background: 'linear-gradient(90deg, rgba(59, 130, 246, 0.14), rgba(59, 130, 246, 0.08))',
  },
  strikeFar: {
    background: 'rgba(5, 13, 20, 0.45)',
  },
  rowAtm: {
    boxShadow: 'inset 0 0 0 1px rgba(250, 204, 21, 0.18)',
  },
  rowNear: {
    boxShadow: 'inset 0 0 0 1px rgba(56, 189, 248, 0.14)',
  },
  rowMid: {
    opacity: 1,
  },
  rowFar: {
    opacity: 1,
  },
  stickyAtm: {
    background: 'rgba(44, 34, 8, 0.98)',
  },
  stickyNear: {
    background: 'rgba(8, 32, 44, 0.98)',
  },
  stickyMid: {
    background: 'rgba(8, 20, 30, 0.98)',
  },
  stickyFar: {
    background: 'rgba(4, 12, 20, 0.98)',
  },
  ceRow: {
    background: 'rgba(20, 83, 45, 0.16)',
  },
  peRow: {
    background: 'rgba(127, 29, 29, 0.16)',
  },
  ceTypeCell: {
    padding: '9px 10px',
    color: '#86efac',
    fontSize: '12px',
    fontWeight: 700,
    borderTop: '1px solid rgba(49, 91, 124, 0.22)',
    whiteSpace: 'nowrap',
  },
  peTypeCell: {
    padding: '9px 10px',
    color: '#fca5a5',
    fontSize: '12px',
    fontWeight: 700,
    borderTop: '1px solid rgba(49, 91, 124, 0.22)',
    whiteSpace: 'nowrap',
  },
  typeCell: {
    minWidth: '72px',
  },
  liveCell: {
    minWidth: '116px',
  },
  ivCell: {
    minWidth: '84px',
  },
  toneUp: {
    color: '#86efac',
  },
  toneDown: {
    color: '#fca5a5',
  },
  toneFlat: {
    color: '#dbeafe',
  },
  formulaNameWrap: {
    position: 'relative',
    display: 'inline-block',
  },
  formulaHeadLabel: {
    color: '#93c5fd',
    fontSize: '10px',
    cursor: 'help',
    lineHeight: 1.25,
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