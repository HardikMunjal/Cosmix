import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildDefaultStrategyName,
  extractTextFromImage,
  looksLikeWrongImportSource,
  matchExpiryFromHint,
  parseZerodhaOrdersText,
  SAMPLE_EXECUTED_NIFTY_ORDERS,
  SAMPLE_POSITIONS_NIFTY,
} from './zerodhaOrderImport';
import { mergeLegsByContract, normalizeLotQty } from './strategyLegMath';

const STRIKE_STEP = 50;
const WING_DISTANCE = 500;
const MAX_LEGS = 8;

const TEMPLATES = [
  {
    id: 'iron-condor',
    title: 'Iron Condor',
    subtitle: 'Sell ATM call & put, buy wings',
    badge: 'Popular',
    build: (spot, strikes, chainMap, nextId, expiry) => {
      const shortStrike = resolveStrike(spot, strikes, 0);
      const upper = resolveStrike(spot, strikes, WING_DISTANCE);
      const lower = resolveStrike(spot, strikes, -WING_DISTANCE);
      return [
        createLeg(nextId(), 'SELL', 'CE', shortStrike, chainMap, expiry),
        createLeg(nextId(), 'SELL', 'PE', shortStrike, chainMap, expiry),
        createLeg(nextId(), 'BUY', 'CE', upper, chainMap, expiry),
        createLeg(nextId(), 'BUY', 'PE', lower, chainMap, expiry),
      ];
    },
  },
  {
    id: 'bull-call',
    title: 'Bull Call Spread',
    subtitle: 'Buy ATM call, sell higher call',
    badge: 'Bullish',
    build: (spot, strikes, chainMap, nextId, expiry) => {
      const longStrike = resolveStrike(spot, strikes, 0);
      const shortStrike = resolveStrike(spot, strikes, WING_DISTANCE);
      return [
        createLeg(nextId(), 'BUY', 'CE', longStrike, chainMap, expiry),
        createLeg(nextId(), 'SELL', 'CE', shortStrike, chainMap, expiry),
      ];
    },
  },
  {
    id: 'bear-put',
    title: 'Bear Put Spread',
    subtitle: 'Buy ATM put, sell lower put',
    badge: 'Bearish',
    build: (spot, strikes, chainMap, nextId, expiry) => {
      const longStrike = resolveStrike(spot, strikes, 0);
      const shortStrike = resolveStrike(spot, strikes, -WING_DISTANCE);
      return [
        createLeg(nextId(), 'BUY', 'PE', longStrike, chainMap, expiry),
        createLeg(nextId(), 'SELL', 'PE', shortStrike, chainMap, expiry),
      ];
    },
  },
  {
    id: 'short-straddle',
    title: 'Short Straddle',
    subtitle: 'Sell ATM call and put',
    badge: 'Neutral',
    build: (spot, strikes, chainMap, nextId, expiry) => {
      const strike = resolveStrike(spot, strikes, 0);
      return [
        createLeg(nextId(), 'SELL', 'CE', strike, chainMap, expiry),
        createLeg(nextId(), 'SELL', 'PE', strike, chainMap, expiry),
      ];
    },
  },
  {
    id: 'custom',
    title: 'Custom',
    subtitle: 'Start with one leg and edit freely',
    badge: 'Flexible',
    build: (spot, strikes, chainMap, nextId, expiry) => {
      const strike = resolveStrike(spot, strikes, 0);
      return [createLeg(nextId(), 'SELL', 'CE', strike, chainMap, expiry)];
    },
  },
  {
    id: 'broker-import',
    title: 'From Zerodha orders',
    subtitle: 'Import COMPLETE trades from screenshot or pasted text',
    badge: 'Import',
    build: null,
  },
];

function normalizePremium(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function formatExpiryDisplay(unixSeconds) {
  const expiry = Number(unixSeconds);
  if (!Number.isFinite(expiry) || expiry <= 0) return 'Select expiry';
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ms = expiry * 1000 + IST_OFFSET_MS;
  const date = new Date(ms);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getUTCDay()]} ${date.getUTCDate()} ${months[date.getUTCMonth()]}`;
}

function resolveStrike(spot, strikesList = [], offset = 0) {
  const target = Math.max(0, (Number(spot) || 0) + offset);
  if (strikesList.length) {
    return strikesList.reduce((closest, strike) => {
      if (closest == null) return strike;
      return Math.abs(strike - target) < Math.abs(closest - target) ? strike : closest;
    }, null);
  }
  return Math.max(0, Math.round(target / STRIKE_STEP) * STRIKE_STEP);
}

function resolveChainPremium(chainMap = {}, leg = {}) {
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
    locked: true,
    expiry: expiry || null,
  };
}

function buildQuoteMapsFromRows(rows = [], expiryValue = null) {
  const map = { CE: {}, PE: {}, byExpiry: {} };
  rows.forEach((row) => {
    const strike = Number(row.strike);
    if (!Number.isFinite(strike)) return;
    const optionType = String(row.type || row.optionType || '').toUpperCase();
    if (optionType !== 'CE' && optionType !== 'PE') return;
    const value = normalizePremium(row.price ?? row.lastPrice ?? row.ltp ?? row.premium ?? 0);
    const expiry = Number(row.expiryUnix || row.expiry || expiryValue) || null;
    map[optionType][strike] = value;
    if (expiry) {
      if (!map.byExpiry[expiry]) map.byExpiry[expiry] = { CE: {}, PE: {} };
      map.byExpiry[expiry][optionType][strike] = value;
    }
  });
  return map;
}

function toLocalDateTimeInputValue(value = new Date().toISOString()) {
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

function formatCurrency(value) {
  const numeric = Number(value) || 0;
  const sign = numeric < 0 ? '-' : '';
  return `${sign}Rs. ${Math.abs(numeric).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const STEPS = [
  { id: 1, label: 'Setup' },
  { id: 2, label: 'Structure' },
  { id: 3, label: 'Legs' },
  { id: 4, label: 'Review' },
];

export function CreateStrategyWizard({
  theme,
  onClose,
  onSaved,
  onOpenAdvanced,
}) {
  const nextLegIdRef = useRef(1);
  const getNextLegId = () => {
    const id = nextLegIdRef.current;
    nextLegIdRef.current += 1;
    return id;
  };

  const [step, setStep] = useState(1);
  const [strategyName, setStrategyName] = useState(() => buildDefaultStrategyName());
  const [saveTarget, setSaveTarget] = useState('active');
  const [lotSize, setLotSize] = useState(65);
  const [entryDateTime, setEntryDateTime] = useState(() => toLocalDateTimeInputValue());
  const [spotPrice, setSpotPrice] = useState(0);
  const [liveSource, setLiveSource] = useState('loading');
  const [expiryOptions, setExpiryOptions] = useState([]);
  const [selectedExpiry, setSelectedExpiry] = useState(null);
  const [strikesList, setStrikesList] = useState([]);
  const [chainMap, setChainMap] = useState({ CE: {}, PE: {}, byExpiry: {} });
  const [templateId, setTemplateId] = useState('iron-condor');
  const [legs, setLegs] = useState([]);
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState('');
  const fileInputRef = useRef(null);

  const loadMarket = useCallback(async (expiryOverride = null, extraExpiries = []) => {
    setLoadingMarket(true);
    setError('');
    try {
      const indicesRes = await fetch('/api/market-indices');
      const indicesData = await indicesRes.json();
      const nifty = (indicesData.indices || []).find((index) => index.key === 'NIFTY50');
      const nextSpot = Number(nifty?.price || 0);
      if (nextSpot > 0) setSpotPrice(Number(nextSpot.toFixed(2)));
      setLiveSource(nifty?.sourceLabel || nifty?.source || 'market-indices');

      const params = new URLSearchParams({ symbol: 'NIFTY' });
      if (expiryOverride) params.set('expiry', String(expiryOverride));
      const chainRes = await fetch(`/api/options-chain?${params.toString()}`);
      const chainData = await chainRes.json();
      if (!chainRes.ok) throw new Error(chainData.error || 'Unable to load option chain.');

      const expiries = Array.isArray(chainData.expirations)
        ? chainData.expirations.map(Number).filter((value) => Number.isFinite(value) && value > 0)
        : [];
      const nextExpiry = expiryOverride || selectedExpiry || expiries[0] || null;
      if (expiries.length) setExpiryOptions(expiries);
      if (nextExpiry) setSelectedExpiry(nextExpiry);

      let maps = buildQuoteMapsFromRows(chainData.strikes || [], nextExpiry);
      const uniqueExtras = [...new Set(
        (extraExpiries || [])
          .map(Number)
          .filter((value) => Number.isFinite(value) && value > 0 && value !== nextExpiry),
      )];

      for (const expiry of uniqueExtras.slice(0, 4)) {
        try {
          const extraRes = await fetch(`/api/options-chain?symbol=NIFTY&expiry=${expiry}`);
          const extraData = await extraRes.json();
          if (extraRes.ok) {
            const extraMaps = buildQuoteMapsFromRows(extraData.strikes || [], expiry);
            maps = {
              CE: { ...maps.CE, ...extraMaps.CE },
              PE: { ...maps.PE, ...extraMaps.PE },
              byExpiry: { ...(maps.byExpiry || {}), ...(extraMaps.byExpiry || {}) },
            };
          }
        } catch (_) { /* ignore */ }
      }

      setChainMap(maps);
      const strikes = Array.from(new Set((chainData.strikes || []).map((row) => Number(row.strike)).filter(Number.isFinite))).sort((a, b) => a - b);
      if (strikes.length) setStrikesList(strikes);
      if (chainData.spot) setSpotPrice(Number(Number(chainData.spot).toFixed(2)));
      return { spot: nextSpot || Number(chainData.spot || 0), strikes, maps, expiry: nextExpiry, expiries };
    } catch (err) {
      setError(err.message || 'Unable to load market data.');
      return null;
    } finally {
      setLoadingMarket(false);
    }
  }, [selectedExpiry]);

  useEffect(() => {
    loadMarket();
  }, []);

  const applyImportedLegs = useCallback(async (rawText, { manageImporting = true, allowSampleFallback = false } = {}) => {
    if (manageImporting) setImporting(true);
    setError('');
    setImportNote('');
    try {
      let textToParse = String(rawText || '').trim();
      // Never silently replace a real Zerodha Positions/Executed upload with stale sample fills.
      if (!textToParse && allowSampleFallback) {
        textToParse = SAMPLE_POSITIONS_NIFTY;
        setImportText(textToParse);
      } else if (looksLikeWrongImportSource(textToParse) && allowSampleFallback) {
        textToParse = SAMPLE_POSITIONS_NIFTY;
        setImportText(textToParse);
      }

      if (!textToParse) {
        throw new Error('Upload a Zerodha Positions or Executed screenshot, or paste the table text.');
      }

      const market = await loadMarket(selectedExpiry);
      const expiries = market?.expiries?.length ? market.expiries : expiryOptions;
      const parsed = parseZerodhaOrdersText(textToParse, { preferSymbol: 'NIFTY' });
      const usedFallback = allowSampleFallback
        && (textToParse === SAMPLE_POSITIONS_NIFTY || textToParse === SAMPLE_EXECUTED_NIFTY_ORDERS)
        && looksLikeWrongImportSource(String(rawText || ''));

      if (!parsed.legs.length) {
        throw new Error(parsed.warnings[0] || 'No Nifty positions or complete fills found in this screenshot.');
      }

      if (parsed.lotSize) setLotSize(parsed.lotSize);

      const neededExpiries = parsed.legs
        .map((leg) => matchExpiryFromHint(leg.expiryHint, expiries))
        .filter(Boolean);
      const refreshed = await loadMarket(neededExpiries[0] || selectedExpiry || market?.expiry, neededExpiries);
      const maps = refreshed?.maps || market?.maps || chainMap;

      nextLegIdRef.current = 1;
      const builtRaw = parsed.legs.map((leg) => {
        const expiry = matchExpiryFromHint(leg.expiryHint, refreshed?.expiries || expiries) || refreshed?.expiry || selectedExpiry;
        const created = createLeg(getNextLegId(), leg.side, leg.optionType, leg.strike, maps, expiry);
        return {
          ...created,
          quantity: normalizeLotQty(leg.quantity),
          premium: normalizePremium(leg.premium),
          marketPremium: normalizePremium(leg.premium),
          locked: true,
          expiry: expiry || null,
        };
      });
      const built = mergeLegsByContract(builtRaw).slice(0, MAX_LEGS).map((leg, index) => ({
        ...leg,
        id: index + 1,
      }));
      nextLegIdRef.current = built.length + 1;

      setLegs(built);
      setTemplateId('broker-import');
      setStrategyName(buildDefaultStrategyName('Zerodha import'));
      if (built[0]?.expiry) setSelectedExpiry(built[0].expiry);
      const summary = built.map((leg) => `${leg.side} ${leg.strike}${leg.optionType}×${leg.quantity}`).join(' · ');
      const sourceNote = parsed.source === 'positions'
        ? 'From Positions (open qty / avg). '
        : parsed.source === 'executed'
          ? 'From Executed COMPLETE fills. '
          : '';
      const fallbackNote = usedFallback
        ? 'Screenshot was not Zerodha rows — loaded current open Positions sample instead. '
        : '';
      setImportNote(`${fallbackNote}${sourceNote}Imported ${built.length} leg(s): ${summary}${parsed.warnings.length ? ` · ${parsed.warnings.join(' · ')}` : ''}.`);
      setStep(3);
      setError('');
    } catch (err) {
      setError(err.message || 'Unable to import orders.');
    } finally {
      if (manageImporting) setImporting(false);
    }
  }, [chainMap, expiryOptions, loadMarket, selectedExpiry]);

  const applyTemplate = useCallback(async (id) => {
    if (id === 'broker-import') {
      setTemplateId(id);
      return;
    }
    const template = TEMPLATES.find((item) => item.id === id) || TEMPLATES[0];
    setTemplateId(template.id);
    const market = await loadMarket(selectedExpiry);
    const spot = market?.spot || spotPrice;
    const strikes = market?.strikes?.length ? market.strikes : strikesList;
    const maps = market?.maps || chainMap;
    const expiry = market?.expiry || selectedExpiry;
    nextLegIdRef.current = 1;
    const built = template.build(spot, strikes, maps, getNextLegId, expiry);
    setLegs(built);
    setStrategyName(buildDefaultStrategyName(template.title));
  }, [chainMap, loadMarket, selectedExpiry, spotPrice, strikesList]);

  const netPremium = useMemo(() => legs.reduce((sum, leg) => {
    const qty = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
    const premium = Number(leg.premium) || 0;
    return sum + (leg.side === 'SELL' ? premium : -premium) * qty * Number(lotSize || 65);
  }, 0), [legs, lotSize]);

  const updateLeg = (id, patch) => {
    setLegs((current) => current.map((leg) => {
      if (leg.id !== id) return leg;
      const next = { ...leg, ...patch };
      if (patch.optionType != null || patch.strike != null || patch.expiry != null) {
        const marketPremium = normalizePremium(resolveChainPremium(chainMap, next));
        next.marketPremium = marketPremium;
        if (patch.premium == null) next.premium = marketPremium;
      }
      return next;
    }));
  };

  const addLeg = () => {
    if (legs.length >= MAX_LEGS) return;
    const strike = resolveStrike(spotPrice, strikesList, 0);
    setLegs((current) => [...current, createLeg(getNextLegId(), 'BUY', 'CE', strike, chainMap, selectedExpiry)]);
  };

  const removeLeg = (id) => {
    setLegs((current) => (current.length <= 1 ? current : current.filter((leg) => leg.id !== id)));
  };

  const canContinue = () => {
    if (step === 1) return Boolean(strategyName.trim()) && Boolean(selectedExpiry);
    if (step === 2) {
      if (templateId === 'broker-import') return true;
      return Boolean(templateId);
    }
    if (step === 3) return legs.length > 0 && legs.every((leg) => Number(leg.expiry) > 0);
    return true;
  };

  const handleNext = async () => {
    setError('');
    if (step === 1 && !canContinue()) {
      setError('Enter a strategy name and choose a default expiry to continue.');
      return;
    }
    if (step === 2) {
      if (templateId === 'broker-import') {
        if (!importText.trim()) {
          setError('Upload a Positions or Executed screenshot, or paste the table text first.');
          return;
        }
        await applyImportedLegs(importText.trim(), { allowSampleFallback: false });
        return;
      }
      await applyTemplate(templateId);
      setStep(3);
      return;
    }
    if (step < 4) {
      setStep((current) => current + 1);
    }
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    setError('');
    setImportNote('Reading screenshot…');
    try {
      const text = await extractTextFromImage(file);
      setImportText(text || '');
      setTemplateId('broker-import');
      if (!String(text || '').trim()) {
        throw new Error('Could not read text from this image. Try a sharper crop, or paste Positions / Executed rows as text.');
      }
      await applyImportedLegs(text, { manageImporting: false, allowSampleFallback: false });
    } catch (err) {
      setError(err.message || 'Unable to read screenshot. Paste Positions or Executed table text, or tap “Use open Positions”.');
      setImportNote('');
    } finally {
      setImporting(false);
    }
  };

  const handlePasteCompletedFills = async () => {
    setImportText(SAMPLE_EXECUTED_NIFTY_ORDERS);
    setTemplateId('broker-import');
    setError('');
    setImportNote('Loading COMPLETE Nifty fills…');
    setImporting(true);
    try {
      await applyImportedLegs(SAMPLE_EXECUTED_NIFTY_ORDERS, { manageImporting: false, allowSampleFallback: false });
    } finally {
      setImporting(false);
    }
  };

  const handleUseOpenPositions = async () => {
    setImportText(SAMPLE_POSITIONS_NIFTY);
    setTemplateId('broker-import');
    setError('');
    setImportNote('Loading open Positions…');
    setImporting(true);
    try {
      await applyImportedLegs(SAMPLE_POSITIONS_NIFTY, { manageImporting: false, allowSampleFallback: false });
    } finally {
      setImporting(false);
    }
  };

  const handleSave = async () => {
    if (!legs.length) {
      setError('Add at least one leg before saving.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const nowIso = new Date().toISOString();
      const selectedEntryAt = fromLocalDateTimeInputValue(entryDateTime) || nowIso;
      const uniqueExpiries = [...new Set(legs.map((leg) => Number(leg.expiry) || selectedExpiry).filter(Boolean))];
      const expiryLabel = uniqueExpiries.length > 1
        ? `Mixed · ${uniqueExpiries.map((expiry) => formatExpiryDisplay(expiry)).join(' / ')}`
        : (selectedExpiry ? formatExpiryDisplay(selectedExpiry) : 'Not selected');
      const payload = {
        id: `opt-${Date.now()}`,
        name: strategyName.trim() || buildDefaultStrategyName(),
        status: saveTarget,
        entryAt: selectedEntryAt,
        createdAt: selectedEntryAt,
        updatedAt: nowIso,
        selectedExpiry: uniqueExpiries[0] || selectedExpiry,
        expiryLabel,
        lotSize: Number(lotSize) || 65,
        savedAtSpot: Number(Number(spotPrice || 0).toFixed(2)),
        liveSource,
        pricingSource: 'live',
        legs: legs.map((leg) => ({
          ...leg,
          strike: Number(leg.strike),
          quantity: Math.max(1, parseInt(leg.quantity || 1, 10) || 1),
          premium: normalizePremium(leg.premium),
          marketPremium: normalizePremium(leg.marketPremium ?? leg.premium),
          locked: true,
          expiry: Number(leg.expiry) || selectedExpiry || null,
        })),
      };

      const response = await fetch('/api/options-strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save strategy.');
      if (typeof onSaved === 'function') {
        onSaved({ id: data.strategy?.id || payload.id, status: saveTarget, name: payload.name });
      }
    } catch (err) {
      setError(err.message || 'Unable to save strategy.');
    } finally {
      setSaving(false);
    }
  };

  const nearbyStrikes = useMemo(() => {
    if (!strikesList.length) return [];
    const radius = 2000;
    const nearby = strikesList.filter((strike) => strike >= spotPrice - radius && strike <= spotPrice + radius);
    return nearby.length ? nearby.slice(0, 120) : strikesList.slice(0, 120);
  }, [spotPrice, strikesList]);

  const inputStyle = {
    width: '100%',
    borderRadius: 10,
    border: `1px solid ${theme.inputBorder || theme.cardBorder}`,
    background: theme.inputBg || '#fff',
    color: theme.textPrimary,
    padding: '10px 12px',
    fontSize: 14,
    fontWeight: 600,
  };

  const labelStyle = {
    display: 'block',
    fontSize: 12,
    fontWeight: 700,
    color: theme.textSecondary,
    marginBottom: 6,
  };

  return (
    <div className="create-strategy-wizard">
      <div className="create-strategy-wizard-progress">
        {STEPS.map((item) => {
          const active = item.id === step;
          const done = item.id < step;
          return (
            <div
              key={item.id}
              className="create-strategy-wizard-step"
              style={{
                color: active ? theme.textHeading : theme.textMuted,
                borderColor: active ? theme.blue : done ? theme.green : theme.cardBorder,
                background: active ? `${theme.blue}14` : done ? `${theme.green}12` : theme.cardBg,
              }}
            >
              <span style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                display: 'inline-grid',
                placeItems: 'center',
                fontSize: 11,
                fontWeight: 800,
                background: active || done ? (done ? theme.green : theme.blue) : theme.badgeBg,
                color: active || done ? '#fff' : theme.textMuted,
              }}
              >
                {done ? '✓' : item.id}
              </span>
              {item.label}
            </div>
          );
        })}
      </div>

      <div className="create-strategy-wizard-body">
        {step === 1 ? (
          <div className="create-strategy-wizard-grid">
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: theme.textHeading, marginBottom: 6 }}>Strategy setup</div>
              <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 16 }}>
                Name the trade and choose whether it goes to Watchlist or Active book.
              </div>

              <label style={labelStyle}>Strategy name</label>
              <input
                style={inputStyle}
                value={strategyName}
                onChange={(event) => setStrategyName(event.target.value)}
                placeholder="e.g. Weekly Iron Condor"
              />

              <div style={{ height: 14 }} />

              <label style={labelStyle}>Portfolio</label>
              <div className="create-strategy-choice-row">
                {[
                  { value: 'active', title: 'Active', desc: 'Bought / live book (default)' },
                  { value: 'watching', title: 'Watchlist', desc: 'Track ideas before buying' },
                ].map((option) => {
                  const selected = saveTarget === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSaveTarget(option.value)}
                      className="create-strategy-choice"
                      style={{
                        borderColor: selected ? theme.blue : theme.cardBorder,
                        background: selected ? `${theme.blue}12` : theme.cardBg,
                      }}
                    >
                      <strong style={{ color: theme.textHeading }}>{option.title}</strong>
                      <span style={{ color: theme.textSecondary }}>{option.desc}</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ height: 14 }} />

              <label style={labelStyle}>Default expiry</label>
              <select
                style={inputStyle}
                value={selectedExpiry || ''}
                onChange={async (event) => {
                  const next = Number(event.target.value) || null;
                  setSelectedExpiry(next);
                  await loadMarket(next);
                }}
              >
                <option value="">Select expiry</option>
                {expiryOptions.map((expiry) => (
                  <option key={expiry} value={expiry}>{formatExpiryDisplay(expiry)}</option>
                ))}
              </select>
              <div style={{ marginTop: 6, fontSize: 12, color: theme.textMuted }}>
                Legs can use different expiries on the next steps (mixed expiry supported).
              </div>

              <button
                type="button"
                onClick={() => setShowAdvancedFields((value) => !value)}
                style={{
                  marginTop: 14,
                  border: 'none',
                  background: 'transparent',
                  color: theme.blue,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {showAdvancedFields ? 'Hide optional fields' : 'Show optional fields'}
              </button>

              {showAdvancedFields ? (
                <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                  <div>
                    <label style={labelStyle}>Lot size</label>
                    <input style={inputStyle} type="number" min="1" value={lotSize} onChange={(event) => setLotSize(Number(event.target.value) || 65)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Entry date & time</label>
                    <input style={inputStyle} type="datetime-local" value={entryDateTime} onChange={(event) => setEntryDateTime(event.target.value)} />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="create-strategy-side-card" style={{ borderColor: theme.cardBorder, background: theme.panelBg || theme.cardBg }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: theme.textMuted }}>Market snapshot</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: theme.textHeading, marginTop: 8 }}>
                {spotPrice ? `₹ ${spotPrice.toLocaleString('en-IN')}` : '—'}
              </div>
              <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 4 }}>
                Nifty spot · {loadingMarket ? 'Refreshing…' : (liveSource || 'live')}
              </div>
              <div style={{ marginTop: 16, fontSize: 13, color: theme.textSecondary, lineHeight: 1.5 }}>
                Premiums will default from the live option chain. You can edit them on the Legs step.
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: theme.textHeading, marginBottom: 6 }}>Choose a structure</div>
            <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 16 }}>
              Pick a template, or import COMPLETE orders from a Zerodha executed screenshot.
            </div>
            <div className="create-strategy-template-grid">
              {TEMPLATES.map((template) => {
                const selected = templateId === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setTemplateId(template.id)}
                    className="create-strategy-template"
                    style={{
                      borderColor: selected ? theme.blue : theme.cardBorder,
                      background: selected ? `${theme.blue}12` : theme.cardBg,
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 800, color: theme.blue }}>{template.badge}</span>
                    <strong style={{ color: theme.textHeading, fontSize: 15 }}>{template.title}</strong>
                    <span style={{ color: theme.textSecondary, fontSize: 12 }}>{template.subtitle}</span>
                  </button>
                );
              })}
            </div>

            {templateId === 'broker-import' ? (
              <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="create-strategy-secondary-btn"
                    style={{ borderColor: theme.cardBorder, color: theme.textHeading, background: theme.cardBg }}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                  >
                    {importing ? 'Scanning…' : 'Upload Zerodha screenshot'}
                  </button>
                  <button
                    type="button"
                    className="create-strategy-secondary-btn"
                    style={{ borderColor: theme.blue, color: theme.blue, background: `${theme.blue}10` }}
                    onClick={handleUseOpenPositions}
                    disabled={importing}
                  >
                    Use open Positions
                  </button>
                  <button
                    type="button"
                    className="create-strategy-secondary-btn"
                    style={{ borderColor: theme.cardBorder, color: theme.textHeading, background: theme.cardBg }}
                    onClick={handlePasteCompletedFills}
                    disabled={importing}
                  >
                    Use Executed fills
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={handleImportFile}
                  />
                </div>
                <div style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.45 }}>
                  Upload Zerodha <strong>Positions</strong> (best for live qty/avg) or <strong>Executed</strong> (COMPLETE fills).
                  SENSEX rows are skipped for Nifty strategies. Closed qty 0 rows are skipped.
                </div>
                <label style={labelStyle}>Or paste Positions / Executed text</label>
                <textarea
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  rows={7}
                  placeholder={'Positions example:\nNIFTY 4th AUG 24100 PE  910  114.12\nNIFTY 4th AUG 24200 CE -195  139.90\n\nExecuted example:\nBUY  NIFTY 4th AUG 24100 PE  130/130  58.60  COMPLETE\nSELL NIFTY 4th AUG 24200 CE   65/65  145.30 COMPLETE'}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, fontWeight: 500 }}
                />
                {importNote ? <div style={{ fontSize: 12, color: theme.textSecondary }}>{importNote}</div> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: theme.textHeading }}>Configure legs</div>
                <div style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4 }}>
                  {legs.length} leg{legs.length === 1 ? '' : 's'} · mixed expiry supported · Net {netPremium >= 0 ? 'credit' : 'debit'} {formatCurrency(Math.abs(netPremium))}
                </div>
              </div>
              <button type="button" onClick={addLeg} disabled={legs.length >= MAX_LEGS} className="create-strategy-secondary-btn" style={{ borderColor: theme.cardBorder, color: theme.textHeading, background: theme.cardBg }}>
                + Add leg
              </button>
            </div>

            <div className="create-strategy-legs">
              {legs.map((leg, index) => (
                <div key={leg.id} className="create-strategy-leg-card" style={{ borderColor: theme.cardBorder, background: theme.cardBg }}>
                  <div className="create-strategy-leg-title" style={{ color: theme.textHeading }}>
                    Leg {index + 1}
                    <button type="button" onClick={() => removeLeg(leg.id)} style={{ border: 'none', background: 'transparent', color: theme.red, fontWeight: 700, cursor: 'pointer' }}>
                      Remove
                    </button>
                  </div>
                  <div className="create-strategy-leg-grid">
                    <label>
                      <span style={labelStyle}>Side</span>
                      <select style={inputStyle} value={leg.side} onChange={(event) => updateLeg(leg.id, { side: event.target.value })}>
                        <option value="BUY">Buy</option>
                        <option value="SELL">Sell</option>
                      </select>
                    </label>
                    <label>
                      <span style={labelStyle}>Option</span>
                      <select style={inputStyle} value={leg.optionType} onChange={(event) => updateLeg(leg.id, { optionType: event.target.value })}>
                        <option value="CE">Call (CE)</option>
                        <option value="PE">Put (PE)</option>
                      </select>
                    </label>
                    <label>
                      <span style={labelStyle}>Expiry</span>
                      <select
                        style={inputStyle}
                        value={leg.expiry || selectedExpiry || ''}
                        onChange={async (event) => {
                          const nextExpiry = Number(event.target.value) || null;
                          await loadMarket(nextExpiry, [nextExpiry]);
                          updateLeg(leg.id, { expiry: nextExpiry });
                        }}
                      >
                        <option value="">Select</option>
                        {expiryOptions.map((expiry) => (
                          <option key={expiry} value={expiry}>{formatExpiryDisplay(expiry)}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span style={labelStyle}>Strike</span>
                      <select style={inputStyle} value={leg.strike} onChange={(event) => updateLeg(leg.id, { strike: Number(event.target.value) })}>
                        {(nearbyStrikes.includes(Number(leg.strike)) ? nearbyStrikes : [Number(leg.strike), ...nearbyStrikes].filter(Boolean)).map((strike) => (
                          <option key={strike} value={strike}>{strike}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span style={labelStyle}>Lots</span>
                      <input style={inputStyle} type="number" min="1" value={leg.quantity} onChange={(event) => updateLeg(leg.id, { quantity: event.target.value })} />
                    </label>
                    <label>
                      <span style={labelStyle}>Entry premium</span>
                      <input style={inputStyle} type="number" step="0.05" value={leg.premium} onChange={(event) => updateLeg(leg.id, { premium: Number(event.target.value) || 0 })} />
                    </label>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: theme.textMuted }}>
                    Live {normalizePremium(leg.marketPremium ?? leg.premium).toFixed(2)} · {formatExpiryDisplay(leg.expiry || selectedExpiry)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: theme.textHeading, marginBottom: 6 }}>Review & save</div>
            <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 16 }}>
              Confirm the book, then save to your Options Portfolio.
            </div>

            <div className="create-strategy-review" style={{ borderColor: theme.cardBorder, background: theme.cardBg }}>
              <div>
                <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>Strategy</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: theme.textHeading }}>{strategyName || 'Untitled strategy'}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>Portfolio</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: theme.textHeading }}>{saveTarget === 'active' ? 'Active' : 'Watchlist'}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>Expiry</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: theme.textHeading }}>{formatExpiryDisplay(selectedExpiry)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>Net premium</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: netPremium >= 0 ? theme.green : theme.red }}>
                  {netPremium >= 0 ? '+' : '-'}{formatCurrency(Math.abs(netPremium))}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
              {legs.map((leg, index) => (
                <div key={leg.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, color: theme.textPrimary, padding: '10px 12px', borderRadius: 10, border: `1px solid ${theme.cardBorder}`, background: theme.panelBg || theme.cardBg }}>
                  <span>
                    {index + 1}. {leg.side} {leg.optionType === 'CE' ? 'Call' : 'Put'} {leg.strike} × {Math.max(1, parseInt(leg.quantity || 1, 10) || 1)} lot · {formatExpiryDisplay(leg.expiry || selectedExpiry)}
                  </span>
                  <strong>@ {normalizePremium(leg.premium).toFixed(2)}</strong>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {error ? (
          <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: `${theme.red}14`, color: theme.red, fontSize: 13, fontWeight: 700 }}>
            {error}
          </div>
        ) : null}
      </div>

      <div className="create-strategy-wizard-footer">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {step > 1 ? (
            <button type="button" onClick={() => setStep((current) => current - 1)} className="create-strategy-secondary-btn" style={{ borderColor: theme.cardBorder, color: theme.textHeading, background: theme.cardBg }}>
              Back
            </button>
          ) : (
            <button type="button" onClick={onClose} className="create-strategy-secondary-btn" style={{ borderColor: theme.cardBorder, color: theme.textHeading, background: theme.cardBg }}>
              Cancel
            </button>
          )}
          {typeof onOpenAdvanced === 'function' ? (
            <button type="button" onClick={onOpenAdvanced} className="create-strategy-secondary-btn" style={{ borderColor: theme.cardBorder, color: theme.textSecondary, background: 'transparent' }}>
              Advanced builder
            </button>
          ) : null}
        </div>
        {step < 4 ? (
          <button
            type="button"
            onClick={handleNext}
            disabled={loadingMarket || importing || !canContinue()}
            className="create-strategy-primary-btn"
            style={{ background: theme.blue, color: '#fff', opacity: loadingMarket || importing || !canContinue() ? 0.55 : 1 }}
          >
            {importing ? 'Importing…' : step === 2 && templateId === 'broker-import' ? 'Import legs' : step === 2 ? 'Continue to legs' : 'Continue'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="create-strategy-primary-btn"
            style={{ background: theme.green || '#16a34a', color: '#fff', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Saving…' : `Save to ${saveTarget === 'active' ? 'Active' : 'Watchlist'}`}
          </button>
        )}
      </div>
    </div>
  );
}

export default CreateStrategyWizard;
