import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { restoreUserSession } from '../lib/auth-client';
import { useTheme } from '../lib/ThemePicker';
import { applyTheme } from '../lib/themes';

const RechartsComponents = dynamic(
  () => import('recharts').then((mod) => ({
    default: ({ children, ...props }) => children(mod),
  })),
  { ssr: false, loading: () => <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>Loading chart…</div> },
);

// Returns true during NSE market hours: 9:00 AM – 3:30 PM IST, Mon–Fri
function isMarketOpen() {
  const istMs = Date.now() + 5.5 * 60 * 60 * 1000; // UTC → IST
  const ist = new Date(istMs);
  const day = ist.getUTCDay(); // 0=Sun 6=Sat in IST context
  if (day === 0 || day === 6) return false;
  const total = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return total >= 540 && total <= 930; // 9:00 (540 min) to 15:30 (930 min)
}

const STRIKE_STEP = 50;
const WING_DISTANCE = 500;
const STRIKE_SELECTOR_DISTANCE = 2000;
const PAYOFF_VIEW_DISTANCE = 2000;
const FORMULA_BLEND_WEIGHTS = {
  blackScholes: 0.35,
  binomialCrr: 0.35,
  bachelier: 0.15,
  monteCarlo: 0.15,
};
const PRICING_SOURCE_OPTIONS = [
  { value: 'blend', label: 'Formula Blend (recommended)' },
  { value: 'blackScholes', label: 'Black-Scholes' },
  { value: 'binomialCrr', label: 'Binomial CRR' },
  { value: 'bachelier', label: 'Bachelier' },
  { value: 'monteCarlo', label: 'Monte Carlo GBM' },
  { value: 'intrinsic', label: 'Intrinsic only' },
  { value: 'live', label: 'Live / option chain' },
];
const SAVE_TARGET_OPTIONS = [
  { value: 'watching', label: 'Wishlist' },
  { value: 'active', label: 'Bought' },
];

async function parseApiJsonResponse(response, fallbackErrorMessage) {
  const rawText = await response.text();
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch (_) {
    data = null;
  }

  if (!response.ok) {
    const htmlResponse = typeof rawText === 'string' && rawText.trim().startsWith('<');
    const detailed = data?.error
      || (htmlResponse ? `Server returned HTML (${response.status} ${response.statusText}). Check /api/options-best-strategies route.` : '');
    throw new Error(detailed || fallbackErrorMessage || `Request failed (${response.status})`);
  }

  if (!data) {
    throw new Error('Server returned invalid JSON response. Please retry.');
  }

  return data;
}

function normalizePremium(value) {
  return Number((Number(value) || 0).toFixed(2));
}

// Format expiry unix timestamp as IST date string regardless of browser timezone.
// IST = UTC+5:30. Using UTC methods on an IST-shifted Date avoids day-shift bugs.
function formatExpiryDisplay(unixSeconds) {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ms = Number(unixSeconds) * 1000 + IST_OFFSET_MS;
  const d = new Date(ms);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function toLocalDateTimeInputValue(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const offsetMs = parsed.getTimezoneOffset() * 60000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromLocalDateTimeInputValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function resolveStrategyStrike(spot, strikesList = [], offset = 0) {
  const target = Math.max(0, (Number(spot) || 0) + offset);
  if (strikesList.length) {
    return strikesList.reduce((closest, strike) => {
      if (closest == null) return strike;
      return Math.abs(strike - target) < Math.abs(closest - target) ? strike : closest;
    }, null);
  }
  return Math.max(0, Math.round(target / STRIKE_STEP) * STRIKE_STEP);
}

function createLeg(id, side, optionType, strike, chainMap, expiry = null) {
  const marketPremium = normalizePremium(resolveChainPremium(chainMap, { optionType, strike, expiry }));
  return {
    id,
    side,
    optionType,
    strike,
    quantity: 1,
    premium: marketPremium,
    marketPremium,
    locked: false,
    expiry: expiry || null,
  };
}

function resolveChainPremium(chainMap = { CE: {}, PE: {} }, leg = {}) {
  const optionType = leg.optionType;
  const strike = Number(leg.strike);
  const expiry = Number(leg.expiry);
  if (!optionType || !Number.isFinite(strike)) return null;
  if (Number.isFinite(expiry) && expiry > 0) {
    const direct = chainMap?.byExpiry?.[expiry]?.[optionType]?.[strike];
    if (direct != null) return direct;
  }
  const fallback = chainMap?.[optionType]?.[strike];
  return fallback == null ? null : fallback;
}

function buildDefaultLegs(spot, strikesList, chainMap, getNextLegId, expiry = null) {
  const shortStrike = resolveStrategyStrike(spot, strikesList, 0);
  const upperHedgeStrike = resolveStrategyStrike(spot, strikesList, WING_DISTANCE);
  const lowerHedgeStrike = resolveStrategyStrike(spot, strikesList, -WING_DISTANCE);

  return [
    createLeg(getNextLegId(), 'SELL', 'CE', shortStrike, chainMap, expiry),
    createLeg(getNextLegId(), 'SELL', 'PE', shortStrike, chainMap, expiry),
    createLeg(getNextLegId(), 'BUY', 'CE', upperHedgeStrike, chainMap, expiry),
    createLeg(getNextLegId(), 'BUY', 'PE', lowerHedgeStrike, chainMap, expiry),
  ];
}

function syncLegsWithMarket(currentLegs, chainMap) {
  return currentLegs.map((leg) => {
    const latest = resolveChainPremium(chainMap, leg);
    if (latest == null) {
      return {
        ...leg,
        quantity: Math.max(1, parseInt(leg.quantity || 1, 10) || 1),
      };
    }
    const marketPremium = normalizePremium(latest);
    return {
      ...leg,
      quantity: Math.max(1, parseInt(leg.quantity || 1, 10) || 1),
      marketPremium,
      premium: leg.locked ? leg.premium : marketPremium,
    };
  });
}

function optionIntrinsic(optionType, strike, spot) {
  if (optionType === 'CE') {
    return Math.max(spot - strike, 0);
  }
  return Math.max(strike - spot, 0);
}

function legPayoffAtExpiry(leg, spot) {
  const intrinsic = optionIntrinsic(leg.optionType, leg.strike, spot);
  const quantity = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
  const premiumEffect = leg.side === 'SELL' ? leg.premium : -leg.premium;
  const intrinsicEffect = leg.side === 'SELL' ? -intrinsic : intrinsic;
  return (premiumEffect + intrinsicEffect) * quantity;
}

function formatCurrency(value) {
  const numeric = Number(value) || 0;
  const sign = numeric < 0 ? '-' : '';
  return `${sign}Rs. ${Math.abs(numeric).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getPricingSourceLabel(value) {
  return PRICING_SOURCE_OPTIONS.find((option) => option.value === value)?.label || 'Formula Blend';
}

function getPreferredFormulaPrice(contract, pricingSource = 'blend') {
  const formulaMap = Object.fromEntries((contract?.formulaResults || []).map((entry) => [entry.key, Number(entry.price)]));

  if (pricingSource === 'live') {
    return normalizePremium(contract?.livePremium ?? formulaMap.blackScholes ?? formulaMap.intrinsic ?? 0);
  }

  if (pricingSource !== 'blend') {
    return normalizePremium(formulaMap[pricingSource] ?? contract?.livePremium ?? formulaMap.blackScholes ?? formulaMap.intrinsic ?? 0);
  }

  const weightedEntries = Object.entries(FORMULA_BLEND_WEIGHTS)
    .map(([key, weight]) => ({ value: Number(formulaMap[key]), weight }))
    .filter((entry) => Number.isFinite(entry.value));

  if (weightedEntries.length) {
    const weightedTotal = weightedEntries.reduce((sum, entry) => sum + (entry.value * entry.weight), 0);
    const totalWeight = weightedEntries.reduce((sum, entry) => sum + entry.weight, 0) || 1;
    return normalizePremium(weightedTotal / totalWeight);
  }

  return normalizePremium(contract?.livePremium ?? formulaMap.blackScholes ?? formulaMap.intrinsic ?? 0);
}

function buildQuoteMapsFromRows(
  rows = [],
  getPrice = (row) => row.price || row.lastPrice || row.bid || row.ask || 0,
  getIv = (row) => row.iv ?? row.appliedVolatility ?? null,
  defaultExpiry = null,
) {
  const map = { CE: {}, PE: {}, byExpiry: {} };
  const ivSnapshot = { CE: {}, PE: {}, byExpiry: {} };

  rows.forEach((row) => {
    if (!map[row.type]) return;
    const strike = Number(row.strike);
    const premium = normalizePremium(getPrice(row));
    const iv = getIv(row);
    const expiry = Number(row.expiryUnix || row.expiry || defaultExpiry || 0);

    map[row.type][strike] = premium;
    ivSnapshot[row.type][strike] = iv;

    if (Number.isFinite(expiry) && expiry > 0) {
      if (!map.byExpiry[expiry]) map.byExpiry[expiry] = { CE: {}, PE: {} };
      if (!ivSnapshot.byExpiry[expiry]) ivSnapshot.byExpiry[expiry] = { CE: {}, PE: {} };
      map.byExpiry[expiry][row.type][strike] = premium;
      ivSnapshot.byExpiry[expiry][row.type][strike] = iv;
    }
  });

  return { map, ivSnapshot };
}

function mergeQuoteMaps(baseMap = { CE: {}, PE: {}, byExpiry: {} }, overlayMap = { CE: {}, PE: {}, byExpiry: {} }) {
  const mergedByExpiry = { ...(baseMap.byExpiry || {}) };
  Object.entries(overlayMap.byExpiry || {}).forEach(([expiryKey, expiryMap]) => {
    mergedByExpiry[expiryKey] = {
      CE: { ...(baseMap.byExpiry?.[expiryKey]?.CE || {}), ...(expiryMap.CE || {}) },
      PE: { ...(baseMap.byExpiry?.[expiryKey]?.PE || {}), ...(expiryMap.PE || {}) },
    };
  });
  return {
    CE: { ...(baseMap.CE || {}), ...(overlayMap.CE || {}) },
    PE: { ...(baseMap.PE || {}), ...(overlayMap.PE || {}) },
    byExpiry: mergedByExpiry,
  };
}

function PayoffChart({ points, minY, maxY, currentSpot, breakEvens = [], styles, theme = {} }) {
  if (!points.length) {
    return null;
  }
  const containerRef = useRef(null);
  const [hover, setHover] = useState(null);

  const spotMin = points[0].spot;
  const spotMax = points[points.length - 1].spot;
  const rangeX = spotMax - spotMin || 1;
  const lowY = Math.min(minY, 0);
  const highY = Math.max(maxY, 0);
  const rangeY = highY - lowY || 1;

  // Chart area within SVG (leaving room for axes)
  const W = 100, H = 100;
  const pad = { left: 14, right: 2, top: 4, bottom: 10 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;

  const xForSpot = (spot) => pad.left + ((spot - spotMin) / rangeX) * cw;
  const yForValue = (value) => pad.top + ch - ((value - lowY) / rangeY) * ch;
  const zeroY = yForValue(0);

  // Build polyline
  const polyline = points.map((p) => `${xForSpot(p.spot).toFixed(2)},${yForValue(p.value).toFixed(2)}`).join(' ');

  // Build profit area (above zero, clamp at zero)
  const profitPath = points.map((p, i) => {
    const x = xForSpot(p.spot).toFixed(2);
    const y = yForValue(Math.max(p.value, 0)).toFixed(2);
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ') + ` L${xForSpot(spotMax).toFixed(2)},${zeroY.toFixed(2)} L${xForSpot(spotMin).toFixed(2)},${zeroY.toFixed(2)} Z`;

  // Build loss area (below zero, clamp at zero)
  const lossPath = points.map((p, i) => {
    const x = xForSpot(p.spot).toFixed(2);
    const y = yForValue(Math.min(p.value, 0)).toFixed(2);
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ') + ` L${xForSpot(spotMax).toFixed(2)},${zeroY.toFixed(2)} L${xForSpot(spotMin).toFixed(2)},${zeroY.toFixed(2)} Z`;

  // X-axis ticks (5-7 values)
  const xTickCount = 6;
  const xTicks = [];
  for (let i = 0; i <= xTickCount; i++) {
    const spot = spotMin + (rangeX * i) / xTickCount;
    xTicks.push(Math.round(spot));
  }

  // Y-axis ticks (5 values)
  const yTickCount = 5;
  const yTicks = [];
  for (let i = 0; i <= yTickCount; i++) {
    const val = lowY + (rangeY * i) / yTickCount;
    yTicks.push(Math.round(val));
  }

  const maxPoint = points.reduce((best, p) => (p.value > best.value ? p : best), points[0]);
  const minPoint = points.reduce((best, p) => (p.value < best.value ? p : best), points[0]);

  function handleMouseMove(e) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xPct = (e.clientX - rect.left) / rect.width;
    const spotAtCursor = spotMin + xPct * rangeX;
    // Find nearest point
    let closest = points[0];
    let minDist = Infinity;
    for (const p of points) {
      const dist = Math.abs(p.spot - spotAtCursor);
      if (dist < minDist) { minDist = dist; closest = p; }
    }
    setHover({ spot: closest.spot, value: closest.value, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  return (
    <div>
      <div ref={containerRef} style={{ position: 'relative' }} onMouseMove={handleMouseMove} onMouseLeave={() => setHover(null)}>
        <svg
          className="strategy-payoff-chart"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '280px', borderRadius: '12px', background: theme.graphBg || 'linear-gradient(180deg, #031525, #020617)', display: 'block' }}
        >
          {/* grid lines */}
          {yTicks.map((v) => (
            <line key={`yg-${v}`} x1={pad.left} y1={yForValue(v)} x2={W - pad.right} y2={yForValue(v)} stroke="rgba(148,163,184,0.1)" strokeWidth="0.2" />
          ))}
          {xTicks.map((s) => (
            <line key={`xg-${s}`} x1={xForSpot(s)} y1={pad.top} x2={xForSpot(s)} y2={H - pad.bottom} stroke="rgba(148,163,184,0.08)" strokeWidth="0.2" />
          ))}

          {/* profit area (green) */}
          <path d={profitPath} fill="rgba(34,197,94,0.18)" />
          {/* loss area (red) */}
          <path d={lossPath} fill="rgba(248,113,113,0.18)" />

          {/* zero line */}
          <line x1={pad.left} y1={zeroY} x2={W - pad.right} y2={zeroY} stroke={theme.textSecondary || '#94a3b8'} strokeWidth="0.3" strokeDasharray="1 1" />

          {/* current spot vertical */}
          <line x1={xForSpot(currentSpot)} y1={pad.top} x2={xForSpot(currentSpot)} y2={H - pad.bottom} stroke={theme.cyan || '#38bdf8'} strokeDasharray="1 0.8" strokeWidth="0.4" />

          {/* breakeven verticals */}
          {breakEvens.map((v) => (
            <line key={`be-${v}`} x1={xForSpot(Number(v))} y1={pad.top} x2={xForSpot(Number(v))} y2={H - pad.bottom} stroke="#fbbf24" strokeDasharray="0.8 1" strokeWidth="0.3" />
          ))}

          {/* payoff curve */}
          <polyline fill="none" stroke={theme.green || '#22c55e'} strokeWidth="0.8" points={polyline} />

          {/* max/min markers */}
          <circle cx={xForSpot(maxPoint.spot)} cy={yForValue(maxPoint.value)} r="0.8" fill={theme.green || '#22c55e'} stroke="#fff" strokeWidth="0.3" />
          <circle cx={xForSpot(minPoint.spot)} cy={yForValue(minPoint.value)} r="0.8" fill={theme.red || '#f87171'} stroke="#fff" strokeWidth="0.3" />

          {/* Y axis labels */}
          {yTicks.map((v) => (
            <text key={`yl-${v}`} x={pad.left - 1} y={yForValue(v) + 0.8} fill={theme.textSecondary || '#94a3b8'} fontSize="2.5" textAnchor="end" dominantBaseline="middle">
              {Math.abs(v) >= 100000 ? `${(v / 1000).toFixed(0)}k` : v.toLocaleString()}
            </text>
          ))}

          {/* X axis labels */}
          {xTicks.map((s) => (
            <text key={`xl-${s}`} x={xForSpot(s)} y={H - pad.bottom + 4} fill={theme.textSecondary || '#94a3b8'} fontSize="2.3" textAnchor="middle">
              {s.toLocaleString()}
            </text>
          ))}

          {/* axis labels */}
          <text x={pad.left - 1} y={pad.top - 1.5} fill={theme.textMuted || '#64748b'} fontSize="2" textAnchor="end">P/L (₹)</text>
          <text x={W - pad.right} y={H - pad.bottom + 7} fill={theme.textMuted || '#64748b'} fontSize="2" textAnchor="end">Spot →</text>

          {/* hover crosshair */}
          {hover && (
            <>
              <line x1={xForSpot(hover.spot)} y1={pad.top} x2={xForSpot(hover.spot)} y2={H - pad.bottom} stroke="rgba(255,255,255,0.5)" strokeWidth="0.2" />
              <line x1={pad.left} y1={yForValue(hover.value)} x2={W - pad.right} y2={yForValue(hover.value)} stroke="rgba(255,255,255,0.3)" strokeWidth="0.2" strokeDasharray="0.5 0.5" />
              <circle cx={xForSpot(hover.spot)} cy={yForValue(hover.value)} r="0.7" fill={hover.value >= 0 ? (theme.green || '#22c55e') : (theme.red || '#f87171')} stroke="#fff" strokeWidth="0.3" />
            </>
          )}
        </svg>

        {/* hover tooltip */}
        {hover && (
          <div style={{
            position: 'absolute',
            left: Math.min(hover.x + 10, (containerRef.current?.offsetWidth || 400) - 160),
            top: Math.max(hover.y - 50, 4),
            background: theme.panelBg || 'rgba(2,6,23,0.92)',
            border: `1px solid ${theme.cardBorder || 'rgba(148,163,184,0.3)'}`,
            borderRadius: 8,
            padding: '6px 10px',
            pointerEvents: 'none',
            zIndex: 10,
            minWidth: 120,
          }}>
            <div style={{ fontSize: 11, color: theme.textSecondary || '#94a3b8' }}>Spot: <strong style={{ color: theme.textPrimary || '#e2e8f0' }}>{hover.spot.toLocaleString()}</strong></div>
            <div style={{ fontSize: 13, fontWeight: 700, color: hover.value >= 0 ? (theme.green || '#22c55e') : (theme.red || '#f87171'), marginTop: 2 }}>
              {hover.value >= 0 ? '+' : ''}{hover.value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        )}
      </div>

      <div style={styles.chartLegend}>
        <span>🟢 Profit zone</span>
        <span>🔴 Loss zone</span>
        <span>🟦 Current spot ({Number(currentSpot || 0).toLocaleString()})</span>
        <span>🟨 Breakeven</span>
      </div>
    </div>
  );
}

function RangeMapChart({ points, profitZones = [], lossZones = [], currentSpot, breakEvens = [], styles }) {
  if (!points.length) {
    return null;
  }

  const rangeStart = points[0].spot;
  const rangeEnd = points[points.length - 1].spot;
  const totalRange = rangeEnd - rangeStart || 1;
  const leftPct = (value) => Math.max(0, Math.min(100, ((Number(value) - rangeStart) / totalRange) * 100));

  return (
    <div style={styles.rangeChartWrap}>
      <div style={styles.rangeTrack} />
      {lossZones.map((zone, index) => (
        <div
          key={`loss-${zone.from}-${zone.to}-${index}`}
          style={{
            ...styles.rangeSegment,
            left: `${leftPct(zone.from)}%`,
            width: `${Math.max(2, leftPct(zone.to) - leftPct(zone.from))}%`,
            background: '#b91c1c',
          }}
        />
      ))}
      {profitZones.map((zone, index) => (
        <div
          key={`profit-${zone.from}-${zone.to}-${index}`}
          style={{
            ...styles.rangeSegment,
            left: `${leftPct(zone.from)}%`,
            width: `${Math.max(2, leftPct(zone.to) - leftPct(zone.from))}%`,
            background: '#15803d',
          }}
        />
      ))}
      <div style={{ ...styles.currentMarker, left: `${leftPct(currentSpot)}%` }} />
      {breakEvens.map((value) => (
        <div key={`be-${value}`} style={{ ...styles.breakEvenMarker, left: `${leftPct(value)}%` }} />
      ))}
      <div style={styles.chartLegend}>
        <span>🟩 Profit range</span>
        <span>🟥 Loss range</span>
        <span>🟦 Current spot</span>
      </div>
      <div style={styles.chartMetaRow}>
        <span>{rangeStart}</span>
        <span>Break-evens {breakEvens.length ? breakEvens.join(', ') : '—'}</span>
        <span>{rangeEnd}</span>
      </div>
    </div>
  );
}

function MetricBarChart({ items = [], styles }) {
  const scale = Math.max(...items.map((item) => Math.abs(Number(item.value) || 0)), 1);

  return (
    <div style={styles.barChartWrap}>
      {items.map((item) => {
        const numeric = Number(item.value) || 0;
        const width = `${Math.max(5, (Math.abs(numeric) / scale) * 100)}%`;
        return (
          <div key={item.label} style={styles.barRow}>
            <div style={styles.barLabel}>{item.label}</div>
            <div style={styles.barTrack}>
              <div style={{ ...styles.barFill, width, background: item.color }} />
            </div>
            <div style={{ ...styles.barValue, color: item.color }}>
              {numeric >= 0 ? '+' : '-'}{Math.abs(numeric).toFixed(0)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function OptionsStrategy() {
  const router = useRouter();
  const { theme, themeId } = useTheme();
  const styles = useMemo(() => applyTheme(darkStyles, themeId, theme), [themeId, theme]);
  const nextLegIdRef = useRef(1);
  const getNextLegId = () => {
    const nextId = nextLegIdRef.current;
    nextLegIdRef.current += 1;
    return nextId;
  };
  const initializedDefaultsRef = useRef(false);
  const [user, setUser] = useState(null);
  const [spotPrice, setSpotPrice] = useState(23000);
  const spotPriceRef = useRef(23000);
  useEffect(() => { spotPriceRef.current = spotPrice; }, [spotPrice]);
  const [lotSize, setLotSize] = useState(65);
  const [expiryOptions, setExpiryOptions] = useState([]);
  const [selectedExpiry, setSelectedExpiry] = useState(null);
  const [strikesList, setStrikesList] = useState([]);
  const [legs, setLegs] = useState([]);
  const legsRef = useRef([]);
  useEffect(() => { legsRef.current = legs; }, [legs]);
  const [liveSource, setLiveSource] = useState('loading');
  const [chainMap, setChainMap] = useState({ CE: {}, PE: {}, byExpiry: {} });
  const chainMapRef = useRef({ CE: {}, PE: {}, byExpiry: {} });
  useEffect(() => { chainMapRef.current = chainMap; }, [chainMap]);
  const [ivMap, setIvMap] = useState({ CE: {}, PE: {}, byExpiry: {} });
  const ivMapRef = useRef({ CE: {}, PE: {}, byExpiry: {} });
  useEffect(() => { ivMapRef.current = ivMap; }, [ivMap]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [secsAgo, setSecsAgo] = useState(0);
  const [pricingModel, setPricingModel] = useState(null);
  const [sourceWarning, setSourceWarning] = useState('');
  const [ivInput, setIvInput] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [pricingSource, setPricingSource] = useState('blend');
  const [strategyName, setStrategyName] = useState('My Saved Strategy');
  const [entryDateTime, setEntryDateTime] = useState(() => toLocalDateTimeInputValue(new Date().toISOString()));
  const [saveTarget, setSaveTarget] = useState('watching');
  const [savedStrategies, setSavedStrategies] = useState([]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [editingStrategyId, setEditingStrategyId] = useState(null);

  // Persist legs + key settings to sessionStorage so they survive page refresh
  useEffect(() => {
    if (!legs.length) return;
    try {
      sessionStorage.setItem('nifty-strategy-legs', JSON.stringify(legs));
      sessionStorage.setItem('nifty-strategy-meta', JSON.stringify({
        spotPrice, lotSize, pricingSource, ivInput, rateInput, selectedExpiry, strategyName, entryDateTime, editingStrategyId, saveTarget,
      }));
    } catch (_) { /* ignore */ }
  }, [legs, spotPrice, lotSize, pricingSource, ivInput, rateInput, selectedExpiry, strategyName, entryDateTime, editingStrategyId, saveTarget]);

  // Restore legs from sessionStorage on mount (before first market data fetch)
  useEffect(() => {
    try {
      const savedLegs = sessionStorage.getItem('nifty-strategy-legs');
      const savedMeta = sessionStorage.getItem('nifty-strategy-meta');
      if (savedLegs) {
        const parsed = JSON.parse(savedLegs);
        if (Array.isArray(parsed) && parsed.length) {
          nextLegIdRef.current = Math.max(1, ...parsed.map((l) => Number(l.id) || 0)) + 1;
          setLegs(parsed);
          initializedDefaultsRef.current = true;
        }
      }
      if (savedMeta) {
        const meta = JSON.parse(savedMeta);
        if (meta.lotSize) setLotSize(meta.lotSize);
        if (meta.pricingSource) setPricingSource(meta.pricingSource);
        if (meta.ivInput) setIvInput(meta.ivInput);
        if (meta.rateInput) setRateInput(meta.rateInput);
        if (meta.strategyName) setStrategyName(meta.strategyName);
        if (meta.entryDateTime) setEntryDateTime(meta.entryDateTime);
        if (SAVE_TARGET_OPTIONS.some((option) => option.value === meta.saveTarget)) setSaveTarget(meta.saveTarget);
        // Only restore editingStrategyId when a strategyId param is present in the URL
        // (i.e. editing an existing strategy). For fresh creates we skip this.
        if (meta.editingStrategyId && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('strategyId')) {
          setEditingStrategyId(meta.editingStrategyId);
        }
      }
    } catch (_) { /* ignore */ }
  }, []);

  const loadedStrategyRef = useRef(null);
  const selectedExpiryRef = useRef(selectedExpiry);
  useEffect(() => { selectedExpiryRef.current = selectedExpiry; }, [selectedExpiry]);
  const pricingInputsRef = useRef({ ivInput: '', rateInput: '' });
  useEffect(() => { pricingInputsRef.current = { ivInput, rateInput }; }, [ivInput, rateInput]);
  const pricingHydratedRef = useRef(false);
  const [optimizerResult, setOptimizerResult] = useState(null);
  const [optimizerLoading, setOptimizerLoading] = useState(false);
  const [optimizerError, setOptimizerError] = useState('');
  const [calendarResult, setCalendarResult] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState('');
  const [calSellExpiry, setCalSellExpiry] = useState('');
  const [calBuyExpiry, setCalBuyExpiry] = useState('');

  const runOptimizer = async () => {
    setOptimizerLoading(true);
    setOptimizerError('');
    setOptimizerResult(null);
    try {
      const response = await fetch('/api/options-best-strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spot: spotPrice,
          lotSize,
          pricingSource,
          rate: Number(rateInput) || 6,
          iv: Number(ivInput) || 14,
          expiry: selectedExpiry || 0,
          strikeRange: 2000,
        }),
      });
      const data = await parseApiJsonResponse(response, 'Optimizer failed');
      setOptimizerResult(data);
    } catch (err) {
      setOptimizerError(err.message);
    } finally {
      setOptimizerLoading(false);
    }
  };

  const loadOptimizedStrategy = (strategy) => {
    const hydratedLegs = strategy.legs.map((leg) => ({
      id: getNextLegId(),
      side: leg.side,
      optionType: leg.type,
      strike: Number(leg.strike),
      quantity: leg.quantity,
      premium: normalizePremium(leg.premium),
      marketPremium: normalizePremium(leg.premium),
      locked: false,
    }));
    setLegs(hydratedLegs);
    setStrategyName(`${strategy.family || 'Optimized'} · ${strategy.legs.length} legs`);
    setEditingStrategyId(null);
    setSaveMessage('');
  };

  const runCalendarOptimizer = async () => {
    if (!calSellExpiry || !calBuyExpiry) {
      setCalendarError('Please select both Sell Expiry and Buy Expiry before running.');
      return;
    }
    setCalendarLoading(true);
    setCalendarError('');
    setCalendarResult(null);
    try {
      const response = await fetch('/api/options-best-strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spot: spotPrice,
          lotSize,
          pricingSource,
          rate: Number(rateInput) || 6,
          iv: Number(ivInput) || 14,
          calendar: true,
          sellExpiry: Number(calSellExpiry),
          buyExpiry: Number(calBuyExpiry),
        }),
      });
      const data = await parseApiJsonResponse(response, 'Calendar optimizer failed');
      setCalendarResult(data);
    } catch (err) {
      setCalendarError(err.message);
    } finally {
      setCalendarLoading(false);
    }
  };

  const buildChainUrl = (expiryValue) => {
    const params = new URLSearchParams({ symbol: 'NIFTY' });
    if (expiryValue) params.set('expiry', String(expiryValue));
    if (pricingInputsRef.current.ivInput) params.set('iv', pricingInputsRef.current.ivInput);
    if (pricingInputsRef.current.rateInput) params.set('rate', pricingInputsRef.current.rateInput);
    return `/api/options-chain?${params.toString()}`;
  };

  const buildExpectedPricingUrl = (expiryValue, spotOverride = spotPrice) => {
    const legExpiries = Array.from(new Set((legsRef.current || [])
      .map((leg) => Number(leg.expiry))
      .filter((expiry) => Number.isFinite(expiry) && expiry > 0)));
    const requestedExpiries = Array.from(new Set([
      ...legExpiries,
      Number(expiryValue) || 0,
    ].filter((expiry) => Number.isFinite(expiry) && expiry > 0)));
    const params = new URLSearchParams({
      symbol: 'NIFTY',
      strikeGap: String(STRIKE_STEP),
      strikeLevels: String(Math.ceil(STRIKE_SELECTOR_DISTANCE / STRIKE_STEP)),
      expiryCount: String(Math.max(1, requestedExpiries.length || 1)),
    });
    if (requestedExpiries.length) params.set('expiries', requestedExpiries.join(','));
    if (Number.isFinite(Number(spotOverride))) params.set('spot', String(Number(spotOverride).toFixed(2)));
    if (pricingInputsRef.current.rateInput) params.set('rate', pricingInputsRef.current.rateInput);
    if (pricingInputsRef.current.ivInput) params.set('iv', pricingInputsRef.current.ivInput);
    return `/api/options-expected-price?${params.toString()}`;
  };

  const syncQuoteState = async (quotePayload, expiryValue, fallbackSpot = spotPrice) => {
    const nextSpot = quotePayload?.spot ? Number(quotePayload.spot.toFixed(2)) : Number(fallbackSpot || 0);
    const baseMaps = buildQuoteMapsFromRows(quotePayload?.strikes || [], undefined, undefined, expiryValue);
    let nextMap = baseMaps.map;
    let nextIvMap = baseMaps.ivSnapshot;

    if (expiryValue) {
      try {
        const formulaResponse = await fetch(buildExpectedPricingUrl(expiryValue, nextSpot));
        const formulaData = await formulaResponse.json();
        if (formulaResponse.ok) {
          const formulaMaps = buildQuoteMapsFromRows(
            formulaData.contracts || [],
            (contract) => getPreferredFormulaPrice(contract, pricingSource),
            (contract) => contract.appliedVolatility ?? contract.liveIv ?? null,
          );
          nextMap = pricingSource === 'live'
            ? mergeQuoteMaps(formulaMaps.map, nextMap)
            : mergeQuoteMaps(nextMap, formulaMaps.map);
          nextIvMap = mergeQuoteMaps(nextIvMap, formulaMaps.ivSnapshot);
        }
      } catch (_) { /* ignore */ }
    }

    const allStrikes = [
      ...(quotePayload?.strikes || []).map((item) => Number(item.strike)),
      ...Object.keys(nextMap.CE || {}).map((value) => Number(value)),
      ...Object.keys(nextMap.PE || {}).map((value) => Number(value)),
    ].filter(Number.isFinite);
    const unique = Array.from(new Set(allStrikes)).sort((a, b) => a - b);

    if (unique.length) setStrikesList(unique);
    if (Number.isFinite(nextSpot) && nextSpot > 0) {
      setSpotPrice(nextSpot);
    }
    setChainMap(nextMap);
    setIvMap(nextIvMap);
    if (unique.length) {
      applyMarketData(nextMap, nextSpot, unique);
    }
    if (quotePayload?.source) setLiveSource(quotePayload.source);
    setPricingModel(quotePayload?.pricingModel || null);
    const priceModeText = pricingSource === 'live'
      ? 'Premium source: live / option-chain values.'
      : `Premium source: ${getPricingSourceLabel(pricingSource)} from Expected Option Prices formulas.`;
    setSourceWarning([quotePayload?.warning, priceModeText].filter(Boolean).join(' '));
    setLastUpdated(new Date());
    setSecsAgo(0);
  };

  // Tick seconds-ago counter every second
  useEffect(() => {
    const t = setInterval(() => {
      setSecsAgo(lastUpdated ? Math.round((Date.now() - lastUpdated.getTime()) / 1000) : 0);
    }, 1000);
    return () => clearInterval(t);
  }, [lastUpdated]);

  useEffect(() => {
    restoreUserSession(router, setUser);
  }, [router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const response = await fetch('/api/options-strategies');
        const data = await response.json();
        if (response.ok) {
          setSavedStrategies(data.strategies || []);
        }
      } catch (_) { /* ignore */ }
    })();
  }, [user]);

  useEffect(() => {
    if (!user || !router.isReady) return;
    const strategyId = router.query?.strategyId;
    if (!strategyId || loadedStrategyRef.current === String(strategyId)) return;

    (async () => {
      try {
        const response = await fetch(`/api/options-strategies?id=${encodeURIComponent(String(strategyId))}`);
        const data = await response.json();
        if (!response.ok || !data.strategy) {
          throw new Error(data.error || 'Unable to load saved strategy.');
        }

        const strategy = data.strategy;
        loadedStrategyRef.current = String(strategy.id);
        initializedDefaultsRef.current = true;
        setEditingStrategyId(strategy.id);
        setStrategyName(strategy.name || 'My Saved Strategy');
        setEntryDateTime(toLocalDateTimeInputValue(strategy.entryAt || strategy.createdAt || new Date().toISOString()));
        setLotSize(Number(strategy.lotSize) || 65);
        setPricingSource(strategy.pricingSource || 'blend');
        if (strategy.ivInput != null) setIvInput(String(strategy.ivInput));
        if (strategy.rateInput != null) setRateInput(String(strategy.rateInput));
        if (strategy.savedAtSpot) setSpotPrice(Number(strategy.savedAtSpot));
        if (strategy.selectedExpiry) setSelectedExpiry(Number(strategy.selectedExpiry));
        setSaveTarget(strategy.status === 'active' ? 'active' : 'watching');

        const hydratedLegs = (strategy.legs || []).map((leg) => ({
          ...leg,
          strike: Number(leg.strike),
          quantity: Math.max(1, parseInt(leg.quantity || 1, 10) || 1),
          premium: normalizePremium(leg.premium),
          marketPremium: normalizePremium(leg.marketPremium ?? leg.premium),
          locked: Boolean(leg.locked),
        }));
        nextLegIdRef.current = Math.max(1, ...hydratedLegs.map((leg) => Number(leg.id) || 0)) + 1;
        setLegs(hydratedLegs);
        setSaveMessage(`Editing "${strategy.name}". Update the legs and save to overwrite it on the dashboard.`);
      } catch (error) {
        setSaveMessage(error.message || 'Unable to load saved strategy.');
      }
    })();
  }, [router.isReady, router.query, user]);

  useEffect(() => {
    const loadNifty = async () => {
      try {
        const response = await fetch('/api/market-indices');
        const data = await response.json();
        const nifty = (data.indices || []).find((index) => index.key === 'NIFTY50');
        if (nifty) {
          setSpotPrice(Number(nifty.price.toFixed(2)));
          setLiveSource(nifty.sourceLabel || nifty.source || 'market-indices');
          setSourceWarning(nifty.warning || '');
        }
        // also load options expiries & chain
        try {
          // Step 1: get expiry list
          const r = await fetch(buildChainUrl());
          const chainData = await r.json();
          let firstExpiry = null;
          if (chainData.expirations && chainData.expirations.length) {
            setExpiryOptions(chainData.expirations);
            firstExpiry = chainData.expirations[0];
            setSelectedExpiry(firstExpiry);
          } else {
            // fallback: next 4 Tuesdays from tomorrow (never add today — NSE handles holiday-moved dates)
            const nextTuesdays = [];
            const cursor = new Date();
            cursor.setHours(0, 0, 0, 0); // midnight local — +1 day before first check ensures today is never picked
            while (nextTuesdays.length < 4) {
              cursor.setDate(cursor.getDate() + 1);
              if (cursor.getDay() === 2) nextTuesdays.push(Math.floor(cursor.getTime() / 1000));
            }
            setExpiryOptions(nextTuesdays);
            firstExpiry = nextTuesdays[0];
            setSelectedExpiry(firstExpiry);
          }
          // Step 2: fetch strikes specifically for the first expiry date
          const er = await fetch(buildChainUrl(firstExpiry));
          const expiryData = await er.json();
          const src = expiryData.strikes?.length ? expiryData : chainData;
          if (src.strikes && src.strikes.length) {
            await syncQuoteState({
              ...src,
              source: expiryData.source || src.source,
              pricingModel: expiryData.pricingModel || src.pricingModel,
              warning: expiryData.warning || src.warning,
              spot: expiryData.spot ?? src.spot,
            }, firstExpiry, src.spot ? Number(src.spot.toFixed(2)) : spotPriceRef.current);
          }
          if (!pricingHydratedRef.current && expiryData.pricingModel) {
            setIvInput(String(expiryData.pricingModel.baseIv));
            setRateInput(String(expiryData.pricingModel.riskFreeRate));
            pricingHydratedRef.current = true;
          }
        } catch (e) {
          // ignore
        }
      } catch (error) {
        console.error('nifty fetch error', error);
        setLiveSource('manual-fallback');
      }
    };

    loadNifty();
  }, []);

  const applyMarketData = (nextChainMap) => {
    setLegs((current) => {
      if (!current.length) return current;
      return syncLegsWithMarket(current, nextChainMap);
    });
  };

  const updateLeg = (id, field, value) => {
    setLegs((current) => current.map((leg) => {
      if (leg.id !== id) return leg;
      const next = { ...leg, [field]: value };
      // When strike/type/expiry changes, auto-fill premium from cached quotes.
      if (field === 'strike' || field === 'optionType' || field === 'expiry') {
        const type = field === 'optionType' ? value : leg.optionType;
        const strike = field === 'strike' ? Number(value) : Number(leg.strike);
        const expiry = field === 'expiry' ? Number(value) || null : Number(leg.expiry) || null;
        const p = resolveChainPremium(chainMapRef.current, { optionType: type, strike, expiry });
        if (p != null) {
          const normalized = normalizePremium(p);
          next.marketPremium = normalized;
          if (!leg.locked) next.premium = normalized;
        }
      }
      if (field === 'premium') {
        next.premium = normalizePremium(value);
        // Only lock onBlur, not on every keystroke
      }
      if (field === 'quantity') {
        next.quantity = Math.max(1, parseInt(value || 1, 10) || 1);
      }
      return next;
    }));
  };

  const toggleLock = (id) => {
    setLegs((current) => current.map((leg) => {
      if (leg.id !== id) return leg;
      if (leg.locked) {
        // Unlocking: revert to current market premium
        return {
          ...leg,
          locked: false,
          premium: leg.marketPremium ?? leg.premium,
        };
      }
      // Locking: keep the user's current premium as-is
      return {
        ...leg,
        locked: true,
      };
    }));
  };

  const MAX_LEGS = 8;

  const fetchAndSetSpot = async () => {
    try {
      const response = await fetch('/api/market-indices');
      const data = await response.json();
      const nifty = (data.indices || []).find((index) => index.key === 'NIFTY50');
      if (nifty) {
        setSpotPrice(Number(nifty.price.toFixed(2)));
        setLiveSource(nifty.sourceLabel || nifty.source || 'market-indices');
        setSourceWarning(nifty.warning || '');
      }
    } catch (_) { /* ignore */ }
  };

  const addStrategySet = async () => {
    await fetchAndSetSpot();
    setLegs((current) => {
      const defaults = buildDefaultLegs(spotPriceRef.current, strikesList, chainMapRef.current, getNextLegId, selectedExpiryRef.current);
      const room = MAX_LEGS - current.length;
      if (room <= 0) return current;
      return [...current, ...defaults.slice(0, room)];
    });
  };

  const addCustomLeg = async () => {
    await fetchAndSetSpot();
    setLegs((current) => {
      if (current.length >= MAX_LEGS) return current;
      const strike = resolveStrategyStrike(spotPriceRef.current, strikesList, 0);
      return [...current, createLeg(getNextLegId(), 'SELL', 'CE', strike, chainMapRef.current, selectedExpiryRef.current)];
    });
  };

  const removeLeg = (id) => {
    setLegs((current) => (current.length > 1 ? current.filter((leg) => leg.id !== id) : current));
  };

  const resetStrategyDraft = () => {
    setLegs([]);
    setEditingStrategyId(null);
    setSaveTarget('watching');
    initializedDefaultsRef.current = true;
    try {
      sessionStorage.removeItem('nifty-strategy-legs');
      sessionStorage.removeItem('nifty-strategy-meta');
    } catch (_) { /* ignore */ }
    setSaveMessage('Draft reset. Add legs to build a new strategy.');
  };

  // when expiry changes, refresh strikes + premiums for all legs from API
  useEffect(() => {
    if (!selectedExpiry) return;
    (async () => {
      try {
        const res = await fetch(buildChainUrl(selectedExpiry));
        const data = await res.json();
        if (data.strikes && data.strikes.length) {
          await syncQuoteState(data, selectedExpiry, data.spot ? Number(data.spot.toFixed(2)) : spotPriceRef.current);
        } else {
          setStrikesList([]);
        }
      } catch (e) { /* ignore */ }
    })();
  }, [selectedExpiry]);

  // Live refresh every 15 seconds — only during market hours (9 AM–3:30 PM IST, Mon–Fri)
  useEffect(() => {
    const doRefresh = async () => {
      if (!isMarketOpen()) return; // skip outside market hours
      setLiveLoading(true);
      try {
        const exp = selectedExpiryRef.current;
        const res = await fetch(buildChainUrl(exp));
        const data = await res.json();
        if (data.strikes && data.strikes.length) {
          await syncQuoteState(data, exp, data.spot ? Number(data.spot.toFixed(2)) : spotPriceRef.current);
        }
      } catch (_) { /* ignore */ } finally {
        setLiveLoading(false);
      }
    };
    const interval = setInterval(doRefresh, 15000);
    return () => clearInterval(interval);
  }, []); // stable: uses refs, no deps needed

  const applyModelInputs = async () => {
    if (!selectedExpiryRef.current) return;
    setLiveLoading(true);
    try {
      const res = await fetch(buildChainUrl(selectedExpiryRef.current));
      const data = await res.json();
      if (data.strikes && data.strikes.length) {
        await syncQuoteState(data, selectedExpiryRef.current, data.spot ? Number(data.spot.toFixed(2)) : spotPriceRef.current);
      }
    } catch (_) { /* ignore */ } finally {
      setLiveLoading(false);
    }
  };

  const saveCurrentStrategy = async () => {
    if (!legs.length) {
      setSaveMessage('Add at least one leg before saving.');
      return;
    }

    const cleanName = strategyName.trim() || `Nifty Strategy ${savedStrategies.length + 1}`;
    const existingStrategy = editingStrategyId
      ? savedStrategies.find((strategy) => String(strategy.id) === String(editingStrategyId))
      : null;
    const nowIso = new Date().toISOString();
    const selectedEntryAt = fromLocalDateTimeInputValue(entryDateTime)
      || existingStrategy?.entryAt
      || existingStrategy?.createdAt
      || nowIso;
    setSaveLoading(true);
    setSaveMessage('');

    try {
      const payload = {
        id: editingStrategyId || `opt-${Date.now()}`,
        name: cleanName,
        status: saveTarget,
        entryAt: selectedEntryAt,
        createdAt: existingStrategy?.createdAt || selectedEntryAt || nowIso,
        updatedAt: nowIso,
        selectedExpiry,
        expiryLabel: selectedExpiry ? formatExpiryDisplay(selectedExpiry) : 'Not selected',
        lotSize,
        savedAtSpot: Number(spotPrice.toFixed(2)),
        liveSource,
        pricingSource,
        ivInput,
        rateInput,
        legs: legs.map((leg) => ({
          ...leg,
          strike: Number(leg.strike),
          quantity: Math.max(1, parseInt(leg.quantity || 1, 10) || 1),
          premium: normalizePremium(leg.premium),
          marketPremium: normalizePremium(leg.marketPremium ?? leg.premium),
          locked: true,
        })),
        snapshotMetrics: {
          maxProfit: metrics.maxProfit,
          maxLoss: metrics.maxLoss,
          currentPayoff: metrics.currentPayoff,
          entryNetPremium: metrics.entryNetPremium,
          liveCloseValue: metrics.liveCloseValue,
          premiumRemaining: metrics.premiumRemaining,
          capturedPremium: metrics.capturedPremium,
          capturePct: metrics.capturePct,
          markToMarket: metrics.markToMarket,
          breakEvens: metrics.breakEvens,
          profitRange: metrics.profitRange,
          lossRange: metrics.lossRange,
          points: metrics.points,
          minY: metrics.minY,
          maxY: metrics.maxY,
        },
      };

      const response = await fetch('/api/options-strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to save strategy right now.');
      }

      const savedId = data.strategy?.id || payload.id;
      setEditingStrategyId(savedId);
      setSavedStrategies(data.strategies || []);
      setSaveMessage(`${existingStrategy ? 'Updated' : 'Saved'} "${cleanName}" as ${saveTarget === 'active' ? 'Bought' : 'Wishlist'} with fixed entry prices and ${getPricingSourceLabel(pricingSource)} pricing.`);
      router.push(`/nifty-strategies?saved=${encodeURIComponent(String(savedId))}`);
    } catch (error) {
      setSaveMessage(error.message || 'Unable to save strategy right now.');
    } finally {
      setSaveLoading(false);
    }
  };

  const metrics = useMemo(() => {
    if (!legs.length) {
      return {
        points: [],
        maxProfit: 0,
        maxLoss: 0,
        currentPayoff: 0,
        entryNetPremium: 0,
        liveCloseValue: 0,
        premiumRemaining: 0,
        capturedPremium: 0,
        capturePct: 0,
        markToMarket: 0,
        breakEvens: [],
        profitZones: [],
        lossZones: [],
        profitRange: 'None',
        lossRange: 'None',
        maxProfitSpot: null,
        maxLossSpot: null,
        profitRangeWidth: 0,
        lossRangeWidth: 0,
        riskRewardRatio: null,
        minY: 0,
        maxY: 0,
        holdAdvice: 'Add strategy legs to see payoff metrics.',
      };
    }

    const sortedStrikes = [...new Set(legs.map((leg) => leg.strike))].sort((left, right) => left - right);
    const lower = sortedStrikes[0] || spotPrice - 1000;
    const upper = sortedStrikes[sortedStrikes.length - 1] || spotPrice + 1000;
    const start = Math.max(lower - PAYOFF_VIEW_DISTANCE, 0);
    const end = upper + PAYOFF_VIEW_DISTANCE;
    const step = Math.max(Math.round((end - start) / 30), 50);

    const points = [];
    for (let spot = start; spot <= end; spot += step) {
      const perUnitPayoff = legs.reduce((sum, leg) => sum + legPayoffAtExpiry(leg, spot), 0);
      points.push({ spot, value: Number((perUnitPayoff * lotSize).toFixed(2)) });
    }

    const pointValues = points.map((point) => point.value);
    const maxProfit = Math.max(...pointValues);
    const maxLoss = Math.min(...pointValues);
    const maxProfitPoint = points.reduce((best, point) => (point.value > best.value ? point : best), points[0]);
    const maxLossPoint = points.reduce((best, point) => (point.value < best.value ? point : best), points[0]);

    // Detect unlimited profit/loss: if payoff at edges is still growing/shrinking significantly
    const edgeThreshold = step * 0.5; // if the slope at the edge is meaningfully non-zero
    const leftEdgeSlope = points.length >= 2 ? (points[1].value - points[0].value) / step : 0;
    const rightEdgeSlope = points.length >= 2 ? (points[points.length - 1].value - points[points.length - 2].value) / step : 0;
    const isUnlimitedProfitUp = rightEdgeSlope > 0.1; // profit keeps rising as spot goes up
    const isUnlimitedProfitDown = leftEdgeSlope < -0.1; // profit keeps rising as spot goes down
    const isUnlimitedLossUp = rightEdgeSlope < -0.1; // loss keeps growing as spot goes up
    const isUnlimitedLossDown = leftEdgeSlope > 0.1; // loss keeps growing as spot goes down
    const isUnlimitedProfit = isUnlimitedProfitUp || isUnlimitedProfitDown;
    const isUnlimitedLoss = isUnlimitedLossUp || isUnlimitedLossDown;
    const atCurrentSpot = legs.reduce((sum, leg) => sum + legPayoffAtExpiry(leg, spotPrice), 0) * lotSize;
    const entryNetPremium = legs.reduce((sum, leg) => {
      const quantity = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
      return sum + ((leg.side === 'SELL' ? leg.premium : -leg.premium) * quantity);
    }, 0) * lotSize;
    const liveCloseValue = legs.reduce((sum, leg) => {
      const quantity = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
      const marketPremium = Number(leg.marketPremium ?? leg.premium) || 0;
      return sum + ((leg.side === 'BUY' ? marketPremium : -marketPremium) * quantity);
    }, 0) * lotSize;
    const premiumSoldAtEntry = legs.reduce((sum, leg) => {
      const quantity = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
      return sum + ((leg.side === 'SELL' ? leg.premium : 0) * quantity);
    }, 0) * lotSize;
    const premiumRemaining = legs.reduce((sum, leg) => {
      const quantity = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
      return sum + ((leg.side === 'SELL' ? Number(leg.marketPremium ?? leg.premium) || 0 : 0) * quantity);
    }, 0) * lotSize;
    const capturedPremium = premiumSoldAtEntry - premiumRemaining;
    const capturePct = premiumSoldAtEntry > 0 ? (capturedPremium / premiumSoldAtEntry) * 100 : 0;
    const markToMarket = legs.reduce((sum, leg) => {
      const quantity = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
      const marketPremium = Number(leg.marketPremium ?? leg.premium) || 0;
      return sum + ((leg.side === 'SELL' ? leg.premium - marketPremium : marketPremium - leg.premium) * quantity);
    }, 0) * lotSize;

    const breakEvenCandidates = [];
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      if ((previous.value <= 0 && current.value >= 0) || (previous.value >= 0 && current.value <= 0)) {
        // Linear interpolation for more accurate breakeven
        const ratio = Math.abs(previous.value) / (Math.abs(previous.value) + Math.abs(current.value));
        const interpolated = Math.round(previous.spot + ratio * (current.spot - previous.spot));
        breakEvenCandidates.push(interpolated);
      }
    }

    // Compute profit and loss zones
    const profitZones = [];
    const lossZones = [];
    let zoneStart = null;
    let zoneType = null; // 'profit' or 'loss'
    for (let index = 0; index < points.length; index += 1) {
      const p = points[index];
      const currentType = p.value >= 0 ? 'profit' : 'loss';
      if (zoneType === null) {
        zoneStart = p.spot;
        zoneType = currentType;
      } else if (currentType !== zoneType) {
        // Interpolate exact boundary
        const prev = points[index - 1];
        const ratio = Math.abs(prev.value) / (Math.abs(prev.value) + Math.abs(p.value));
        const boundary = Math.round(prev.spot + ratio * (p.spot - prev.spot));
        const zone = { from: zoneStart, to: boundary };
        if (zoneType === 'profit') profitZones.push(zone);
        else lossZones.push(zone);
        zoneStart = boundary;
        zoneType = currentType;
      }
    }
    // Close last zone
    if (zoneType && points.length) {
      const zone = { from: zoneStart, to: points[points.length - 1].spot };
      if (zoneType === 'profit') profitZones.push(zone);
      else lossZones.push(zone);
    }

    const profitRangeWidth = profitZones.reduce((sum, zone) => sum + Math.max(zone.to - zone.from, 0), 0);
    const lossRangeWidth = lossZones.reduce((sum, zone) => sum + Math.max(zone.to - zone.from, 0), 0);
    const riskRewardRatio = maxLoss !== 0 ? Math.abs(maxProfit / maxLoss) : null;

    let holdAdvice = 'Lock a leg once you like the entry premium to start tracking premium decay from that point.';
    if (legs.some((leg) => leg.locked)) {
      if (capturePct >= 70) {
        holdAdvice = 'Most of the sold premium is already captured. Staying offers limited additional reward versus tail risk.';
      } else if (premiumRemaining <= Math.abs(maxLoss) * 0.15) {
        holdAdvice = 'Very little short premium is left relative to the strategy risk. Exiting reduces exposure efficiently.';
      } else if (markToMarket < 0) {
        holdAdvice = 'Live premium has moved against the position. Hold only if you still want the same directional and volatility view.';
      } else {
        holdAdvice = 'There is still meaningful short premium left. Staying can make sense while spot remains near the short strike.';
      }
    }

    return {
      points,
      maxProfit,
      maxLoss,
      currentPayoff: Number(atCurrentSpot.toFixed(2)),
      entryNetPremium: Number(entryNetPremium.toFixed(2)),
      liveCloseValue: Number(liveCloseValue.toFixed(2)),
      premiumRemaining: Number(premiumRemaining.toFixed(2)),
      capturedPremium: Number(capturedPremium.toFixed(2)),
      capturePct: Number(capturePct.toFixed(1)),
      markToMarket: Number(markToMarket.toFixed(2)),
      breakEvens: breakEvenCandidates,
      profitZones,
      lossZones,
      profitRange: profitZones.length
        ? profitZones.map((z) => `${z.from}–${z.to}`).join(', ')
        : 'None',
      lossRange: lossZones.length
        ? lossZones.map((z) => `${z.from}–${z.to}`).join(', ')
        : 'None',
      maxProfitSpot: maxProfitPoint?.spot ?? null,
      maxLossSpot: maxLossPoint?.spot ?? null,
      profitRangeWidth: Number(profitRangeWidth.toFixed(0)),
      lossRangeWidth: Number(lossRangeWidth.toFixed(0)),
      riskRewardRatio,
      isUnlimitedProfit,
      isUnlimitedLoss,
      minY: Math.min(...pointValues),
      maxY: Math.max(...pointValues),
      holdAdvice,
    };
  }, [legs, lotSize, spotPrice]);

  const explanation = useMemo(() => {
    const bestProfitSpot = Number.isFinite(metrics.maxProfitSpot) ? metrics.maxProfitSpot : '—';
    const worstLossSpot = Number.isFinite(metrics.maxLossSpot) ? metrics.maxLossSpot : '—';
    const profitLabel = metrics.isUnlimitedProfit ? 'Unlimited (∞)' : formatCurrency(metrics.maxProfit);
    const lossLabel = metrics.isUnlimitedLoss ? 'Unlimited (∞)' : formatCurrency(Math.abs(metrics.maxLoss));
    return `Max profit is ${profitLabel} near spot ${bestProfitSpot}, max loss is ${lossLabel} near ${worstLossSpot}, and the live profitable expiry range is ${metrics.profitRange}. Saving this setup freezes today's entry prices so the dashboard can compare live market P/L against the locked structure.`;
  }, [metrics]);

  if (!user) {
    return <div style={styles.loading}>Loading...</div>;
  }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; width: 100%; overflow-x: hidden; }
        @media (max-width: 768px) {
          h1 { font-size: 18px !important; }
          h2 { font-size: 15px !important; }
          input, select { font-size: 12px !important; }
          .strategy-page { padding: 14px !important; }
          .strategy-header { flex-direction: column !important; align-items: stretch !important; }
          .strategy-top-grid { grid-template-columns: 1fr !important; }
          .strategy-controls-row { grid-template-columns: 1fr !important; gap: 6px !important; }
          .strategy-legs-shell { overflow-x: auto; padding-bottom: 4px; }
          .strategy-legs-header,
          .strategy-leg-row { min-width: 760px; }
          .strategy-payoff-chart { height: 240px !important; }
        }
        @media (max-width: 520px) {
          .strategy-page { padding: 10px !important; }
          .strategy-card { padding: 14px !important; }
          .strategy-hero-card { padding: 14px !important; }
          .strategy-payoff-chart { height: 220px !important; }
          .strategy-chart-meta { flex-direction: column !important; align-items: flex-start !important; }
        }
      `}</style>
      <div style={styles.container} className="strategy-page">
        <div style={styles.header} className="strategy-header">
          <div>
            <h1 style={styles.title}>Nifty Options Strategy</h1>
            <div style={styles.subTitle}>Live Nifty spot from {liveSource}</div>
          </div>
          <button onClick={() => router.push('/dashboard')} style={styles.back}>← Back</button>
        </div>

        <div style={styles.topGrid} className="strategy-top-grid">
          <div style={styles.heroCard} className="strategy-hero-card">
            <div style={styles.heroLabel}>Nifty Live Price</div>
            <div style={styles.heroPrice}>Rs. {spotPrice.toFixed(2)}</div>
            <div style={{ fontSize: 11, marginTop: 4, color: ['nse', 'angel-one'].includes(liveSource) ? theme.green : theme.yellow }}>
              {liveSource === 'nse' ? '● NSE LIVE' : liveSource === 'angel-one' ? '● Angel One LIVE' : liveSource === 'synthetic-fallback' ? '⚠ Synthetic (no live source)' : `Source: ${liveSource}`}
              {lastUpdated ? ` · ${secsAgo < 5 ? 'just now' : `${secsAgo}s ago`}` : ''}
              {liveLoading ? ' · updating…' : ''}
              {!isMarketOpen() ? ' · 🔴 Market closed' : ' · 🟢 Market open'}
            </div>
            <div style={styles.heroHint}>Premiums auto-update every 15 s. Edit manually to override.</div>
            {pricingModel ? (
              <div style={styles.modelPill}>
                IV base {pricingModel.baseIv}% · rate {pricingModel.riskFreeRate}% · tenor {pricingModel.timeToExpiryDays}d
              </div>
            ) : null}
            {sourceWarning ? <div style={styles.warningText}>{sourceWarning}</div> : null}
          </div>
          <div style={styles.heroCard} className="strategy-hero-card">
            <div style={styles.controlsRow} className="strategy-controls-row">
              <label style={styles.label}>Spot Price</label>
              <input type="number" value={spotPrice} onChange={(e) => setSpotPrice(parseFloat(e.target.value || 0))} style={styles.input} />
            </div>
            <div style={styles.controlsRow} className="strategy-controls-row">
              <label style={styles.label}>Lot Size</label>
              <input type="number" value={lotSize} onChange={(e) => setLotSize(parseInt(e.target.value || 0, 10) || 1)} style={styles.input} />
            </div>
            <div style={styles.controlsRow} className="strategy-controls-row">
              <label style={styles.label}>Base IV %</label>
              <input type="number" value={ivInput} onChange={(e) => setIvInput(e.target.value)} style={styles.input} />
            </div>
            <div style={styles.controlsRow} className="strategy-controls-row">
              <label style={styles.label}>Rate %</label>
              <input type="number" value={rateInput} onChange={(e) => setRateInput(e.target.value)} style={styles.input} />
            </div>
            <div style={styles.controlsRow} className="strategy-controls-row">
              <label style={styles.label}>Premium Source</label>
              <select value={pricingSource} onChange={(e) => setPricingSource(e.target.value)} style={styles.input}>
                {PRICING_SOURCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div style={styles.heroHint}>
              Using <strong>{getPricingSourceLabel(pricingSource)}</strong> to match the Expected Option Prices page more closely.
            </div>
            <button onClick={applyModelInputs} style={styles.applyButton}>Apply Model Inputs</button>
          </div>
        </div>

        <div style={styles.card} className="strategy-card">
          <h2 style={styles.sectionTitle}>Strategy Legs</h2>
          <div className="strategy-legs-shell">
          <div style={styles.legsHeader} className="strategy-legs-header">
            <span>Side</span>
            <span>Type</span>
            <span>Expiry</span>
            <span>Strike</span>
            <span>Lots</span>
            <span>Entry Premium</span>
            <span>Actions</span>
          </div>
          <div style={{ marginTop: 8, marginBottom: 12 }}>
            <label style={{ marginRight: 8, color: theme.textSecondary, fontSize: 12 }}>Expiry</label>
            <select value={selectedExpiry || ''} onChange={(e) => setSelectedExpiry(Number(e.target.value) || null)} style={{ padding: '6px 8px', borderRadius: 6, background: theme.inputBg, color: theme.textPrimary, border: `1px solid ${theme.inputBorder}` }}>
              <option value="">Select expiry</option>
              {expiryOptions.map((d) => (
                <option key={d} value={d}>{formatExpiryDisplay(d)}</option>
              ))}
            </select>
          </div>
          <div style={styles.legActionsBar}>
            <button onClick={addStrategySet} disabled={legs.length >= MAX_LEGS} style={legs.length >= MAX_LEGS ? { ...styles.secondaryButton, opacity: 0.4, cursor: 'not-allowed' } : styles.secondaryButton}>+ Add Default Set</button>
            <button onClick={addCustomLeg} disabled={legs.length >= MAX_LEGS} style={legs.length >= MAX_LEGS ? { ...styles.secondaryButton, opacity: 0.4, cursor: 'not-allowed' } : styles.secondaryButton}>+ Add Custom Leg</button>
            <span style={{ color: theme.textSecondary, fontSize: 12, alignSelf: 'center' }}>{legs.length} / {MAX_LEGS} legs</span>
          </div>
          {legs.map((leg) => (
            <div key={leg.id} style={styles.legWrap}>
              <div style={styles.legRow} className="strategy-leg-row">
                <select value={leg.side} disabled={leg.locked} onChange={(e) => updateLeg(leg.id, 'side', e.target.value)} style={styles.input}>
                  <option value="SELL">SELL</option>
                  <option value="BUY">BUY</option>
                </select>
                <select value={leg.optionType} disabled={leg.locked} onChange={(e) => updateLeg(leg.id, 'optionType', e.target.value)} style={styles.input}>
                  <option value="PE">PE</option>
                  <option value="CE">CE</option>
                </select>
                <select
                  value={leg.expiry || selectedExpiry || ''}
                  onChange={(e) => updateLeg(leg.id, 'expiry', Number(e.target.value) || null)}
                  style={{ ...styles.input, minWidth: 110 }}
                >
                  <option value="">Select</option>
                  {expiryOptions.map((d) => (
                    <option key={d} value={d}>{formatExpiryDisplay(d)}</option>
                  ))}
                </select>
                {strikesList && strikesList.length ? (
                  (() => {
                    const radius = STRIKE_SELECTOR_DISTANCE;
                    const nearby = strikesList.filter((s) => s >= Math.max(0, spotPrice - radius) && s <= spotPrice + radius);
                    const display = nearby.length ? nearby.slice(0, 120) : strikesList.slice(0, 120);
                    return (
                      <select value={leg.strike} disabled={leg.locked} onChange={(e) => updateLeg(leg.id, 'strike', Number(e.target.value || 0))} style={styles.input}>
                        {display.map((s) => (<option key={s} value={s}>{s}</option>))}
                      </select>
                    );
                  })()
                ) : (
                  <input type="number" value={leg.strike} disabled={leg.locked} onChange={(e) => updateLeg(leg.id, 'strike', parseFloat(e.target.value || 0))} style={styles.input} />
                )}
                <input type="number" min="1" value={leg.quantity ?? 1} onChange={(e) => updateLeg(leg.id, 'quantity', e.target.value)} style={styles.input} />
                <input
                  type="number"
                  value={leg.premium}
                  disabled={leg.locked}
                  onChange={(e) => updateLeg(leg.id, 'premium', parseFloat(e.target.value || 0))}
                  onBlur={() => updateLeg(leg.id, 'locked', true)}
                  style={styles.input}
                />
                <div style={styles.legButtons}>
                  <button onClick={() => toggleLock(leg.id)} style={leg.locked ? styles.lockedButton : styles.secondaryButton}>
                    {leg.locked ? 'Unlock' : 'Lock'}
                  </button>
                  <button onClick={() => removeLeg(leg.id)} style={styles.removeButton}>
                    Remove
                  </button>
                </div>
              </div>
              <div style={styles.legMeta}>
                {(() => {
                  const strike = Number(leg.strike);
                  const expiry = Number(leg.expiry) || 0;
                  const expiryIv = expiry > 0 ? ivMapRef.current.byExpiry?.[expiry]?.[leg.optionType]?.[strike] : null;
                  const fallbackIv = ivMapRef.current[leg.optionType]?.[strike];
                  const resolvedIv = expiryIv ?? fallbackIv;
                  return resolvedIv != null ? `IV ${Number(resolvedIv).toFixed(2)}%` : 'IV —';
                })()}
                {` · Live ${Number(leg.marketPremium ?? leg.premium).toFixed(2)}`}
                {leg.locked ? ' · entry locked' : ' · follows live premium'}
              </div>
            </div>
          ))}
          </div>
        </div>

        {legs.length > 0 && <div style={styles.metricsGrid}>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Entry Net Credit / Debit</div>
            <div style={styles.metricValue}>Rs. {metrics.entryNetPremium.toFixed(2)}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Live Close Value</div>
            <div style={styles.metricValue}>Rs. {metrics.liveCloseValue.toFixed(2)}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Premium Left In Shorts</div>
            <div style={styles.metricValue}>Rs. {metrics.premiumRemaining.toFixed(2)}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Premium Captured</div>
            <div style={{ ...styles.metricValue, color: metrics.capturedPremium >= 0 ? theme.green : theme.red }}>Rs. {metrics.capturedPremium.toFixed(2)}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Premium Capture %</div>
            <div style={styles.metricValue}>{metrics.capturePct.toFixed(1)}%</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Live MTM From Premiums</div>
            <div style={{ ...styles.metricValue, color: metrics.markToMarket >= 0 ? theme.green : theme.red }}>Rs. {metrics.markToMarket.toFixed(2)}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Maximum Profit</div>
            <div style={{ ...styles.metricValue, color: theme.green }}>{metrics.isUnlimitedProfit ? '∞ Unlimited' : `Rs. ${metrics.maxProfit.toFixed(2)}`}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Maximum Loss</div>
            <div style={{ ...styles.metricValue, color: theme.red }}>{metrics.isUnlimitedLoss ? '∞ Unlimited' : `Rs. ${Math.abs(metrics.maxLoss).toFixed(2)}`}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Payoff At Current Spot</div>
            <div style={{ ...styles.metricValue, color: metrics.currentPayoff >= 0 ? theme.green : theme.red }}>Rs. {metrics.currentPayoff.toFixed(2)}</div>
          </div>
        </div>}

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>{editingStrategyId ? 'Update Saved Strategy' : 'Save Locked Strategy'}</h2>
          {editingStrategyId ? (
            <div style={styles.editingBanner}>
              Editing saved strategy <strong>{strategyName}</strong>. Save again to update the same dashboard box.
            </div>
          ) : null}
          <div style={styles.saveRow}>
            <input
              type="text"
              value={strategyName}
              onChange={(e) => setStrategyName(e.target.value)}
              placeholder="Example: Weekly iron condor #1"
              style={styles.input}
            />
            <select
              value={saveTarget}
              onChange={(e) => setSaveTarget(e.target.value)}
              style={styles.input}
              title="Save destination"
            >
              {SAVE_TARGET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{`Save as ${option.label}`}</option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={entryDateTime}
              onChange={(e) => setEntryDateTime(e.target.value)}
              style={styles.input}
              title="Entry date and time"
            />
            <button onClick={saveCurrentStrategy} style={styles.saveButton}>
              {saveLoading ? 'Saving…' : editingStrategyId ? 'Update Strategy' : 'Save to Nifty Tracker'}
            </button>
            <button onClick={resetStrategyDraft} style={styles.secondaryButton}>Reset Legs</button>
            <button onClick={() => router.push('/nifty-strategies')} style={styles.secondaryButton}>Open Nifty Tracker</button>
          </div>
          <p style={styles.explanation}>
            Saving writes this setup into storage, freezes the current entry premiums, and uses the selected entry date/time for historical tracking. After save, the Nifty tracker page shows live P/L with correct timeline placement.
          </p>
          <div style={styles.saveHint}>Saved strategies: {savedStrategies.length} · strike selection now shows about 2000 points up and down from spot.</div>
          {saveMessage ? <div style={{ ...styles.saveMessage, color: theme.infoText, background: `${theme.cyan}1a`, borderColor: `${theme.cyan}50` }}>{saveMessage}</div> : null}
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>🔍 Strategy Optimizer — Find Best Shorting Strategies</h2>
          <p style={styles.explanation}>
            The optimizer exhaustively searches hundreds of thousands of combinations across 11 strategy families (Iron Condor, Iron Butterfly, Jade Lizard, Twisted Sister, Ratio Condor, Strangle+Wings, Ratio Spread, Double Condor, Bear Call Ladder, Bull Put Ladder, Layered Condor) with 3–8 legs. It evaluates every viable combination and ranks the best for 6 scoring profiles. Lot size = {lotSize || 65} (1 lot = {lotSize || 65} qty).
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 12, marginBottom: 12 }}>
            <button onClick={runOptimizer} disabled={optimizerLoading} style={optimizerLoading ? { ...styles.applyButton, opacity: 0.6, cursor: 'not-allowed' } : styles.applyButton}>
              {optimizerLoading ? 'Analyzing…' : 'Run Optimizer'}
            </button>
            {optimizerResult && !optimizerLoading ? (
              <span style={{ color: theme.green, fontSize: 13 }}>
                ✓ Evaluated {optimizerResult.totalCombinationsEvaluated?.toLocaleString()} combinations · {optimizerResult.viableCandidates?.toLocaleString()} viable{optimizerResult.computeTimeMs ? ` · ${(optimizerResult.computeTimeMs / 1000).toFixed(1)}s` : ''}
              </span>
            ) : null}
          </div>
          {optimizerLoading ? (
            <div style={styles.loaderWrap}>
              <div style={styles.loaderOuter}>
                <div style={styles.loaderInner} />
              </div>
              <div style={styles.loaderText}>
                <div style={{ fontSize: 15, fontWeight: 'bold', color: theme.textPrimary, marginBottom: 6 }}>Finding best strategies…</div>
                <div style={{ fontSize: 12, color: theme.textSecondary }}>Evaluating Iron Condors, Butterflies, Jade Lizards, Ratio Spreads, Call/Put Ladders, Layered Condors and more across all combinations</div>
              </div>
              <style>{`
                @keyframes optimizerSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                @keyframes optimizerPulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
              `}</style>
            </div>
          ) : null}
          {optimizerError ? <div style={{ ...styles.saveMessage, borderColor: `${theme.red}50`, color: theme.red, background: `${theme.red}15` }}>{optimizerError}</div> : null}
          {optimizerResult && !optimizerLoading ? (
            <div>
              <details style={{ marginBottom: 14, background: theme.panelDarkBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 10, padding: '10px 14px' }}>
                <summary style={{ cursor: 'pointer', color: theme.textSecondary, fontSize: 13, fontWeight: 'bold' }}>
                  📊 Combination Details — {optimizerResult.totalCombinationsEvaluated?.toLocaleString()} total checked, {optimizerResult.viableCandidates?.toLocaleString()} viable{optimizerResult.computeTimeMs ? ` (${(optimizerResult.computeTimeMs / 1000).toFixed(1)}s)` : ''}
                </summary>
                <div style={{ marginTop: 10, fontSize: 12, color: theme.textMid }}>
                  <div style={{ marginBottom: 8, color: theme.textPrimary, fontWeight: 'bold' }}>Combinations checked per family:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 6 }}>
                    {Object.entries(optimizerResult.familyCounts || {}).map(([family, count]) => (
                      <div key={family} style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 6, padding: '6px 10px', fontSize: 11 }}>
                        <strong style={{ color: theme.cyan }}>{family}</strong>: {count.toLocaleString()} combinations
                      </div>
                    ))}
                  </div>
                  {optimizerResult.bestPerFamily && optimizerResult.bestPerFamily.length > 0 ? (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ color: theme.textPrimary, fontWeight: 'bold', marginBottom: 6 }}>Best strategy found per family (best overall score):</div>
                      {optimizerResult.bestPerFamily.map((bpf) => (
                        <div key={bpf.family} style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 8, padding: '8px 10px', marginBottom: 6, fontSize: 11, color: theme.textMid }}>
                          <strong style={{ color: theme.cyan }}>{bpf.family}</strong> ({bpf.legCount} legs): {bpf.legs.map(l => `${l.side} ${l.strike} ${l.type}`).join(' / ')} — Max Profit: <span style={{ color: theme.green }}>Rs. {bpf.maxProfit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>, Max Loss: <span style={{ color: theme.red }}>Rs. {Math.abs(bpf.maxLoss).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>, Zone: {bpf.profitZoneWidth} pts
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </details>
              {(optimizerResult.profiles || []).map((profile) => (
                <details key={profile.key} style={{ marginBottom: 12 }} open={profile.key === 'balanced'}>
                  <summary style={{ cursor: 'pointer', color: theme.textHeading, fontSize: 15, fontWeight: 'bold', padding: '8px 0' }}>
                    {profile.label} <span style={{ fontWeight: 'normal', color: theme.textSecondary, fontSize: 12 }}>— {profile.description}</span>
                  </summary>
                  <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
                    {(profile.strategies || []).map((strat) => (
                      <div key={`${profile.key}-${strat.rank}`} style={{ background: theme.panelDarkBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                          <div>
                            <span style={{ color: theme.cyan, fontWeight: 'bold', fontSize: 14 }}>#{strat.rank} {strat.family}</span>
                            <span style={{ color: theme.textSecondary, fontSize: 12, marginLeft: 8 }}>{strat.legCount} legs · {strat.totalLots} lots</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ background: `${theme.green}26`, border: `1px solid ${theme.green}66`, borderRadius: 8, padding: '4px 12px', color: theme.green, fontWeight: 'bold', fontSize: 15 }}>Profit: Rs. {strat.maxProfit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                            <button
                              onClick={() => loadOptimizedStrategy(strat)}
                              style={{ ...styles.applyButton, padding: '6px 14px', fontSize: 12 }}
                            >
                              Use This Strategy
                            </button>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                          {strat.legs.map((leg, li) => (
                            <span
                              key={li}
                              style={{
                                display: 'inline-block',
                                padding: '4px 10px',
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 'bold',
                                background: leg.side === 'SELL' ? `${theme.red}26` : `${theme.green}26`,
                                color: leg.side === 'SELL' ? theme.red : theme.green,
                                border: `1px solid ${leg.side === 'SELL' ? theme.red : theme.green}66`,
                              }}
                            >
                              {leg.side} {leg.quantity > 1 ? `${leg.quantity}x ` : ''}{leg.strike} {leg.type} @ {leg.premium.toFixed(2)}
                            </span>
                          ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, fontSize: 12 }}>
                          <div style={{ color: theme.textSecondary }}>Credit: <span style={{ color: theme.green, fontWeight: 'bold' }}>Rs. {strat.entryCredit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></div>
                          <div style={{ color: theme.textSecondary }}>Max Profit: <span style={{ color: theme.green, fontWeight: 'bold' }}>Rs. {strat.maxProfit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span> <span style={{ fontSize: 10, color: theme.textMuted }}>(1 lot × {optimizerResult.lotSize || 65} qty)</span></div>
                          <div style={{ color: theme.textSecondary }}>Max Loss: <span style={{ color: theme.red, fontWeight: 'bold' }}>Rs. {Math.abs(strat.maxLoss).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span> <span style={{ fontSize: 10, color: theme.textMuted }}>(1 lot × {optimizerResult.lotSize || 65} qty)</span></div>
                          <div style={{ color: theme.textSecondary }}>Profit Zone: <span style={{ color: theme.yellow, fontWeight: 'bold' }}>{strat.profitZoneWidth} pts</span></div>
                          <div style={{ color: theme.textSecondary }}>Risk:Reward: <span style={{ color: theme.blue, fontWeight: 'bold' }}>{strat.rewardToRisk ? `1:${strat.rewardToRisk}` : '—'}</span></div>
                          <div style={{ color: theme.textSecondary }}>Break-evens: <span style={{ color: theme.textPrimary }}>{strat.breakEvens.length ? strat.breakEvens.join(', ') : '—'}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          ) : null}
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>📅 Calendar Spread Optimizer — Cross-Expiry Strategies</h2>
          <p style={styles.explanation}>
            Calendar spreads sell options on a near-term expiry and buy on a far-term expiry to capture time decay difference. For example, sell 13th Apr CE and buy 21st Apr CE. This searches thousands of cross-expiry combos to find the best calendar strategies.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 12, marginBottom: 12, alignItems: 'end' }}>
            <div>
              <label style={{ color: theme.textSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>Sell Expiry (near-term)</label>
              <select value={calSellExpiry} onChange={(e) => setCalSellExpiry(e.target.value)} style={styles.input}>
                <option value="">Select expiry to sell</option>
                {expiryOptions.map((d) => (
                  <option key={`sell-${d}`} value={d}>{formatExpiryDisplay(d)}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ color: theme.textSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>Buy Expiry (far-term)</label>
              <select value={calBuyExpiry} onChange={(e) => setCalBuyExpiry(e.target.value)} style={styles.input}>
                <option value="">Select expiry to buy</option>
                {expiryOptions.map((d) => (
                  <option key={`buy-${d}`} value={d}>{formatExpiryDisplay(d)}</option>
                ))}
              </select>
            </div>
            <div>
              <button onClick={runCalendarOptimizer} disabled={calendarLoading} style={calendarLoading ? { ...styles.applyButton, opacity: 0.6, cursor: 'not-allowed' } : styles.applyButton}>
                {calendarLoading ? 'Analyzing…' : 'Run Calendar Optimizer'}
              </button>
            </div>
          </div>
          {calendarLoading ? (
            <div style={styles.loaderWrap}>
              <div style={styles.loaderOuter}>
                <div style={styles.loaderInner} />
              </div>
              <div style={styles.loaderText}>
                <div style={{ fontSize: 15, fontWeight: 'bold', color: theme.textPrimary, marginBottom: 6 }}>Analyzing calendar spreads…</div>
                <div style={{ fontSize: 12, color: theme.textSecondary }}>Comparing premiums across expiries and evaluating Calendar CE, Calendar PE, Double Calendar and Calendar Condor structures</div>
              </div>
              <style>{`
                @keyframes optimizerSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                @keyframes optimizerPulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
              `}</style>
            </div>
          ) : null}
          {calendarError ? <div style={{ ...styles.saveMessage, borderColor: `${theme.red}50`, color: theme.red, background: `${theme.red}15` }}>{calendarError}</div> : null}
          {calendarResult && !calendarLoading ? (
            <div>
              <div style={{ color: theme.green, fontSize: 13, marginBottom: 12 }}>
                ✓ Evaluated {calendarResult.totalCombinationsEvaluated?.toLocaleString()} calendar combinations · {calendarResult.viableCandidates?.toLocaleString()} viable · Sell {calendarResult.sellExpiryDays}d / Buy {calendarResult.buyExpiryDays}d
              </div>
              {(calendarResult.profiles || []).map((profile) => (
                <details key={profile.key} style={{ marginBottom: 12 }} open={profile.key === 'cal-balanced'}>
                  <summary style={{ cursor: 'pointer', color: theme.textHeading, fontSize: 15, fontWeight: 'bold', padding: '8px 0' }}>
                    {profile.label} <span style={{ fontWeight: 'normal', color: theme.textSecondary, fontSize: 12 }}>— {profile.description}</span>
                  </summary>
                  <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
                    {(profile.strategies || []).map((strat) => (
                      <div key={`${profile.key}-${strat.rank}`} style={{ background: theme.panelDarkBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                          <div>
                            <span style={{ color: theme.purple, fontWeight: 'bold', fontSize: 14 }}>#{strat.rank} {strat.family}</span>
                            <span style={{ color: theme.textSecondary, fontSize: 12, marginLeft: 8 }}>{strat.legCount} legs · {strat.totalLots} lots</span>
                          </div>
                          <button
                            onClick={() => loadOptimizedStrategy(strat)}
                            style={{ ...styles.applyButton, padding: '6px 14px', fontSize: 12, background: theme.purple, color: theme.textHeading }}
                          >
                            Use This Strategy
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                          {strat.legs.map((leg, li) => (
                            <span
                              key={li}
                              style={{
                                display: 'inline-block',
                                padding: '4px 10px',
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 'bold',
                                background: leg.side === 'SELL' ? `${theme.red}26` : `${theme.green}26`,
                                color: leg.side === 'SELL' ? theme.red : theme.green,
                                border: `1px solid ${leg.side === 'SELL' ? theme.red : theme.green}66`,
                              }}
                            >
                              {leg.side} {leg.quantity > 1 ? `${leg.quantity}x ` : ''}{leg.strike} {leg.type} @ {leg.premium.toFixed(2)}
                            </span>
                          ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, fontSize: 12 }}>
                          <div style={{ color: theme.textSecondary }}>Credit: <span style={{ color: theme.green, fontWeight: 'bold' }}>Rs. {strat.entryCredit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></div>
                          <div style={{ color: theme.textSecondary }}>Max Profit: <span style={{ color: theme.green, fontWeight: 'bold' }}>Rs. {strat.maxProfit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></div>
                          <div style={{ color: theme.textSecondary }}>Max Loss: <span style={{ color: theme.red, fontWeight: 'bold' }}>Rs. {Math.abs(strat.maxLoss).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></div>
                          <div style={{ color: theme.textSecondary }}>Profit Zone: <span style={{ color: theme.yellow, fontWeight: 'bold' }}>{strat.profitZoneWidth} pts</span></div>
                          <div style={{ color: theme.textSecondary }}>Risk:Reward: <span style={{ color: theme.blue, fontWeight: 'bold' }}>{strat.rewardToRisk ? `1:${strat.rewardToRisk}` : '—'}</span></div>
                          <div style={{ color: theme.textSecondary }}>Break-evens: <span style={{ color: theme.textPrimary }}>{strat.breakEvens.length ? strat.breakEvens.join(', ') : '—'}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          ) : null}
        </div>

        {legs.length > 0 && (
        <>
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Strategy Dashboard</h2>
          <div style={styles.dashboardGrid}>
            <div style={{ ...styles.dashboardBox, borderColor: theme.greenDim }}>
              <div style={styles.dashboardLabel}>Max Profit</div>
              <div style={{ ...styles.dashboardValue, color: theme.green }}>{metrics.isUnlimitedProfit ? '∞ Unlimited' : `Rs. ${metrics.maxProfit.toFixed(2)}`}</div>
            </div>
            <div style={{ ...styles.dashboardBox, borderColor: theme.redDim }}>
              <div style={styles.dashboardLabel}>Max Loss</div>
              <div style={{ ...styles.dashboardValue, color: theme.red }}>{metrics.isUnlimitedLoss ? '∞ Unlimited' : `Rs. ${Math.abs(metrics.maxLoss).toFixed(2)}`}</div>
            </div>
            <div style={{ ...styles.dashboardBox, borderColor: theme.blue }}>
              <div style={styles.dashboardLabel}>Breakeven(s)</div>
              <div style={styles.dashboardValue}>
                {metrics.breakEvens.length ? metrics.breakEvens.map((v) => `Rs. ${v}`).join(', ') : '—'}
              </div>
            </div>
            <div style={{ ...styles.dashboardBox, borderColor: theme.greenDim }}>
              <div style={styles.dashboardLabel}>Profit Range</div>
              <div style={{ ...styles.dashboardValue, color: theme.green, fontSize: '16px' }}>
                {metrics.profitRange}
              </div>
            </div>
            <div style={{ ...styles.dashboardBox, borderColor: theme.redDim }}>
              <div style={styles.dashboardLabel}>Loss Range</div>
              <div style={{ ...styles.dashboardValue, color: theme.red, fontSize: '16px' }}>
                {metrics.lossRange}
              </div>
            </div>
            <div style={{ ...styles.dashboardBox, borderColor: theme.cardBorderHover }}>
              <div style={styles.dashboardLabel}>Risk:Reward</div>
              <div style={styles.dashboardValue}>
                {metrics.riskRewardRatio ? `1:${metrics.riskRewardRatio.toFixed(2)}` : '—'}
              </div>
            </div>
            <div style={{ ...styles.dashboardBox, borderColor: theme.emerald }}>
              <div style={styles.dashboardLabel}>Best Profit Near</div>
              <div style={{ ...styles.dashboardValue, color: theme.emerald }}>
                {metrics.maxProfitSpot ?? '—'}
              </div>
            </div>
            <div style={{ ...styles.dashboardBox, borderColor: theme.yellow }}>
              <div style={styles.dashboardLabel}>Profit Zone Width</div>
              <div style={{ ...styles.dashboardValue, color: theme.yellow }}>
                {metrics.profitRangeWidth > 0 ? `${metrics.profitRangeWidth} pts` : 'None'}
              </div>
            </div>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Expiry Payoff Curve</h2>
          <PayoffChart
            points={metrics.points}
            minY={metrics.minY}
            maxY={metrics.maxY}
            currentSpot={spotPrice}
            breakEvens={metrics.breakEvens}
            styles={styles}
            theme={theme}
          />
          <div style={styles.breakEvenRow}>
            <strong>Break-even zones:</strong> {metrics.breakEvens.length > 0 ? metrics.breakEvens.map((value) => `Rs. ${value}`).join(', ') : 'No zero-crossing found in sampled range'}
          </div>
          <div style={styles.chartInfoGrid}>
            <div style={styles.chartInfoCard}>
              <div style={styles.chartInfoLabel}>Max profit</div>
              <div style={{ ...styles.chartInfoValue, color: theme.green }}>
                {metrics.isUnlimitedProfit ? '∞ Unlimited' : formatCurrency(metrics.maxProfit)}
              </div>
              <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>near spot {metrics.maxProfitSpot ?? '—'}</div>
            </div>
            <div style={styles.chartInfoCard}>
              <div style={styles.chartInfoLabel}>Max loss</div>
              <div style={{ ...styles.chartInfoValue, color: theme.red }}>
                {metrics.isUnlimitedLoss ? '∞ Unlimited' : formatCurrency(Math.abs(metrics.maxLoss))}
              </div>
              <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>near spot {metrics.maxLossSpot ?? '—'}</div>
            </div>
            <div style={styles.chartInfoCard}>
              <div style={styles.chartInfoLabel}>Payoff at current spot</div>
              <div style={{ ...styles.chartInfoValue, color: metrics.currentPayoff >= 0 ? theme.green : theme.red }}>
                {formatCurrency(metrics.currentPayoff)}
              </div>
            </div>
            <div style={styles.chartInfoCard}>
              <div style={styles.chartInfoLabel}>Risk:Reward</div>
              <div style={styles.chartInfoValue}>
                {metrics.isUnlimitedProfit || metrics.isUnlimitedLoss
                  ? (metrics.isUnlimitedProfit ? '∞' : '1') + ':' + (metrics.isUnlimitedLoss ? '∞' : '1')
                  : metrics.riskRewardRatio != null ? `1:${metrics.riskRewardRatio.toFixed(2)}` : '—'}
              </div>
            </div>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Profit vs Loss Range Map</h2>
          <RangeMapChart
            points={metrics.points}
            profitZones={metrics.profitZones}
            lossZones={metrics.lossZones}
            currentSpot={spotPrice}
            breakEvens={metrics.breakEvens}
            styles={styles}
          />
          <p style={styles.explanation}>
            Green stretches show expiry spots where the structure stays profitable. Red stretches show where risk is active, and the blue marker is the live Nifty level.
          </p>
        </div>

        <div style={styles.doubleChartGrid}>
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Risk Snapshot</h2>
            <MetricBarChart
              items={[
                { label: 'Max Profit', value: metrics.maxProfit, color: theme.green },
                { label: 'Max Loss', value: Math.abs(metrics.maxLoss), color: theme.red },
                { label: 'Current Payoff', value: metrics.currentPayoff, color: metrics.currentPayoff >= 0 ? theme.green : theme.orange },
                { label: 'Live MTM', value: metrics.markToMarket, color: metrics.markToMarket >= 0 ? theme.cyan : theme.red },
              ]}
              styles={styles}
            />
          </div>

          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Premium Snapshot</h2>
            <MetricBarChart
              items={[
                { label: 'Entry Net', value: metrics.entryNetPremium, color: theme.purple },
                { label: 'Premium Left', value: metrics.premiumRemaining, color: theme.yellow },
                { label: 'Captured', value: metrics.capturedPremium, color: theme.green },
                { label: 'Close Value', value: metrics.liveCloseValue, color: theme.blue },
              ]}
              styles={styles}
            />
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Stay Or Exit</h2>
          <p style={styles.explanation}>{metrics.holdAdvice}</p>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>What This Means</h2>
          <p style={styles.explanation}>{explanation}</p>
          <ul style={styles.bullets}>
            <li>The payoff curve shows exactly where max profit sits and how quickly the risk grows away from that zone.</li>
            <li>The range map makes the profitable expiry band much easier to see before you save the structure.</li>
            <li>Saved snapshots keep the entry prices fixed, so dashboard MTM stays comparable even when the market moves.</li>
          </ul>
        </div>
        </>
        )}
      </div>
    </>
  );
}

const darkStyles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #020617, #0f172a)',
    color: '#e2e8f0',
    padding: '20px',
    fontFamily: 'monospace',
  },
  loading: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#020617',
    color: '#e2e8f0',
    fontFamily: 'monospace',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    marginBottom: '20px',
  },
  title: {
    margin: 0,
    fontSize: '28px',
  },
  subTitle: {
    marginTop: '6px',
    color: '#94a3b8',
    fontSize: '12px',
  },
  back: {
    background: '#111827',
    color: '#e2e8f0',
    border: '1px solid #334155',
    padding: '10px 14px',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  topGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '16px',
    marginBottom: '16px',
  },
  heroCard: {
    background: 'rgba(15, 23, 42, 0.85)',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    padding: '18px',
  },
  heroLabel: {
    color: '#94a3b8',
    fontSize: '12px',
    marginBottom: '8px',
  },
  heroPrice: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: '8px',
  },
  heroHint: {
    fontSize: '12px',
    color: '#cbd5e1',
    lineHeight: '1.5',
  },
  controlsRow: {
    display: 'grid',
    gridTemplateColumns: '100px 1fr',
    gap: '12px',
    alignItems: 'center',
    marginBottom: '10px',
  },
  label: {
    color: '#cbd5e1',
    fontSize: '12px',
  },
  card: {
    background: 'rgba(15, 23, 42, 0.85)',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    padding: '18px',
    marginBottom: '16px',
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: '14px',
    fontSize: '18px',
  },
  legsHeader: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1.1fr 0.8fr 1fr 1.2fr',
    gap: '10px',
    color: '#94a3b8',
    fontSize: '12px',
    marginBottom: '8px',
  },
  legRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1.1fr 0.8fr 1fr 1.2fr',
    gap: '10px',
  },
  legActionsBar: {
    display: 'flex',
    gap: '10px',
    marginBottom: '14px',
    flexWrap: 'wrap',
  },
  legWrap: {
    marginBottom: '10px',
  },
  legMeta: {
    marginTop: '6px',
    fontSize: '11px',
    color: '#94a3b8',
  },
  legButtons: {
    display: 'flex',
    gap: '8px',
  },
  modelPill: {
    display: 'inline-block',
    marginTop: '10px',
    padding: '6px 10px',
    borderRadius: '999px',
    background: '#172554',
    color: '#bfdbfe',
    fontSize: '11px',
  },
  warningText: {
    marginTop: '10px',
    fontSize: '12px',
    color: '#fbbf24',
    lineHeight: '1.5',
  },
  applyButton: {
    marginTop: '8px',
    background: '#1d4ed8',
    color: '#eff6ff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 12px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  secondaryButton: {
    background: '#0f172a',
    color: '#bfdbfe',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '10px 12px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  lockedButton: {
    background: '#14532d',
    color: '#dcfce7',
    border: '1px solid #166534',
    borderRadius: '8px',
    padding: '10px 12px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  removeButton: {
    background: '#450a0a',
    color: '#fecaca',
    border: '1px solid #7f1d1d',
    borderRadius: '8px',
    padding: '10px 12px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  input: {
    width: '100%',
    background: '#020617',
    color: '#e2e8f0',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '10px',
    fontFamily: 'monospace',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
    marginBottom: '16px',
  },
  metricCard: {
    background: 'rgba(15, 23, 42, 0.85)',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    padding: '16px',
  },
  metricLabel: {
    color: '#94a3b8',
    fontSize: '12px',
    marginBottom: '8px',
  },
  metricValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  dashboardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '16px',
  },
  dashboardBox: {
    background: '#0f172a',
    border: '2px solid #334155',
    borderRadius: '14px',
    padding: '20px',
    textAlign: 'center',
  },
  dashboardLabel: {
    color: '#94a3b8',
    fontSize: '13px',
    marginBottom: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  dashboardValue: {
    fontSize: '22px',
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  editingBanner: {
    marginBottom: '12px',
    background: 'rgba(37, 99, 235, 0.12)',
    border: '1px solid rgba(96, 165, 250, 0.28)',
    color: '#dbeafe',
    borderRadius: '10px',
    padding: '10px 12px',
    fontSize: '13px',
  },
  saveRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '10px',
    alignItems: 'center',
    marginBottom: '12px',
  },
  saveButton: {
    background: '#059669',
    color: '#ecfdf5',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 12px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  saveHint: {
    color: '#93c5fd',
    fontSize: '12px',
    marginTop: '8px',
  },
  saveMessage: {
    marginTop: '10px',
    background: 'rgba(8, 145, 178, 0.12)',
    border: '1px solid rgba(34, 211, 238, 0.28)',
    color: '#bfdbfe',
    borderRadius: '10px',
    padding: '10px 12px',
    fontSize: '13px',
  },
  chartLegend: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    color: '#cbd5e1',
    fontSize: '12px',
    marginTop: '10px',
  },
  chartMetaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    color: '#94a3b8',
    fontSize: '12px',
    marginTop: '8px',
  },
  rangeChartWrap: {
    position: 'relative',
    height: '72px',
    marginTop: '10px',
    marginBottom: '6px',
  },
  rangeTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '26px',
    height: '14px',
    borderRadius: '999px',
    background: '#1e293b',
  },
  rangeSegment: {
    position: 'absolute',
    top: '26px',
    height: '14px',
    borderRadius: '999px',
  },
  currentMarker: {
    position: 'absolute',
    top: '10px',
    width: '2px',
    height: '46px',
    background: '#38bdf8',
    boxShadow: '0 0 10px rgba(56, 189, 248, 0.5)',
  },
  breakEvenMarker: {
    position: 'absolute',
    top: '20px',
    width: '8px',
    height: '8px',
    marginLeft: '-4px',
    borderRadius: '999px',
    background: '#fbbf24',
    border: '2px solid #111827',
  },
  barChartWrap: {
    display: 'grid',
    gap: '10px',
  },
  barRow: {
    display: 'grid',
    gridTemplateColumns: '110px 1fr 72px',
    gap: '10px',
    alignItems: 'center',
  },
  barLabel: {
    color: '#cbd5e1',
    fontSize: '12px',
  },
  barTrack: {
    height: '12px',
    borderRadius: '999px',
    background: '#0f172a',
    overflow: 'hidden',
    border: '1px solid #1e293b',
  },
  barFill: {
    height: '100%',
    borderRadius: '999px',
  },
  barValue: {
    fontSize: '12px',
    fontWeight: 'bold',
    textAlign: 'right',
  },
  chartInfoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '12px',
    marginTop: '14px',
  },
  chartInfoCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    padding: '12px',
  },
  chartInfoLabel: {
    color: '#94a3b8',
    fontSize: '11px',
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  chartInfoValue: {
    color: '#f8fafc',
    fontSize: '18px',
    fontWeight: 'bold',
  },
  doubleChartGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '16px',
  },
  breakEvenRow: {
    marginTop: '12px',
    color: '#cbd5e1',
    fontSize: '13px',
    lineHeight: '1.5',
  },
  explanation: {
    color: '#e2e8f0',
    lineHeight: '1.6',
    fontSize: '14px',
  },
  bullets: {
    color: '#cbd5e1',
    fontSize: '13px',
    lineHeight: '1.7',
    paddingLeft: '20px',
  },
  loaderWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    padding: '24px 20px',
    background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.8))',
    border: '1px solid rgba(56,189,248,0.2)',
    borderRadius: '16px',
    marginBottom: '16px',
  },
  loaderOuter: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    border: '3px solid #1e293b',
    borderTopColor: '#38bdf8',
    animation: 'optimizerSpin 1s linear infinite',
    flexShrink: 0,
  },
  loaderInner: {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(56,189,248,0.15) 0%, transparent 70%)',
    animation: 'optimizerPulse 1.5s ease-in-out infinite',
  },
  loaderText: {
    flex: 1,
  },
};
