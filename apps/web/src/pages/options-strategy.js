import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';

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

function normalizePremium(value) {
  return Number((Number(value) || 0).toFixed(2));
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

function createLeg(id, side, optionType, strike, chainMap) {
  const marketPremium = normalizePremium(chainMap?.[optionType]?.[strike]);
  return {
    id,
    side,
    optionType,
    strike,
    premium: marketPremium,
    marketPremium,
    locked: false,
  };
}

function buildDefaultLegs(spot, strikesList, chainMap, getNextLegId) {
  const shortStrike = resolveStrategyStrike(spot, strikesList, 0);
  const upperHedgeStrike = resolveStrategyStrike(spot, strikesList, WING_DISTANCE);
  const lowerHedgeStrike = resolveStrategyStrike(spot, strikesList, -WING_DISTANCE);

  return [
    createLeg(getNextLegId(), 'SELL', 'CE', shortStrike, chainMap),
    createLeg(getNextLegId(), 'SELL', 'PE', shortStrike, chainMap),
    createLeg(getNextLegId(), 'BUY', 'CE', upperHedgeStrike, chainMap),
    createLeg(getNextLegId(), 'BUY', 'PE', lowerHedgeStrike, chainMap),
  ];
}

function syncLegsWithMarket(currentLegs, chainMap) {
  return currentLegs.map((leg) => {
    const latest = chainMap?.[leg.optionType]?.[Number(leg.strike)];
    if (latest == null) return leg;
    const marketPremium = normalizePremium(latest);
    return {
      ...leg,
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
  const premiumEffect = leg.side === 'SELL' ? leg.premium : -leg.premium;
  const intrinsicEffect = leg.side === 'SELL' ? -intrinsic : intrinsic;
  return premiumEffect + intrinsicEffect;
}

function PayoffChart({ points, minY, maxY }) {
  if (!points.length) {
    return null;
  }

  const rangeY = maxY - minY || 1;
  const polyline = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 110 - ((point.value - minY) / rangeY) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 100 110" preserveAspectRatio="none" style={{ width: '100%', height: '220px' }}>
      <line x1="0" y1="55" x2="100" y2="55" stroke="#334155" strokeDasharray="2 2" />
      <polyline fill="none" stroke="#22c55e" strokeWidth="2.5" points={polyline} />
    </svg>
  );
}

export default function OptionsStrategy() {
  const router = useRouter();
  const nextLegIdRef = useRef(1);
  const getNextLegId = () => {
    const nextId = nextLegIdRef.current;
    nextLegIdRef.current += 1;
    return nextId;
  };
  const initializedDefaultsRef = useRef(false);
  const [user, setUser] = useState(null);
  const [spotPrice, setSpotPrice] = useState(23000);
  const [lotSize, setLotSize] = useState(65);
  const [expiryOptions, setExpiryOptions] = useState([]);
  const [selectedExpiry, setSelectedExpiry] = useState(null);
  const [strikesList, setStrikesList] = useState([]);
  const [legs, setLegs] = useState([]);
  const legsRef = useRef([]);
  useEffect(() => { legsRef.current = legs; }, [legs]);
  const [liveSource, setLiveSource] = useState('loading');
  const [chainMap, setChainMap] = useState({ CE: {}, PE: {} });
  const chainMapRef = useRef({ CE: {}, PE: {} });
  useEffect(() => { chainMapRef.current = chainMap; }, [chainMap]);
  const [ivMap, setIvMap] = useState({ CE: {}, PE: {} });
  const ivMapRef = useRef({ CE: {}, PE: {} });
  useEffect(() => { ivMapRef.current = ivMap; }, [ivMap]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [secsAgo, setSecsAgo] = useState(0);
  const [pricingModel, setPricingModel] = useState(null);
  const [sourceWarning, setSourceWarning] = useState('');
  const [ivInput, setIvInput] = useState('');
  const [rateInput, setRateInput] = useState('');
  const selectedExpiryRef = useRef(selectedExpiry);
  useEffect(() => { selectedExpiryRef.current = selectedExpiry; }, [selectedExpiry]);
  const pricingInputsRef = useRef({ ivInput: '', rateInput: '' });
  useEffect(() => { pricingInputsRef.current = { ivInput, rateInput }; }, [ivInput, rateInput]);
  const pricingHydratedRef = useRef(false);

  const buildChainUrl = (expiryValue) => {
    const params = new URLSearchParams({ symbol: 'NIFTY' });
    if (expiryValue) params.set('expiry', String(expiryValue));
    if (pricingInputsRef.current.ivInput) params.set('iv', pricingInputsRef.current.ivInput);
    if (pricingInputsRef.current.rateInput) params.set('rate', pricingInputsRef.current.rateInput);
    return `/api/options-chain?${params.toString()}`;
  };

  // Tick seconds-ago counter every second
  useEffect(() => {
    const t = setInterval(() => {
      setSecsAgo(lastUpdated ? Math.round((Date.now() - lastUpdated.getTime()) / 1000) : 0);
    }, 1000);
    return () => clearInterval(t);
  }, [lastUpdated]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.push('/');
      return;
    }
    setUser(JSON.parse(storedUser));
  }, [router]);

  useEffect(() => {
    const loadNifty = async () => {
      try {
        const response = await fetch('/api/market-indices');
        const data = await response.json();
        const nifty = (data.indices || []).find((index) => index.key === 'NIFTY50');
        if (nifty) {
          setSpotPrice(Number(nifty.price.toFixed(2)));
          setLiveSource(nifty.source || 'market-indices');
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
            cursor.setHours(23, 59, 59, 0); // start from end-of-today
            while (nextTuesdays.length < 4) {
              cursor.setDate(cursor.getDate() + 1);
              if (cursor.getDay() === 2) nextTuesdays.push(Math.floor(cursor.getTime() / 1000));
            }
            setExpiryOptions(nextTuesdays);
            firstExpiry = nextTuesdays[0];
            setSelectedExpiry(firstExpiry);
          }
          // Step 2: fetch strikes specifically for the first expiry date
          const expParam = firstExpiry ? `&expiry=${firstExpiry}` : '';
          const er = await fetch(buildChainUrl(firstExpiry));
          const expiryData = await er.json();
          const src = expiryData.strikes?.length ? expiryData : chainData;
          if (src.strikes && src.strikes.length) {
            const unique = Array.from(new Set(src.strikes.map((s) => Number(s.strike)))).sort((a, b) => a - b);
            setStrikesList(unique);
            const map = { CE: {}, PE: {} };
            const nextIvMap = { CE: {}, PE: {} };
            src.strikes.forEach((s) => {
              if (map[s.type]) map[s.type][Number(s.strike)] = s.price || s.lastPrice || s.bid || s.ask || 0;
              if (nextIvMap[s.type]) nextIvMap[s.type][Number(s.strike)] = s.iv ?? null;
            });
            setChainMap(map);
            setIvMap(nextIvMap);
            applyMarketData(map, src.spot ? Number(src.spot.toFixed(2)) : spotPrice, unique);
          }
          if (expiryData.source) setLiveSource(expiryData.source);
          if (expiryData.spot) setSpotPrice(Number(expiryData.spot.toFixed(2)));
          setPricingModel(expiryData.pricingModel || null);
          setSourceWarning(expiryData.warning || '');
          if (!pricingHydratedRef.current && expiryData.pricingModel) {
            setIvInput(String(expiryData.pricingModel.baseIv));
            setRateInput(String(expiryData.pricingModel.riskFreeRate));
            pricingHydratedRef.current = true;
          }
          setLastUpdated(new Date());
          setSecsAgo(0);
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

  const applyMarketData = (nextChainMap, nextSpotPrice = spotPrice, nextStrikesList = strikesList) => {
    setLegs((current) => {
      if (!current.length && !initializedDefaultsRef.current) {
        initializedDefaultsRef.current = true;
        return buildDefaultLegs(nextSpotPrice, nextStrikesList, nextChainMap, getNextLegId);
      }
      return syncLegsWithMarket(current, nextChainMap);
    });
  };

  const updateLeg = (id, field, value) => {
    setLegs((current) => current.map((leg) => {
      if (leg.id !== id) return leg;
      const next = { ...leg, [field]: value };
      // When strike or type changes, auto-fill premium from cached chainMap
      if (field === 'strike' || field === 'optionType') {
        const type = field === 'optionType' ? value : leg.optionType;
        const strike = field === 'strike' ? Number(value) : Number(leg.strike);
        const p = chainMapRef.current[type]?.[strike];
        if (p != null) {
          const normalized = normalizePremium(p);
          next.marketPremium = normalized;
          if (!leg.locked) next.premium = normalized;
        }
      }
      if (field === 'premium') {
        next.premium = normalizePremium(value);
      }
      return next;
    }));
  };

  const toggleLock = (id) => {
    setLegs((current) => current.map((leg) => {
      if (leg.id !== id) return leg;
      if (leg.locked) {
        return {
          ...leg,
          locked: false,
          premium: leg.marketPremium ?? leg.premium,
        };
      }
      return {
        ...leg,
        locked: true,
        premium: leg.marketPremium ?? leg.premium,
      };
    }));
  };

  const addStrategySet = () => {
    setLegs((current) => [
      ...current,
      ...buildDefaultLegs(spotPrice, strikesList, chainMapRef.current, getNextLegId),
    ]);
  };

  const addCustomLeg = () => {
    const strike = resolveStrategyStrike(spotPrice, strikesList, 0);
    setLegs((current) => [
      ...current,
      createLeg(getNextLegId(), 'SELL', 'CE', strike, chainMapRef.current),
    ]);
  };

  const removeLeg = (id) => {
    setLegs((current) => (current.length > 1 ? current.filter((leg) => leg.id !== id) : current));
  };

  // when expiry changes, refresh strikes + premiums for all legs from API
  useEffect(() => {
    if (!selectedExpiry) return;
    (async () => {
      try {
        const res = await fetch(buildChainUrl(selectedExpiry));
        const data = await res.json();
        if (data.strikes && data.strikes.length) {
          const unique = Array.from(new Set(data.strikes.map((s) => Number(s.strike)))).sort((a, b) => a - b);
          setStrikesList(unique);
          const map = { CE: {}, PE: {} };
          const nextIvMap = { CE: {}, PE: {} };
          data.strikes.forEach((s) => {
            if (map[s.type]) map[s.type][Number(s.strike)] = s.price || s.lastPrice || s.bid || s.ask || 0;
            if (nextIvMap[s.type]) nextIvMap[s.type][Number(s.strike)] = s.iv ?? null;
          });
          setChainMap(map);
          setIvMap(nextIvMap);
          applyMarketData(map, data.spot ? Number(data.spot.toFixed(2)) : spotPrice, unique);
        } else {
          setStrikesList([]);
        }
        setPricingModel(data.pricingModel || null);
        setSourceWarning(data.warning || '');
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
        if (data.spot) setSpotPrice(Number(data.spot.toFixed(2)));
        if (data.source) setLiveSource(data.source);
        if (data.strikes && data.strikes.length) {
          const unique = Array.from(new Set(data.strikes.map((s) => Number(s.strike)))).sort((a, b) => a - b);
          setStrikesList(unique);
          const map = { CE: {}, PE: {} };
          const nextIvMap = { CE: {}, PE: {} };
          data.strikes.forEach((s) => {
            if (map[s.type]) map[s.type][Number(s.strike)] = s.price || s.lastPrice || s.bid || s.ask || 0;
            if (nextIvMap[s.type]) nextIvMap[s.type][Number(s.strike)] = s.iv ?? null;
          });
          setChainMap(map);
          setIvMap(nextIvMap);
          applyMarketData(map, data.spot ? Number(data.spot.toFixed(2)) : spotPrice, unique);
        }
        setPricingModel(data.pricingModel || null);
        setSourceWarning(data.warning || '');
        setLastUpdated(new Date());
        setSecsAgo(0);
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
      if (data.spot) setSpotPrice(Number(data.spot.toFixed(2)));
      if (data.source) setLiveSource(data.source);
      if (data.strikes && data.strikes.length) {
        const unique = Array.from(new Set(data.strikes.map((s) => Number(s.strike)))).sort((a, b) => a - b);
        setStrikesList(unique);
        const map = { CE: {}, PE: {} };
        const nextIvMap = { CE: {}, PE: {} };
        data.strikes.forEach((s) => {
          if (map[s.type]) map[s.type][Number(s.strike)] = s.price || s.lastPrice || s.bid || s.ask || 0;
          if (nextIvMap[s.type]) nextIvMap[s.type][Number(s.strike)] = s.iv ?? null;
        });
        setChainMap(map);
        setIvMap(nextIvMap);
        applyMarketData(map, data.spot ? Number(data.spot.toFixed(2)) : spotPrice, unique);
      }
      setPricingModel(data.pricingModel || null);
      setSourceWarning(data.warning || '');
      setLastUpdated(new Date());
      setSecsAgo(0);
    } catch (_) { /* ignore */ } finally {
      setLiveLoading(false);
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
        minY: 0,
        maxY: 0,
        holdAdvice: 'Add strategy legs to see payoff metrics.',
      };
    }

    const sortedStrikes = [...new Set(legs.map((leg) => leg.strike))].sort((left, right) => left - right);
    const lower = sortedStrikes[0] || spotPrice - 1000;
    const upper = sortedStrikes[sortedStrikes.length - 1] || spotPrice + 1000;
    const start = Math.max(lower - 1000, 0);
    const end = upper + 1000;
    const step = Math.max(Math.round((end - start) / 30), 50);

    const points = [];
    for (let spot = start; spot <= end; spot += step) {
      const perUnitPayoff = legs.reduce((sum, leg) => sum + legPayoffAtExpiry(leg, spot), 0);
      points.push({ spot, value: Number((perUnitPayoff * lotSize).toFixed(2)) });
    }

    const pointValues = points.map((point) => point.value);
    const maxProfit = Math.max(...pointValues);
    const maxLoss = Math.min(...pointValues);
    const atCurrentSpot = legs.reduce((sum, leg) => sum + legPayoffAtExpiry(leg, spotPrice), 0) * lotSize;
    const entryNetPremium = legs.reduce((sum, leg) => sum + (leg.side === 'SELL' ? leg.premium : -leg.premium), 0) * lotSize;
    const liveCloseValue = legs.reduce((sum, leg) => {
      const marketPremium = Number(leg.marketPremium ?? leg.premium) || 0;
      return sum + (leg.side === 'BUY' ? marketPremium : -marketPremium);
    }, 0) * lotSize;
    const premiumSoldAtEntry = legs.reduce((sum, leg) => sum + (leg.side === 'SELL' ? leg.premium : 0), 0) * lotSize;
    const premiumRemaining = legs.reduce((sum, leg) => sum + (leg.side === 'SELL' ? Number(leg.marketPremium ?? leg.premium) || 0 : 0), 0) * lotSize;
    const capturedPremium = premiumSoldAtEntry - premiumRemaining;
    const capturePct = premiumSoldAtEntry > 0 ? (capturedPremium / premiumSoldAtEntry) * 100 : 0;
    const markToMarket = legs.reduce((sum, leg) => {
      const marketPremium = Number(leg.marketPremium ?? leg.premium) || 0;
      return sum + (leg.side === 'SELL' ? leg.premium - marketPremium : marketPremium - leg.premium);
    }, 0) * lotSize;

    const breakEvenCandidates = [];
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      if ((previous.value <= 0 && current.value >= 0) || (previous.value >= 0 && current.value <= 0)) {
        breakEvenCandidates.push(current.spot);
      }
    }

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
      minY: Math.min(...pointValues),
      maxY: Math.max(...pointValues),
      holdAdvice,
    };
  }, [legs, lotSize, spotPrice]);

  const explanation = useMemo(() => {
    const maxLossAbsolute = Math.abs(metrics.maxLoss).toFixed(2);
    return `For this strategy, max profit is Rs. ${metrics.maxProfit.toFixed(2)} and max loss is Rs. ${maxLossAbsolute}. Locking a leg freezes its entry premium so you can compare premium captured versus premium still left in the market.`;
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
        }
      `}</style>
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Nifty Options Strategy</h1>
            <div style={styles.subTitle}>Live Nifty spot from {liveSource}</div>
          </div>
          <button onClick={() => router.push('/dashboard')} style={styles.back}>← Back</button>
        </div>

        <div style={styles.topGrid}>
          <div style={styles.heroCard}>
            <div style={styles.heroLabel}>Nifty Live Price</div>
            <div style={styles.heroPrice}>Rs. {spotPrice.toFixed(2)}</div>
            <div style={{ fontSize: 11, marginTop: 4, color: ['nse', 'angel-one'].includes(liveSource) ? '#22c55e' : '#f59e0b' }}>
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
          <div style={styles.heroCard}>
            <div style={styles.controlsRow}>
              <label style={styles.label}>Spot Price</label>
              <input type="number" value={spotPrice} onChange={(e) => setSpotPrice(parseFloat(e.target.value || 0))} style={styles.input} />
            </div>
            <div style={styles.controlsRow}>
              <label style={styles.label}>Lot Size</label>
              <input type="number" value={lotSize} onChange={(e) => setLotSize(parseInt(e.target.value || 0, 10) || 1)} style={styles.input} />
            </div>
            <div style={styles.controlsRow}>
              <label style={styles.label}>Base IV %</label>
              <input type="number" value={ivInput} onChange={(e) => setIvInput(e.target.value)} style={styles.input} />
            </div>
            <div style={styles.controlsRow}>
              <label style={styles.label}>Rate %</label>
              <input type="number" value={rateInput} onChange={(e) => setRateInput(e.target.value)} style={styles.input} />
            </div>
            <button onClick={applyModelInputs} style={styles.applyButton}>Apply Model Inputs</button>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Strategy Legs</h2>
          <div style={styles.legsHeader}>
            <span>Side</span>
            <span>Type</span>
            <span>Strike</span>
            <span>Entry Premium</span>
            <span>Actions</span>
          </div>
          <div style={{ marginTop: 8, marginBottom: 12 }}>
            <label style={{ marginRight: 8, color: '#94a3b8', fontSize: 12 }}>Expiry</label>
            <select value={selectedExpiry || ''} onChange={(e) => setSelectedExpiry(Number(e.target.value) || null)} style={{ padding: '6px 8px', borderRadius: 6, background: '#020617', color: '#e2e8f0', border: '1px solid #334155' }}>
              <option value="">Select expiry</option>
              {expiryOptions.map((d) => (
                <option key={d} value={d}>{new Date(Number(d) * 1000).toDateString()}</option>
              ))}
            </select>
          </div>
          <div style={styles.legActionsBar}>
            <button onClick={addStrategySet} style={styles.secondaryButton}>+ Add Default Set</button>
            <button onClick={addCustomLeg} style={styles.secondaryButton}>+ Add Custom Leg</button>
          </div>
          {legs.map((leg) => (
            <div key={leg.id} style={styles.legWrap}>
              <div style={styles.legRow}>
                <select value={leg.side} disabled={leg.locked} onChange={(e) => updateLeg(leg.id, 'side', e.target.value)} style={styles.input}>
                  <option value="SELL">SELL</option>
                  <option value="BUY">BUY</option>
                </select>
                <select value={leg.optionType} disabled={leg.locked} onChange={(e) => updateLeg(leg.id, 'optionType', e.target.value)} style={styles.input}>
                  <option value="PE">PE</option>
                  <option value="CE">CE</option>
                </select>
                {strikesList && strikesList.length ? (
                  (() => {
                    const radius = 1000;
                    const nearby = strikesList.filter((s) => s >= Math.max(0, spotPrice - radius) && s <= spotPrice + radius);
                    const display = nearby.length ? nearby.slice(0, 40) : strikesList.slice(0, 40);
                    return (
                      <select value={leg.strike} disabled={leg.locked} onChange={(e) => updateLeg(leg.id, 'strike', Number(e.target.value || 0))} style={styles.input}>
                        {display.map((s) => (<option key={s} value={s}>{s}</option>))}
                      </select>
                    );
                  })()
                ) : (
                  <input type="number" value={leg.strike} disabled={leg.locked} onChange={(e) => updateLeg(leg.id, 'strike', parseFloat(e.target.value || 0))} style={styles.input} />
                )}
                <input type="number" value={leg.premium} disabled={leg.locked} onChange={(e) => updateLeg(leg.id, 'premium', parseFloat(e.target.value || 0))} style={styles.input} />
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
                {ivMapRef.current[leg.optionType]?.[Number(leg.strike)] != null ? `IV ${Number(ivMapRef.current[leg.optionType][Number(leg.strike)]).toFixed(2)}%` : 'IV —'}
                {` · Live ${Number(leg.marketPremium ?? leg.premium).toFixed(2)}`}
                {leg.locked ? ' · entry locked' : ' · follows live premium'}
              </div>
            </div>
          ))}
        </div>

        <div style={styles.metricsGrid}>
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
            <div style={{ ...styles.metricValue, color: metrics.capturedPremium >= 0 ? '#22c55e' : '#f87171' }}>Rs. {metrics.capturedPremium.toFixed(2)}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Premium Capture %</div>
            <div style={styles.metricValue}>{metrics.capturePct.toFixed(1)}%</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Live MTM From Premiums</div>
            <div style={{ ...styles.metricValue, color: metrics.markToMarket >= 0 ? '#22c55e' : '#f87171' }}>Rs. {metrics.markToMarket.toFixed(2)}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Maximum Profit</div>
            <div style={{ ...styles.metricValue, color: '#22c55e' }}>Rs. {metrics.maxProfit.toFixed(2)}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Maximum Loss</div>
            <div style={{ ...styles.metricValue, color: '#f87171' }}>Rs. {Math.abs(metrics.maxLoss).toFixed(2)}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Payoff At Current Spot</div>
            <div style={{ ...styles.metricValue, color: metrics.currentPayoff >= 0 ? '#22c55e' : '#f87171' }}>Rs. {metrics.currentPayoff.toFixed(2)}</div>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Stay Or Exit</h2>
          <p style={styles.explanation}>{metrics.holdAdvice}</p>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Expiry Payoff Chart</h2>
          <PayoffChart points={metrics.points} minY={metrics.minY} maxY={metrics.maxY} />
          <div style={styles.breakEvenRow}>
            <strong>Break-even zones:</strong> {metrics.breakEvens.length > 0 ? metrics.breakEvens.map((value) => `Rs. ${value}`).join(', ') : 'No zero-crossing found in sampled range'}
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>What This Means</h2>
          <p style={styles.explanation}>{explanation}</p>
          <ul style={styles.bullets}>
            <li>If Nifty expires near the short strike, you keep most of the net credit.</li>
            <li>Your long wings at 22000 PE and 24000 CE cap the loss on both sides.</li>
            <li>Exact max profit and max loss depend on the option premiums, not just strikes.</li>
          </ul>
        </div>
      </div>
    </>
  );
}

const styles = {
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
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '10px',
    color: '#94a3b8',
    fontSize: '12px',
    marginBottom: '8px',
  },
  legRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
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
};
