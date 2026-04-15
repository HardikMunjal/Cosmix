import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useTheme, ThemePicker } from '../lib/ThemePicker';
import { applyTheme } from '../lib/themes';

const FORMULA_BLEND_WEIGHTS = {
  blackScholes: 0.35,
  binomialCrr: 0.35,
  bachelier: 0.15,
  monteCarlo: 0.15,
};

const WHAT_IF_STEP = 50;
const WHAT_IF_STEPS_EACH_SIDE = 10;
const LEG_QUANTITY_OPTIONS = Array.from({ length: 10 }, (_, index) => String(index + 1));
const TRANSACTION_COST_PER_ORDER = 30;

function normalizePremium(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function getPricingSourceLabel(value = 'blend') {
  const labels = {
    blend: 'Formula Blend',
    blackScholes: 'Black-Scholes',
    binomialCrr: 'Binomial CRR',
    bachelier: 'Bachelier',
    monteCarlo: 'Monte Carlo GBM',
    intrinsic: 'Intrinsic Only',
    live: 'Live / Chain',
  };
  return labels[value] || 'Formula Blend';
}

function resolveExpectedOptionPrice(contract, pricingSource = 'blend') {
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

function buildExpectedPricingUrl(strategy) {
  const params = new URLSearchParams({
    symbol: 'NIFTY',
    strikeGap: '50',
    strikeLevels: '40',
    expiryCount: '1',
  });
  if (strategy?.selectedExpiry) params.set('expiries', String(strategy.selectedExpiry));
  if (strategy?.rateInput) params.set('rate', String(strategy.rateInput));
  if (strategy?.savedAtSpot) params.set('spot', String(Number(strategy.savedAtSpot).toFixed(2)));
  return `/api/options-expected-price?${params.toString()}`;
}

function buildWhatIfBaseSpot(spot) {
  const numericSpot = Number(spot) || 0;
  return Math.max(0, Math.round(numericSpot / WHAT_IF_STEP) * WHAT_IF_STEP);
}

function buildWhatIfSpots(spot) {
  const baseSpot = buildWhatIfBaseSpot(spot);
  return Array.from({ length: (WHAT_IF_STEPS_EACH_SIDE * 2) + 1 }, (_, index) => {
    const offset = (index - WHAT_IF_STEPS_EACH_SIDE) * WHAT_IF_STEP;
    return Math.max(0, baseSpot + offset);
  });
}

function buildWhatIfPricingUrl(strategy, referenceSpot) {
  const params = new URLSearchParams({
    symbol: 'NIFTY',
    strikeGap: '50',
    strikeLevels: '1',
    expiryCount: '1',
    spot: String(Number(referenceSpot || 0).toFixed(2)),
    scenarioSpots: buildWhatIfSpots(referenceSpot).join(','),
    strikes: [...new Set((strategy?.legs || []).map((leg) => Number(leg.strike)).filter((strike) => Number.isFinite(strike) && strike > 0))].join(','),
  });
  if (strategy?.selectedExpiry) params.set('expiries', String(strategy.selectedExpiry));
  if (strategy?.rateInput) params.set('rate', String(strategy.rateInput));
  return `/api/options-expected-price?${params.toString()}`;
}

function buildLegCatalog(chainMap = { CE: {}, PE: {} }, currentSpot = 0, legs = []) {
  const referenceSpot = buildWhatIfBaseSpot(currentSpot || 0);
  const fallbackStrikes = buildWhatIfSpots(referenceSpot);
  const legStrikes = new Set((legs || []).map((leg) => Number(leg.strike)).filter((strike) => Number.isFinite(strike) && strike > 0));

  return ['CE', 'PE'].reduce((catalog, optionType) => {
    const sourceEntries = Object.entries(chainMap?.[optionType] || {})
      .map(([strike, premium]) => ({ strike: Number(strike), premium: Number(premium) }))
      .filter((entry) => Number.isFinite(entry.strike) && entry.strike > 0 && Number.isFinite(entry.premium));

    const nearbyEntries = sourceEntries.filter((entry) => Math.abs(entry.strike - referenceSpot) <= 600 || legStrikes.has(entry.strike));
    const merged = new Map();

    [...(nearbyEntries.length >= 8 ? nearbyEntries : sourceEntries), ...fallbackStrikes.map((strike) => ({ strike, premium: null })), ...Array.from(legStrikes).map((strike) => ({ strike, premium: chainMap?.[optionType]?.[strike] ?? null }))]
      .forEach((entry) => {
        if (!Number.isFinite(entry.strike) || entry.strike <= 0) return;
        const previous = merged.get(entry.strike);
        merged.set(entry.strike, {
          strike: entry.strike,
          premium: entry.premium == null ? previous?.premium ?? null : normalizePremium(entry.premium),
        });
      });

    catalog[optionType] = Array.from(merged.values()).sort((left, right) => left.strike - right.strike);
    return catalog;
  }, { CE: [], PE: [] });
}

function getLegCatalogOptions(strategy, optionType = 'CE') {
  return strategy?.legCatalog?.[optionType] || [];
}

function getLegCatalogOption(strategy, optionType = 'CE', strike) {
  return getLegCatalogOptions(strategy, optionType).find((entry) => String(entry.strike) === String(strike)) || null;
}

function buildLegEditorDraft(strategy, leg = null) {
  const optionType = leg?.optionType || 'CE';
  const options = getLegCatalogOptions(strategy, optionType);
  const fallbackOption = options[0] || null;
  const strike = leg?.strike ?? fallbackOption?.strike ?? '';
  const selectedOption = getLegCatalogOption(strategy, optionType, strike) || fallbackOption;
  const marketPremium = selectedOption?.premium ?? Number(leg?.marketPremium ?? leg?.premium ?? 0);
  const entryPremium = Number(leg?.premium ?? marketPremium ?? 0);

  return {
    strategyId: strategy.id,
    legId: leg?.id ?? null,
    side: leg?.side || 'SELL',
    optionType,
    strike: strike ? String(strike) : '',
    premium: entryPremium ? String(normalizePremium(entryPremium).toFixed(2)) : '',
    marketPremium: marketPremium ? String(normalizePremium(marketPremium).toFixed(2)) : '',
    quantity: String(Math.max(1, parseInt(leg?.quantity || 1, 10) || 1)),
  };
}

function calculateTransactionCost(transactions = []) {
  return (transactions || []).length * TRANSACTION_COST_PER_ORDER;
}

function optionIntrinsic(optionType, strike, spot) {
  if (optionType === 'CE') return Math.max(spot - strike, 0);
  return Math.max(strike - spot, 0);
}

function legPayoffAtExpiry(leg, spot) {
  const quantity = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
  const intrinsic = optionIntrinsic(leg.optionType, Number(leg.strike), spot);
  const entryPremium = Number(leg.premium) || 0;
  const premiumEffect = leg.side === 'SELL' ? entryPremium : -entryPremium;
  const intrinsicEffect = leg.side === 'SELL' ? -intrinsic : intrinsic;
  return (premiumEffect + intrinsicEffect) * quantity;
}

function syncLegsWithChain(legs = [], chainMap = { CE: {}, PE: {} }) {
  return legs.map((leg) => {
    const latest = chainMap?.[leg.optionType]?.[Number(leg.strike)];
    return {
      ...leg,
      quantity: Math.max(1, parseInt(leg.quantity || 1, 10) || 1),
      marketPremium: latest == null ? normalizePremium(leg.marketPremium ?? leg.premium) : normalizePremium(latest),
    };
  });
}

function computeProjectedScenarioValues(legs = [], lotSize = 1, scenarioContracts = [], pricingSource = 'blend', baseSpot = 0) {
  return scenarioContracts.map((scenario) => {
    const contractLookup = new Map(
      (scenario.contracts || []).map((contract) => [`${contract.type}:${Number(contract.strike)}`, resolveExpectedOptionPrice(contract, pricingSource)]),
    );

    const projectedCloseValue = legs.reduce((sum, leg) => {
      const quantity = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
      const projectedPremium = contractLookup.get(`${leg.optionType}:${Number(leg.strike)}`) ?? normalizePremium(leg.marketPremium ?? leg.premium);
      return sum + ((leg.side === 'BUY' ? projectedPremium : -projectedPremium) * quantity);
    }, 0) * lotSize;

    const projectedMtm = legs.reduce((sum, leg) => {
      const quantity = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
      const entryPremium = Number(leg.premium) || 0;
      const projectedPremium = contractLookup.get(`${leg.optionType}:${Number(leg.strike)}`) ?? normalizePremium(leg.marketPremium ?? leg.premium);
      return sum + ((leg.side === 'SELL' ? entryPremium - projectedPremium : projectedPremium - entryPremium) * quantity);
    }, 0) * lotSize;

    return {
      spot: Number(Number(scenario.spot || 0).toFixed(2)),
      offset: Number((Number(scenario.spot || 0) - Number(baseSpot || 0)).toFixed(2)),
      value: Number(projectedMtm.toFixed(2)),
      closeValue: Number(projectedCloseValue.toFixed(2)),
      isCurrent: Number(scenario.spot) === Number(baseSpot),
    };
  });
}

function computeStrategyMetrics(legs = [], lotSize = 1, spotPrice = 0) {
  if (!legs.length) {
    return {
      points: [],
      scenarios: [],
      maxProfit: 0,
      maxLoss: 0,
      currentPayoff: 0,
      entryNetPremium: 0,
      liveCloseValue: 0,
      premiumRemaining: 0,
      capturedPremium: 0,
      markToMarket: 0,
      breakEvens: [],
      profitRange: 'None',
      lossRange: 'None',
      minY: 0,
      maxY: 0,
    };
  }

  const sortedStrikes = [...new Set(legs.map((leg) => Number(leg.strike) || 0))].sort((left, right) => left - right);
  const lower = sortedStrikes[0] || Math.max(spotPrice - 2000, 0);
  const upper = sortedStrikes[sortedStrikes.length - 1] || (spotPrice + 2000);
  const start = Math.max(Math.min(lower - 2000, spotPrice - 2200), 0);
  const end = Math.max(upper + 2000, spotPrice + 2200);
  const step = Math.max(Math.round((end - start) / 40), 50);

  const points = [];
  for (let spot = start; spot <= end; spot += step) {
    const perUnitPayoff = legs.reduce((sum, leg) => sum + legPayoffAtExpiry(leg, spot), 0);
    points.push({ spot, value: Number((perUnitPayoff * lotSize).toFixed(2)) });
  }

  const values = points.map((point) => point.value);
  const maxProfit = Math.max(...values);
  const maxLoss = Math.min(...values);
  const currentPayoff = legs.reduce((sum, leg) => sum + legPayoffAtExpiry(leg, spotPrice), 0) * lotSize;
  const entryNetPremium = legs.reduce((sum, leg) => {
    const qty = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
    return sum + ((leg.side === 'SELL' ? Number(leg.premium) || 0 : -(Number(leg.premium) || 0)) * qty);
  }, 0) * lotSize;
  const liveCloseValue = legs.reduce((sum, leg) => {
    const qty = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
    const marketPremium = Number(leg.marketPremium ?? leg.premium) || 0;
    return sum + ((leg.side === 'BUY' ? marketPremium : -marketPremium) * qty);
  }, 0) * lotSize;
  const premiumRemaining = legs.reduce((sum, leg) => {
    const qty = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
    const marketPremium = Number(leg.marketPremium ?? leg.premium) || 0;
    return sum + ((leg.side === 'SELL' ? marketPremium : 0) * qty);
  }, 0) * lotSize;
  const premiumSoldAtEntry = legs.reduce((sum, leg) => {
    const qty = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
    return sum + ((leg.side === 'SELL' ? Number(leg.premium) || 0 : 0) * qty);
  }, 0) * lotSize;
  const capturedPremium = premiumSoldAtEntry - premiumRemaining;
  const markToMarket = legs.reduce((sum, leg) => {
    const qty = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
    const marketPremium = Number(leg.marketPremium ?? leg.premium) || 0;
    const entryPremium = Number(leg.premium) || 0;
    return sum + ((leg.side === 'SELL' ? entryPremium - marketPremium : marketPremium - entryPremium) * qty);
  }, 0) * lotSize;

  const breakEvens = [];
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const cur = points[index];
    if ((prev.value <= 0 && cur.value >= 0) || (prev.value >= 0 && cur.value <= 0)) {
      const ratio = Math.abs(prev.value) / (Math.abs(prev.value) + Math.abs(cur.value));
      breakEvens.push(Math.round(prev.spot + ratio * (cur.spot - prev.spot)));
    }
  }

  const profitZones = [];
  const lossZones = [];
  let zoneStart = null;
  let zoneType = null;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const currentType = point.value >= 0 ? 'profit' : 'loss';
    if (zoneType === null) {
      zoneStart = point.spot;
      zoneType = currentType;
    } else if (currentType !== zoneType) {
      const prev = points[index - 1];
      const ratio = Math.abs(prev.value) / (Math.abs(prev.value) + Math.abs(point.value));
      const boundary = Math.round(prev.spot + ratio * (point.spot - prev.spot));
      const zone = { from: zoneStart, to: boundary };
      if (zoneType === 'profit') profitZones.push(zone);
      else lossZones.push(zone);
      zoneStart = boundary;
      zoneType = currentType;
    }
  }
  if (zoneType && points.length) {
    const zone = { from: zoneStart, to: points[points.length - 1].spot };
    if (zoneType === 'profit') profitZones.push(zone);
    else lossZones.push(zone);
  }

  const scenarioOffsets = [-2000, -1000, -500, 0, 500, 1000, 2000];
  const scenarios = scenarioOffsets.map((offset) => {
    const spot = Math.max(0, Math.round((spotPrice || 0) + offset));
    const pnl = legs.reduce((sum, leg) => sum + legPayoffAtExpiry(leg, spot), 0) * lotSize;
    return { offset, spot, value: Number(pnl.toFixed(2)) };
  });

  return {
    points,
    scenarios,
    maxProfit,
    maxLoss,
    currentPayoff: Number(currentPayoff.toFixed(2)),
    entryNetPremium: Number(entryNetPremium.toFixed(2)),
    liveCloseValue: Number(liveCloseValue.toFixed(2)),
    premiumRemaining: Number(premiumRemaining.toFixed(2)),
    capturedPremium: Number(capturedPremium.toFixed(2)),
    markToMarket: Number(markToMarket.toFixed(2)),
    breakEvens,
    profitRange: profitZones.length ? profitZones.map((zone) => `${zone.from}–${zone.to}`).join(', ') : 'None',
    lossRange: lossZones.length ? lossZones.map((zone) => `${zone.from}–${zone.to}`).join(', ') : 'None',
    minY: Math.min(...values),
    maxY: Math.max(...values),
  };
}

function formatCurrency(value) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getTickerAppearance(key, theme) {
  const palette = {
    NIFTY50: {
      border: '#0f766e',
      background: 'linear-gradient(135deg, rgba(15,118,110,0.22), rgba(8,47,73,0.82))',
      glow: 'rgba(45,212,191,0.18)',
      accent: '#5eead4',
      price: '#ecfeff',
    },
    BANKNIFTY: {
      border: '#1d4ed8',
      background: 'linear-gradient(135deg, rgba(29,78,216,0.22), rgba(30,41,59,0.88))',
      glow: 'rgba(96,165,250,0.18)',
      accent: '#93c5fd',
      price: '#eff6ff',
    },
    SENSEX: {
      border: '#7c3aed',
      background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(30,27,75,0.88))',
      glow: 'rgba(167,139,250,0.18)',
      accent: '#c4b5fd',
      price: '#f5f3ff',
    },
    INDIAVIX: {
      border: '#ea580c',
      background: 'linear-gradient(135deg, rgba(234,88,12,0.22), rgba(67,20,7,0.9))',
      glow: 'rgba(251,146,60,0.18)',
      accent: '#fdba74',
      price: '#fff7ed',
    },
    DOWFUT: {
      border: '#be123c',
      background: 'linear-gradient(135deg, rgba(190,18,60,0.2), rgba(69,10,10,0.88))',
      glow: 'rgba(251,113,133,0.18)',
      accent: '#fda4af',
      price: '#fff1f2',
    },
    SP500FUT: {
      border: '#2563eb',
      background: 'linear-gradient(135deg, rgba(37,99,235,0.18), rgba(15,23,42,0.9))',
      glow: 'rgba(96,165,250,0.18)',
      accent: '#bfdbfe',
      price: '#eff6ff',
    },
    HANGSENG: {
      border: '#059669',
      background: 'linear-gradient(135deg, rgba(5,150,105,0.2), rgba(6,44,37,0.9))',
      glow: 'rgba(52,211,153,0.18)',
      accent: '#86efac',
      price: '#ecfdf5',
    },
    NIKKEI: {
      border: '#d97706',
      background: 'linear-gradient(135deg, rgba(217,119,6,0.2), rgba(69,26,3,0.9))',
      glow: 'rgba(251,191,36,0.18)',
      accent: '#fde68a',
      price: '#fffbeb',
    },
    DAX: {
      border: '#0891b2',
      background: 'linear-gradient(135deg, rgba(8,145,178,0.2), rgba(8,47,73,0.9))',
      glow: 'rgba(103,232,249,0.18)',
      accent: '#a5f3fc',
      price: '#ecfeff',
    },
    FTSE: {
      border: '#65a30d',
      background: 'linear-gradient(135deg, rgba(101,163,13,0.22), rgba(26,46,5,0.92))',
      glow: 'rgba(190,242,100,0.18)',
      accent: '#d9f99d',
      price: '#f7fee7',
    },
  };

  return palette[key] || {
    border: theme.cardBorder,
    background: '#0f172a',
    glow: 'rgba(148,163,184,0.14)',
    accent: theme.textSecondary,
    price: theme.textPrimary,
  };
}

function analyzeStrategy(strategy, metrics, t) {
  // t = theme tokens (optional, defaults to dark hex codes)
  const _green = t?.green || '#22c55e';
  const _red = t?.red || '#ef4444';
  const _yellow = t?.yellow || '#eab308';
  const _orange = t?.orange || '#f97316';
  const _blue = t?.blue || '#3b82f6';
  const closedLegs = strategy.closedLegs || [];
  const lotSize = Number(strategy.lotSize) || 65;
  const legs = strategy.legs || [];
  const realizedPL = closedLegs.reduce((sum, cl) => sum + (Number(cl.pnl) || 0), 0);
  const unrealizedPL = Number(metrics.markToMarket) || 0;
  const totalPL = realizedPL + unrealizedPL;

  const maxLoss = Math.abs(metrics.maxLoss);
  const currentLoss = unrealizedPL < 0 ? Math.abs(unrealizedPL) : 0;
  const riskConsumed = maxLoss > 0 ? Math.min(100, (currentLoss / maxLoss) * 100) : 0;

  const maxProfit = metrics.maxProfit;
  const currentProfit = unrealizedPL > 0 ? unrealizedPL : 0;
  const profitCaptured = maxProfit > 0 ? Math.min(100, (currentProfit / maxProfit) * 100) : 0;

  const entryNet = Math.abs(metrics.entryNetPremium) || 1;
  const premiumLeft = Number(metrics.premiumRemaining) || 0;
  const premiumDecayPct = metrics.entryNetPremium > 0
    ? Math.min(100, ((metrics.entryNetPremium - premiumLeft) / entryNet) * 100)
    : 0;

  const legBreakdown = legs.map((leg) => {
    const qty = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
    const entry = Number(leg.premium) || 0;
    const current = Number(leg.marketPremium ?? leg.premium) || 0;
    const legMtm = leg.side === 'SELL'
      ? (entry - current) * qty * lotSize
      : (current - entry) * qty * lotSize;
    return { ...leg, entry, current, legMtm, qty };
  });

  // ── Deep Risk Metrics ──
  const spotPrice = Number(strategy.currentSpot) || Number(strategy.savedAtSpot) || 0;
  const entrySpot = Number(strategy.savedAtSpot) || spotPrice;
  const spotMove = spotPrice - entrySpot;
  const spotMovePct = entrySpot > 0 ? ((spotMove / entrySpot) * 100) : 0;

  // Capital at risk = total premium paid for BUY legs + margin for SELL legs (approx)
  const buyPremiumPaid = legs.reduce((sum, l) => {
    const qty = Math.max(1, parseInt(l.quantity || 1, 10) || 1);
    return sum + (l.side === 'BUY' ? (Number(l.premium) || 0) * qty * lotSize : 0);
  }, 0);
  const sellPremiumReceived = legs.reduce((sum, l) => {
    const qty = Math.max(1, parseInt(l.quantity || 1, 10) || 1);
    return sum + (l.side === 'SELL' ? (Number(l.premium) || 0) * qty * lotSize : 0);
  }, 0);
  const netCapitalDeployed = buyPremiumPaid - sellPremiumReceived;
  const returnOnCapital = netCapitalDeployed > 0 ? ((totalPL / netCapitalDeployed) * 100) : (totalPL !== 0 ? 100 : 0);

  // Break-even distance from current spot
  const nearestBE = (metrics.breakEvens || []).length > 0
    ? metrics.breakEvens.reduce((closest, be) => Math.abs(be - spotPrice) < Math.abs(closest - spotPrice) ? be : closest, metrics.breakEvens[0])
    : null;
  const beDistance = nearestBE != null ? spotPrice - nearestBE : null;
  const beDistancePct = (nearestBE && nearestBE > 0) ? ((beDistance / nearestBE) * 100) : null;

  // Risk-reward ratio
  const riskReward = maxLoss > 0 ? (maxProfit / maxLoss) : (maxProfit > 0 ? Infinity : 0);

  // Position Greeks approximation
  const sellCount = legs.filter((l) => l.side === 'SELL').length;
  const buyCount = legs.filter((l) => l.side === 'BUY').length;
  const isNaked = sellCount > 0 && buyCount === 0;
  const isHedged = sellCount > 0 && buyCount > 0;
  const isLongOnly = buyCount > 0 && sellCount === 0;

  // Position type classification
  let positionType = 'Mixed';
  if (isNaked) positionType = '⚠️ Naked Sell';
  else if (isLongOnly) positionType = '🛡️ Long Only';
  else if (isHedged) positionType = '🔒 Hedged Spread';

  // Risk score (0-100, higher = more dangerous)
  let riskScore = 0;
  riskScore += riskConsumed * 0.35; // weight: current loss vs max loss
  riskScore += (isNaked ? 30 : isHedged ? 5 : 15); // naked positions are dangerous
  riskScore += Math.min(20, Math.abs(spotMovePct) * 2); // large spot moves increase risk
  if (premiumDecayPct < 30 && metrics.entryNetPremium > 0) riskScore += 5; // early in trade, more theta risk
  if (riskReward < 1 && riskReward > 0) riskScore += 10; // unfavorable R:R
  riskScore = Math.min(100, Math.max(0, riskScore));

  let riskLevel, riskColor;
  if (riskScore >= 70) { riskLevel = 'HIGH'; riskColor = _red; }
  else if (riskScore >= 40) { riskLevel = 'MEDIUM'; riskColor = _yellow; }
  else { riskLevel = 'LOW'; riskColor = _green; }

  let recommendation, reason, color;
  if (profitCaptured >= 80) {
    recommendation = '🟢 EXIT — Book Profits';
    reason = `${profitCaptured.toFixed(0)}% of max profit captured. Consider closing to lock in gains.`;
    color = _green;
  } else if (profitCaptured >= 50) {
    recommendation = '🟡 TRAIL — Protect Gains';
    reason = `${profitCaptured.toFixed(0)}% profit captured. Trail stop or close partial position.`;
    color = _yellow;
  } else if (riskConsumed >= 70) {
    recommendation = '🔴 HEDGE / EXIT — High Risk';
    reason = `${riskConsumed.toFixed(0)}% of max loss consumed. Add hedge or exit now.`;
    color = _red;
  } else if (riskConsumed >= 40) {
    recommendation = '🟠 WATCH — Rising Risk';
    reason = `${riskConsumed.toFixed(0)}% risk consumed. Monitor closely, prepare hedge.`;
    color = _orange;
  } else if (unrealizedPL >= 0) {
    recommendation = '🟢 HOLD — In Profit';
    reason = 'Position is profitable with manageable risk. Continue holding.';
    color = _green;
  } else {
    recommendation = '🔵 HOLD — Within Limits';
    reason = 'Loss is within acceptable range. Hold and monitor.';
    color = _blue;
  }

  const suggestions = [];
  if (profitCaptured >= 60 && profitCaptured < 80) {
    suggestions.push('Close winning legs and roll to new strikes for fresh premium');
  }
  if (riskConsumed >= 50) {
    const hasHedge = legs.some((l) => l.side === 'BUY');
    if (!hasHedge) suggestions.push('Add a protective BUY leg to cap further downside');
  }
  if (premiumDecayPct >= 70 && metrics.entryNetPremium > 0) {
    suggestions.push('Most time value decayed — premium sellers should consider exiting');
  }
  if (closedLegs.length > 0 && legs.length > 0) {
    suggestions.push(`${closedLegs.length} leg(s) already closed. Review if remaining legs still make sense standalone.`);
  }
  if (isNaked) {
    suggestions.push('⚠️ Position has naked SELL legs — unlimited risk. Add BUY hedge to limit downside.');
  }
  if (beDistance != null && Math.abs(beDistance) < spotPrice * 0.01) {
    suggestions.push('⚡ Spot is very close to break-even. Small moves can flip P/L quickly.');
  }
  if (riskReward < 1 && riskReward > 0 && unrealizedPL <= 0) {
    suggestions.push('Risk-reward is unfavorable (< 1:1). Consider restructuring the position.');
  }
  if (returnOnCapital < -30) {
    suggestions.push('💸 Return on capital below -30%. Cut the loss or hedge aggressively.');
  }

  return {
    realizedPL, unrealizedPL, totalPL,
    riskConsumed, profitCaptured, premiumDecayPct,
    premiumLeft, legBreakdown,
    recommendation, reason, color,
    suggestions, closedLegsCount: closedLegs.length,
    // new deep risk fields
    riskScore, riskLevel, riskColor,
    positionType, riskReward,
    returnOnCapital, netCapitalDeployed,
    buyPremiumPaid, sellPremiumReceived,
    nearestBE, beDistance, beDistancePct,
    spotMove, spotMovePct,
  };
}

function AxisPayoffChart({ points, minY, maxY, currentSpot, theme: t, styles }) {
  if (!points?.length) return <div style={styles.emptyChart}>No chart data</div>;

  const W = 400, H = 220;
  const pad = { left: 60, right: 16, top: 16, bottom: 36 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;
  const minSpot = points[0].spot;
  const maxSpot = points[points.length - 1].spot;
  const xRange = maxSpot - minSpot || 1;
  const yMin = Math.min(minY, 0);
  const yMax = Math.max(maxY, 0);
  const yRange = yMax - yMin || 1;
  const xForSpot = (s) => pad.left + ((s - minSpot) / xRange) * cw;
  const yForValue = (v) => pad.top + ch - ((v - yMin) / yRange) * ch;
  const zeroY = yForValue(0);
  const spotX = xForSpot(currentSpot);

  const profitPath = points.map((p, i) => {
    const x = xForSpot(p.spot); const y = yForValue(Math.max(p.value, 0));
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ') + ` L${xForSpot(maxSpot)},${zeroY} L${xForSpot(minSpot)},${zeroY} Z`;
  const lossPath = points.map((p, i) => {
    const x = xForSpot(p.spot); const y = yForValue(Math.min(p.value, 0));
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ') + ` L${xForSpot(maxSpot)},${zeroY} L${xForSpot(minSpot)},${zeroY} Z`;
  const polyline = points.map((p) => `${xForSpot(p.spot)},${yForValue(p.value)}`).join(' ');

  const fmt = (v) => Math.abs(v) >= 100000 ? `${(v / 1000).toFixed(0)}k` : v.toLocaleString('en-IN');
  const yTickCount = 5;
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => Math.round(yMin + (yRange * i / yTickCount)));
  const xTickCount = 5;
  const xTicks = Array.from({ length: xTickCount + 1 }, (_, i) => Math.round(minSpot + (xRange * i / xTickCount)));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 'auto', maxHeight: '260px', display: 'block' }}>
      <defs>
        <clipPath id="chartArea"><rect x={pad.left} y={pad.top} width={cw} height={ch} /></clipPath>
      </defs>
      {/* grid */}
      {yTicks.map((v) => <line key={`yg${v}`} x1={pad.left} y1={yForValue(v)} x2={W - pad.right} y2={yForValue(v)} stroke="rgba(148,163,184,0.12)" />)}
      {xTicks.map((s) => <line key={`xg${s}`} x1={xForSpot(s)} y1={pad.top} x2={xForSpot(s)} y2={H - pad.bottom} stroke="rgba(148,163,184,0.08)" />)}
      {/* fills */}
      <path d={profitPath} fill="rgba(34,197,94,0.15)" clipPath="url(#chartArea)" />
      <path d={lossPath} fill="rgba(248,113,113,0.15)" clipPath="url(#chartArea)" />
      {/* zero + spot */}
      <line x1={pad.left} y1={zeroY} x2={W - pad.right} y2={zeroY} stroke={t.textMuted} strokeDasharray="6 4" />
      <line x1={spotX} y1={pad.top} x2={spotX} y2={H - pad.bottom} stroke={t.cyan} strokeDasharray="6 3" />
      {/* curve */}
      <polyline fill="none" stroke={t.green} strokeWidth="2" points={polyline} clipPath="url(#chartArea)" />
      {/* Y axis */}
      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={H - pad.bottom} stroke={t.textMuted} />
      {yTicks.map((v) => <text key={`yl${v}`} x={pad.left - 6} y={yForValue(v) + 4} fontSize="11" fill={t.textSecondary} textAnchor="end" fontFamily="monospace">{fmt(v)}</text>)}
      {/* X axis */}
      <line x1={pad.left} y1={H - pad.bottom} x2={W - pad.right} y2={H - pad.bottom} stroke={t.textMuted} />
      {xTicks.map((s) => <text key={`xl${s}`} x={xForSpot(s)} y={H - pad.bottom + 16} fontSize="11" fill={t.textSecondary} textAnchor="middle" fontFamily="monospace">{s.toLocaleString('en-IN')}</text>)}
      {/* spot label */}
      <text x={spotX} y={H - pad.bottom + 30} fontSize="10" fill={t.cyan} textAnchor="middle" fontFamily="monospace">Spot {Math.round(currentSpot).toLocaleString('en-IN')}</text>
      {/* axis labels */}
      <text x={8} y={pad.top + ch / 2} fontSize="10" fill={t.textMuted} textAnchor="middle" fontFamily="monospace" transform={`rotate(-90,8,${pad.top + ch / 2})`}>P/L (₹)</text>
    </svg>
  );
}

function ScenarioBarChart({ scenarios = [], styles, theme: t }) {
  if (!scenarios.length) return <div style={styles.emptyChart}>No scenario data</div>;

  const W = 400, H = 220;
  const pad = { left: 60, right: 16, top: 20, bottom: 36 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;
  const maxAbs = Math.max(...scenarios.map((e) => Math.abs(e.value)), 1);
  const barW = cw / scenarios.length - 6;
  const zeroY = pad.top + ch / 2;
  const halfH = ch / 2;
  const fmt = (v) => Math.abs(v) >= 100000 ? `${(v / 1000).toFixed(0)}k` : v.toLocaleString('en-IN');
  const showDenseLabels = scenarios.length <= 11;
  const middleIndex = Math.floor(scenarios.length / 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 'auto', maxHeight: '260px', display: 'block' }}>
      <line x1={pad.left} y1={zeroY} x2={W - pad.right} y2={zeroY} stroke={t.textMuted} strokeDasharray="6 4" />
      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={H - pad.bottom} stroke={t.textMuted} />
      <text x={pad.left - 6} y={pad.top + 4} fontSize="10" fill={t.textSecondary} textAnchor="end" fontFamily="monospace">{fmt(Math.round(maxAbs))}</text>
      <text x={pad.left - 6} y={zeroY + 4} fontSize="10" fill={t.textSecondary} textAnchor="end" fontFamily="monospace">0</text>
      <text x={pad.left - 6} y={H - pad.bottom} fontSize="10" fill={t.textSecondary} textAnchor="end" fontFamily="monospace">{fmt(-Math.round(maxAbs))}</text>
      {scenarios.map((entry, i) => {
        const barH = Math.max(4, (Math.abs(entry.value) / maxAbs) * halfH);
        const x = pad.left + 4 + i * (barW + 6);
        const y = entry.value >= 0 ? zeroY - barH : zeroY;
        const showValueLabel = showDenseLabels || entry.isCurrent || i === 0 || i === scenarios.length - 1 || i === middleIndex;
        const showAxisLabel = showDenseLabels || entry.isCurrent || i % 2 === 0 || i === scenarios.length - 1;
        return (
          <g key={`${entry.spot}-${entry.offset}`}>
            <rect x={x} y={y} width={barW} height={barH} rx="3" fill={entry.value >= 0 ? t.green : t.red} opacity={entry.isCurrent ? 1 : 0.9}>
              <title>{`${entry.offset >= 0 ? '+' : ''}${entry.offset} pts • Spot ${entry.spot} • MTM ${formatCurrency(entry.value)} • Close ${formatCurrency(entry.closeValue)}`}</title>
            </rect>
            {showValueLabel ? (
              <text x={x + barW / 2} y={entry.value >= 0 ? y - 4 : y + barH + 12} fontSize="9" textAnchor="middle" fill={entry.value >= 0 ? t.green : t.red} fontFamily="monospace">{fmt(Math.round(entry.value))}</text>
            ) : null}
            {showAxisLabel ? (
              <text x={x + barW / 2} y={H - pad.bottom + 16} fontSize="10" textAnchor="middle" fill={entry.isCurrent ? t.cyan : t.textSecondary} fontFamily="monospace">{Math.round(entry.spot)}</text>
            ) : null}
          </g>
        );
      })}
      <text x={pad.left + cw / 2} y={H - 4} fontSize="10" textAnchor="middle" fill={t.textMuted} fontFamily="monospace">What-if Nifty Spot</text>
    </svg>
  );
}

function WhatIfScenarioGrid({ scenarios = [], styles, theme: t }) {
  if (!scenarios.length) return <div style={styles.emptyChart}>No what-if values available</div>;

  return (
    <div style={styles.whatIfGrid}>
      {scenarios.map((scenario) => (
        <div
          key={`what-if-${scenario.spot}-${scenario.offset}`}
          style={{
            ...styles.whatIfCard,
            borderColor: scenario.isCurrent ? t.cyan : styles.whatIfCard.borderColor,
            background: scenario.isCurrent ? `${t.cyan}12` : styles.whatIfCard.background,
          }}
        >
          <div style={styles.whatIfTopRow}>
            <div style={styles.whatIfSpot}>Nifty {Math.round(scenario.spot).toLocaleString('en-IN')}</div>
            <div style={{ ...styles.whatIfOffset, color: scenario.offset > 0 ? t.green : scenario.offset < 0 ? t.red : t.cyan }}>
              {scenario.offset > 0 ? '+' : ''}{Math.round(scenario.offset)}
            </div>
          </div>
          <div style={styles.whatIfLabel}>Projected MTM</div>
          <div style={{ ...styles.whatIfValue, color: scenario.value >= 0 ? t.green : t.red }}>
            {formatCurrency(scenario.value)}
          </div>
          <div style={styles.whatIfSubLabel}>Close value {formatCurrency(scenario.closeValue)}</div>
        </div>
      ))}
    </div>
  );
}

function LegEditor({ draft, strategy, styles, theme: t, title, onFieldChange, onSave, onCancel }) {
  const strikeOptions = getLegCatalogOptions(strategy, draft.optionType);
  const selectedOption = getLegCatalogOption(strategy, draft.optionType, draft.strike);

  return (
    <div style={styles.legEditor} className="nifty-leg-editor">
      <div style={styles.legEditorHeaderRow}>
        <div>
          <div style={styles.legEditorTitle}>{title}</div>
          <div style={styles.legEditorHint}>Choose from live strikes, then adjust the entry premium only if your fill was different.</div>
        </div>
        <div style={styles.legEditorSpot}>Spot {Math.round(Number(strategy.currentSpot || strategy.savedAtSpot || 0)).toLocaleString('en-IN')}</div>
      </div>
      <div style={styles.legEditorRow} className="nifty-leg-editor-row">
        <select value={draft.side} onChange={(e) => onFieldChange({ side: e.target.value })} style={styles.addLegSelect}>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>
        <select value={draft.optionType} onChange={(e) => onFieldChange({ optionType: e.target.value })} style={styles.addLegSelect}>
          <option value="CE">CE</option>
          <option value="PE">PE</option>
        </select>
        <select value={draft.strike} onChange={(e) => onFieldChange({ strike: e.target.value })} style={{ ...styles.addLegSelect, minWidth: '190px' }}>
          {strikeOptions.map((entry) => (
            <option key={`${draft.optionType}-${entry.strike}`} value={entry.strike}>
              {entry.strike} {entry.premium != null ? `• Live ${entry.premium.toFixed(2)}` : '• No live premium'}
            </option>
          ))}
        </select>
        <select value={draft.quantity} onChange={(e) => onFieldChange({ quantity: e.target.value })} style={styles.addLegSelect}>
          {LEG_QUANTITY_OPTIONS.map((qty) => <option key={qty} value={qty}>{qty} lot</option>)}
        </select>
        <input
          type="number"
          step="0.05"
          value={draft.premium}
          onChange={(e) => onFieldChange({ premium: e.target.value })}
          style={{ ...styles.addLegInput, width: '110px' }}
          placeholder="Entry"
        />
      </div>
      <div style={styles.legEditorMeta}>
        <span>Live premium: <strong>{selectedOption?.premium != null ? selectedOption.premium.toFixed(2) : '—'}</strong></span>
        <span>Current value: <strong>{draft.marketPremium || draft.premium || '—'}</strong></span>
      </div>
      <div style={styles.addLegActions}>
        <button onClick={onSave} style={styles.closeLegConfirm}>{draft.legId != null ? 'Save Leg' : 'Add Leg'}</button>
        <button onClick={onCancel} style={styles.closeLegCancel}>Cancel</button>
      </div>
    </div>
  );
}

function summarizeClosedStrategy(strategy) {
  const closedLegs = strategy.closedLegs || [];
  const transactions = [...(strategy.transactions || [])].sort((left, right) => new Date(left.timestamp || 0).getTime() - new Date(right.timestamp || 0).getTime());
  const grossRealizedPL = closedLegs.reduce((sum, leg) => sum + (Number(leg.pnl) || 0), 0);
  const transactionCost = calculateTransactionCost(transactions);
  const realizedPL = grossRealizedPL - transactionCost;
  const wins = closedLegs.filter((leg) => Number(leg.pnl) >= 0).length;
  const losses = Math.max(0, closedLegs.length - wins);
  const bestLeg = closedLegs.reduce((best, leg) => ((best == null || Number(leg.pnl) > Number(best.pnl)) ? leg : best), null);
  const worstLeg = closedLegs.reduce((worst, leg) => ((worst == null || Number(leg.pnl) < Number(worst.pnl)) ? leg : worst), null);
  const cumulativeTransactions = [];
  let runningTotal = 0;

  transactions.forEach((tx, index) => {
    runningTotal += (Number(tx.amount) || 0) - TRANSACTION_COST_PER_ORDER;
    cumulativeTransactions.push({
      label: tx.type || `Tx ${index + 1}`,
      value: Number(runningTotal.toFixed(2)),
      amount: Number((Number(tx.amount) || 0).toFixed(2)),
      cost: TRANSACTION_COST_PER_ORDER,
      timestamp: tx.timestamp,
    });
  });

  return {
    grossRealizedPL: Number(grossRealizedPL.toFixed(2)),
    transactionCost: Number(transactionCost.toFixed(2)),
    realizedPL: Number(realizedPL.toFixed(2)),
    wins,
    losses,
    bestLeg,
    worstLeg,
    legBars: closedLegs.map((leg, index) => ({
      label: `${leg.optionType} ${leg.strike}`,
      subtitle: `${leg.side} ${leg.quantity}L`,
      value: Number((Number(leg.pnl) || 0).toFixed(2)),
      key: `${leg.legId || index}-${leg.strike}`,
    })),
    cumulativeTransactions,
    transactions,
  };
}

function ClosedLegPnLChart({ items = [], styles, theme: t }) {
  if (!items.length) return <div style={styles.emptyChart}>No closed-leg P/L available</div>;

  const scale = Math.max(...items.map((item) => Math.abs(item.value)), 1);
  return (
    <div style={styles.closedBars}>
      {items.map((item) => {
        const width = `${Math.max(8, (Math.abs(item.value) / scale) * 100)}%`;
        const positive = item.value >= 0;
        return (
          <div key={item.key} style={styles.closedBarRow}>
            <div style={styles.closedBarLabelWrap}>
              <div style={styles.closedBarLabel}>{item.label}</div>
              <div style={styles.closedBarSub}>{item.subtitle}</div>
            </div>
            <div style={styles.closedBarTrack}>
              <div style={{ ...styles.closedBarFill, width, background: positive ? t.green : t.red }} />
            </div>
            <div style={{ ...styles.closedBarValue, color: positive ? t.green : t.red }}>{formatCurrency(item.value)}</div>
          </div>
        );
      })}
    </div>
  );
}

function ClosedCumulativeChart({ items = [], styles, theme: t }) {
  if (!items.length) return <div style={styles.emptyChart}>No transaction flow available</div>;

  const W = 400, H = 220;
  const pad = { left: 44, right: 14, top: 16, bottom: 34 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;
  const minY = Math.min(0, ...items.map((item) => item.value));
  const maxY = Math.max(0, ...items.map((item) => item.value));
  const yRange = maxY - minY || 1;
  const xFor = (index) => pad.left + ((items.length === 1 ? 0 : index / (items.length - 1)) * cw);
  const yFor = (value) => pad.top + ch - (((value - minY) / yRange) * ch);
  const polyline = items.map((item, index) => `${xFor(index)},${yFor(item.value)}`).join(' ');
  const zeroY = yFor(0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 'auto', maxHeight: '240px', display: 'block' }}>
      <line x1={pad.left} y1={zeroY} x2={W - pad.right} y2={zeroY} stroke={t.textMuted} strokeDasharray="6 4" />
      <polyline fill="none" stroke={items[items.length - 1].value >= 0 ? t.green : t.red} strokeWidth="2.5" points={polyline} />
      {items.map((item, index) => (
        <g key={`${item.label}-${index}`}>
          <circle cx={xFor(index)} cy={yFor(item.value)} r="3.5" fill={item.value >= 0 ? t.green : t.red}>
            <title>{`${item.label}: ${formatCurrency(item.amount)} | Running ${formatCurrency(item.value)}`}</title>
          </circle>
          <text x={xFor(index)} y={H - 10} fontSize="9" fill={t.textSecondary} textAnchor="middle" fontFamily="monospace">{index + 1}</text>
        </g>
      ))}
      <text x={pad.left - 6} y={pad.top + 4} fontSize="10" fill={t.textSecondary} textAnchor="end" fontFamily="monospace">{Math.round(maxY).toLocaleString('en-IN')}</text>
      <text x={pad.left - 6} y={zeroY + 4} fontSize="10" fill={t.textSecondary} textAnchor="end" fontFamily="monospace">0</text>
      <text x={pad.left - 6} y={H - pad.bottom + 4} fontSize="10" fill={t.textSecondary} textAnchor="end" fontFamily="monospace">{Math.round(minY).toLocaleString('en-IN')}</text>
      <text x={pad.left + cw / 2} y={H - 2} fontSize="10" fill={t.textMuted} textAnchor="middle" fontFamily="monospace">Transaction sequence</text>
    </svg>
  );
}

function ClosedStrategyPanel({ strategy, styles, theme: t }) {
  const summary = summarizeClosedStrategy(strategy);

  return (
    <>
      <div style={{ ...styles.closedHero, borderColor: summary.realizedPL >= 0 ? t.greenDim : t.redDim, background: summary.realizedPL >= 0 ? `${t.green}12` : `${t.red}12` }}>
        <div>
          <div style={styles.closedHeroLabel}>Closed Strategy Net Profit</div>
          <div style={{ ...styles.closedHeroValue, color: summary.realizedPL >= 0 ? t.green : t.red }}>
            {summary.realizedPL >= 0 ? '+' : ''}{formatCurrency(summary.realizedPL)}
          </div>
        </div>
        <div style={styles.closedHeroStats}>
          <div><span style={styles.closedHeroKey}>Closed legs:</span> <strong>{summary.legBars.length}</strong></div>
          <div><span style={styles.closedHeroKey}>Wins / Losses:</span> <strong>{summary.wins} / {summary.losses}</strong></div>
          <div><span style={styles.closedHeroKey}>Transactions:</span> <strong>{summary.transactions.length}</strong></div>
        </div>
      </div>

      <div style={styles.metricsGrid} className="nifty-metrics-grid">
        <div style={styles.metricBox}><div style={styles.metricLabel}>Gross Profit</div><div style={{ ...styles.metricValue, color: summary.grossRealizedPL >= 0 ? t.green : t.red }}>{formatCurrency(summary.grossRealizedPL)}</div></div>
        <div style={styles.metricBox}><div style={styles.metricLabel}>Transaction Cost</div><div style={{ ...styles.metricValue, color: t.red }}>{formatCurrency(summary.transactionCost)}</div><div style={styles.metricSub}>{summary.transactions.length} × {formatCurrency(TRANSACTION_COST_PER_ORDER)}</div></div>
        <div style={styles.metricBox}><div style={styles.metricLabel}>Net Profit</div><div style={{ ...styles.metricValue, color: summary.realizedPL >= 0 ? t.green : t.red }}>{formatCurrency(summary.realizedPL)}</div></div>
        <div style={styles.metricBox}><div style={styles.metricLabel}>Closed At Spot</div><div style={styles.metricValue}>{formatCurrency(strategy.currentSpot || strategy.savedAtSpot)}</div></div>
        <div style={styles.metricBox}><div style={styles.metricLabel}>Best Leg</div><div style={{ ...styles.metricValue, color: t.green, fontSize: '14px' }}>{summary.bestLeg ? `${summary.bestLeg.optionType} ${summary.bestLeg.strike}` : '—'}</div><div style={styles.metricSub}>{summary.bestLeg ? formatCurrency(summary.bestLeg.pnl) : 'No data'}</div></div>
        <div style={styles.metricBox}><div style={styles.metricLabel}>Worst Leg</div><div style={{ ...styles.metricValue, color: t.red, fontSize: '14px' }}>{summary.worstLeg ? `${summary.worstLeg.optionType} ${summary.worstLeg.strike}` : '—'}</div><div style={styles.metricSub}>{summary.worstLeg ? formatCurrency(summary.worstLeg.pnl) : 'No data'}</div></div>
      </div>

      {(strategy.transactions || []).length > 0 && (
        <details style={styles.txDetails} open>
          <summary style={styles.txSummary}>Transactions ({strategy.transactions.length})</summary>
          <div style={styles.txList}>
            {strategy.transactions.map((tx, idx) => (
              <div key={idx} style={styles.txRow} className="nifty-tx-row">
                <span style={styles.txType}>{tx.type}</span>
                <span style={styles.txDesc}>{tx.description}</span>
                <span style={{ ...styles.txAmount, color: (tx.amount || 0) >= 0 ? t.green : t.red }} className="nifty-tx-amount">
                  {formatCurrency(tx.amount || 0)}
                </span>
                <span style={styles.txTime}>{new Date(tx.timestamp).toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}

function PremiumBars({ metrics, styles, theme: t }) {
  const items = [
    { label: 'Entry net', value: metrics.entryNetPremium, color: t.blue },
    { label: 'Close value', value: metrics.liveCloseValue, color: t.purple },
    { label: 'Captured', value: metrics.capturedPremium, color: t.green },
    { label: 'Live MTM', value: metrics.markToMarket, color: metrics.markToMarket >= 0 ? t.green : t.red },
  ];
  const scale = Math.max(...items.map((item) => Math.abs(Number(item.value) || 0)), 1);

  return (
    <div style={styles.premiumList}>
      {items.map((item) => {
        const width = `${Math.max(6, (Math.abs(Number(item.value) || 0) / scale) * 100)}%`;
        return (
          <div key={item.label} style={styles.premiumRow} className="nifty-premium-row" title={`${item.label}: ${formatCurrency(item.value)}`}>
            <div style={styles.premiumLabel}>{item.label}</div>
            <div style={styles.premiumTrack}>
              <div style={{ ...styles.premiumFill, width, background: item.color }} />
            </div>
            <div style={{ ...styles.premiumValue, color: item.color }}>{formatCurrency(item.value)}</div>
          </div>
        );
      })}
    </div>
  );
}

function RangeBandChart({ metrics, currentSpot, styles }) {
  const points = metrics.points || [];
  if (!points.length) return <div style={styles.emptyChart}>No range data</div>;

  const start = points[0].spot;
  const end = points[points.length - 1].spot;
  const totalRange = end - start || 1;
  const leftPct = (value) => Math.max(0, Math.min(100, ((Number(value) - start) / totalRange) * 100));

  const parseZones = (value) => {
    if (!value || value === 'None') return [];
    return value.split(',').map((part) => {
      const [from, to] = part.trim().split('–').map((item) => Number(item));
      return Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null;
    }).filter(Boolean);
  };

  const profitZones = parseZones(metrics.profitRange);
  const lossZones = parseZones(metrics.lossRange);

  return (
    <div>
      <div style={styles.rangeWrap}>
        <div style={styles.rangeTrack} />
        {lossZones.map((zone, index) => (
          <div
            key={`loss-${zone.from}-${zone.to}-${index}`}
            style={{
              ...styles.rangeSeg,
              left: `${leftPct(zone.from)}%`,
              width: `${Math.max(2, leftPct(zone.to) - leftPct(zone.from))}%`,
              background: '#b91c1c',
            }}
            title={`Loss zone ${zone.from} to ${zone.to}`}
          />
        ))}
        {profitZones.map((zone, index) => (
          <div
            key={`profit-${zone.from}-${zone.to}-${index}`}
            style={{
              ...styles.rangeSeg,
              left: `${leftPct(zone.from)}%`,
              width: `${Math.max(2, leftPct(zone.to) - leftPct(zone.from))}%`,
              background: '#15803d',
            }}
            title={`Profit zone ${zone.from} to ${zone.to}`}
          />
        ))}
        <div style={{ ...styles.rangeMarker, left: `${leftPct(currentSpot)}%` }} title={`Current spot ${Math.round(currentSpot)}`} />
      </div>
      <div style={styles.rangeAxis}>
        <span>{start}</span>
        <span>Spot {Math.round(currentSpot)}</span>
        <span>{end}</span>
      </div>
    </div>
  );
}

function StrategyAnalyzer({ strategy, metrics, styles, theme: t }) {
  const analysis = analyzeStrategy(strategy, metrics, t);
  return (
    <div style={styles.analyzerWrap}>
      {/* ── Risk Score Banner ── */}
      <div style={{ ...styles.riskBanner, borderColor: analysis.riskColor, background: `${analysis.riskColor}10` }}>
        <div style={styles.riskBannerLeft}>
          <div style={{ ...styles.riskScoreCircle, borderColor: analysis.riskColor, color: analysis.riskColor }}>
            {analysis.riskScore.toFixed(0)}
          </div>
          <div>
            <div style={{ ...styles.riskLevelLabel, color: analysis.riskColor }}>
              Risk: {analysis.riskLevel}
            </div>
            <div style={styles.riskPosType}>{analysis.positionType}</div>
          </div>
        </div>
        <div style={{ ...styles.analyzerRec, color: analysis.color, borderColor: analysis.color }}>
          {analysis.recommendation}
        </div>
      </div>
      <div style={styles.analyzerReason}>{analysis.reason}</div>

      {/* ── P/L Cards ── */}
      <div style={styles.analyzerGrid} className="nifty-analyzer-grid">
        <div style={{ ...styles.analyzerCard, borderLeft: `3px solid ${analysis.unrealizedPL >= 0 ? t.green : t.red}` }}>
          <div style={styles.analyzerLabel}>Unrealized P/L</div>
          <div style={{ ...styles.analyzerValue, color: analysis.unrealizedPL >= 0 ? t.green : t.red }}>
            {formatCurrency(analysis.unrealizedPL)}
          </div>
        </div>
        <div style={{ ...styles.analyzerCard, borderLeft: `3px solid ${analysis.realizedPL >= 0 ? t.green : t.red}` }}>
          <div style={styles.analyzerLabel}>Realized P/L</div>
          <div style={{ ...styles.analyzerValue, color: analysis.realizedPL >= 0 ? t.green : t.red }}>
            {formatCurrency(analysis.realizedPL)}
          </div>
        </div>
        <div style={{ ...styles.analyzerCard, borderLeft: `3px solid ${analysis.totalPL >= 0 ? t.green : t.red}`, background: `${analysis.totalPL >= 0 ? t.green : t.red}08` }}>
          <div style={styles.analyzerLabel}>Total P/L</div>
          <div style={{ ...styles.analyzerValue, color: analysis.totalPL >= 0 ? t.green : t.red, fontSize: '18px' }}>
            {formatCurrency(analysis.totalPL)}
          </div>
        </div>
        <div style={{ ...styles.analyzerCard, borderLeft: `3px solid ${t.purple}` }}>
          <div style={styles.analyzerLabel}>Premium Left</div>
          <div style={styles.analyzerValue}>{formatCurrency(analysis.premiumLeft)}</div>
          <div style={styles.analyzerSub}>{(analysis.premiumLeft / (Number(strategy.lotSize) || 65)).toFixed(2)} pts × {Number(strategy.lotSize) || 65} lot</div>
        </div>
      </div>

      {/* ── Deep Risk Metrics ── */}
      <div style={styles.analyzerGrid} className="nifty-analyzer-grid">
        <div style={{ ...styles.analyzerCard, borderLeft: `3px solid ${t.yellow}` }}>
          <div style={styles.analyzerLabel}>Risk : Reward</div>
          <div style={{ ...styles.analyzerValue, color: analysis.riskReward >= 1 ? t.green : t.yellow }}>
            {analysis.riskReward === Infinity ? '∞' : `1 : ${analysis.riskReward.toFixed(2)}`}
          </div>
        </div>
        <div style={{ ...styles.analyzerCard, borderLeft: `3px solid ${analysis.returnOnCapital >= 0 ? t.green : t.red}` }}>
          <div style={styles.analyzerLabel}>Return on Capital</div>
          <div style={{ ...styles.analyzerValue, color: analysis.returnOnCapital >= 0 ? t.green : t.red }}>
            {analysis.returnOnCapital >= 0 ? '+' : ''}{analysis.returnOnCapital.toFixed(1)}%
          </div>
          <div style={styles.analyzerSub}>Capital: {formatCurrency(Math.abs(analysis.netCapitalDeployed))}</div>
        </div>
        <div style={{ ...styles.analyzerCard, borderLeft: `3px solid ${t.cyan}` }}>
          <div style={styles.analyzerLabel}>Nearest Break-even</div>
          <div style={styles.analyzerValue}>{analysis.nearestBE != null ? analysis.nearestBE.toLocaleString('en-IN') : '—'}</div>
          {analysis.beDistance != null && (
            <div style={{ ...styles.analyzerSub, color: analysis.beDistance > 0 ? t.green : t.red }}>
              {analysis.beDistance > 0 ? '▲' : '▼'} {Math.abs(analysis.beDistance).toFixed(0)} pts ({analysis.beDistancePct > 0 ? '+' : ''}{analysis.beDistancePct.toFixed(2)}%)
            </div>
          )}
        </div>
        <div style={{ ...styles.analyzerCard, borderLeft: `3px solid ${analysis.spotMovePct >= 0 ? t.green : t.red}` }}>
          <div style={styles.analyzerLabel}>Spot Move Since Entry</div>
          <div style={{ ...styles.analyzerValue, color: analysis.spotMovePct >= 0 ? t.green : t.red }}>
            {analysis.spotMove >= 0 ? '+' : ''}{analysis.spotMove.toFixed(0)}
          </div>
          <div style={styles.analyzerSub}>{analysis.spotMovePct >= 0 ? '+' : ''}{analysis.spotMovePct.toFixed(2)}%</div>
        </div>
      </div>

      {/* ── Gauge Bars ── */}
      <div style={styles.analyzerGrid} className="nifty-analyzer-grid">
        <div style={styles.analyzerCard}>
          <div style={styles.analyzerLabel}>Risk Consumed</div>
          <div style={styles.gaugeWrap}>
            <div style={{ ...styles.gaugeBar, width: `${Math.min(analysis.riskConsumed, 100)}%`, background: analysis.riskConsumed >= 70 ? t.red : analysis.riskConsumed >= 40 ? t.orange : t.green }} />
          </div>
          <div style={{ ...styles.analyzerSub, color: analysis.riskConsumed >= 70 ? t.red : t.textSecondary }}>
            {analysis.riskConsumed.toFixed(1)}% of max loss ({formatCurrency(Math.abs(metrics.maxLoss))})
          </div>
        </div>
        <div style={styles.analyzerCard}>
          <div style={styles.analyzerLabel}>Profit Captured</div>
          <div style={styles.gaugeWrap}>
            <div style={{ ...styles.gaugeBar, width: `${Math.min(analysis.profitCaptured, 100)}%`, background: t.green }} />
          </div>
          <div style={styles.analyzerSub}>{analysis.profitCaptured.toFixed(1)}% of max profit ({formatCurrency(metrics.maxProfit)})</div>
        </div>
        <div style={styles.analyzerCard}>
          <div style={styles.analyzerLabel}>Premium Decay</div>
          <div style={styles.gaugeWrap}>
            <div style={{ ...styles.gaugeBar, width: `${Math.min(Math.max(analysis.premiumDecayPct, 0), 100)}%`, background: t.purple }} />
          </div>
          <div style={styles.analyzerSub}>{analysis.premiumDecayPct.toFixed(1)}% time value decayed</div>
        </div>
      </div>

      <div style={styles.analyzerSection}>
        <div style={styles.analyzerSubTitle}>Per-Leg P/L</div>
        <div style={styles.legBreakdownTable}>
          {analysis.legBreakdown.map((leg) => (
            <div key={`lb-${leg.id}-${leg.strike}`} style={styles.legBreakdownRow} className="nifty-leg-breakdown">
              <span style={styles.legBreakdownLabel}>
                {leg.side} {leg.qty}L {leg.optionType} {leg.strike}
              </span>
              <span style={styles.legBreakdownPrices} className="nifty-leg-prices">
                Entry: {leg.entry.toFixed(2)} → Now: {leg.current.toFixed(2)}
              </span>
              <span style={{ ...styles.legBreakdownPL, color: leg.legMtm >= 0 ? t.green : t.red }} className="nifty-leg-pl">
                {leg.legMtm >= 0 ? '+' : ''}{formatCurrency(leg.legMtm)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {(strategy.closedLegs || []).length > 0 && (
        <div style={styles.analyzerSection}>
          <div style={styles.analyzerSubTitle}>Closed Positions ({strategy.closedLegs.length})</div>
          <div style={styles.legBreakdownTable}>
            {strategy.closedLegs.map((cl, idx) => (
              <div key={`cl-${idx}`} style={styles.legBreakdownRow} className="nifty-leg-breakdown">
                <span style={styles.legBreakdownLabel}>
                  {cl.side} {cl.quantity}L {cl.optionType} {cl.strike}
                </span>
                <span style={styles.legBreakdownPrices} className="nifty-leg-prices">
                  {cl.entryPremium.toFixed(2)} → {cl.exitPremium.toFixed(2)}
                </span>
                <span style={{ ...styles.legBreakdownPL, color: cl.pnl >= 0 ? t.green : t.red }} className="nifty-leg-pl">
                  {cl.pnl >= 0 ? '+' : ''}{formatCurrency(cl.pnl)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {analysis.suggestions.length > 0 && (
        <div style={styles.analyzerSection}>
          <div style={styles.analyzerSubTitle}>💡 Suggestions</div>
          <ul style={styles.suggestionList}>
            {analysis.suggestions.map((s, i) => <li key={i} style={styles.suggestionItem}>{s}</li>)}
          </ul>
        </div>
      )}

      {(strategy.transactions || []).length > 0 && (
        <details style={styles.txDetails}>
          <summary style={styles.txSummary}>📋 Transaction History ({strategy.transactions.length})</summary>
          <div style={styles.txList}>
            {strategy.transactions.map((tx, idx) => (
              <div key={idx} style={styles.txRow} className="nifty-tx-row">
                <span style={styles.txType}>{tx.type}</span>
                <span style={styles.txDesc}>{tx.description}</span>
                <span style={{ ...styles.txAmount, color: (tx.amount || 0) >= 0 ? t.green : t.red }} className="nifty-tx-amount">
                  {formatCurrency(tx.amount || 0)}
                </span>
                <span style={styles.txTime}>{new Date(tx.timestamp).toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function formatLeg(leg) {
  const qty = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
  return `${leg.side} ${qty} lot${qty > 1 ? 's' : ''} ${leg.optionType} ${leg.strike} @ ${Number(leg.premium || 0).toFixed(2)}`;
}

export default function NiftyStrategiesPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [savedStrategies, setSavedStrategies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [marketIndices, setMarketIndices] = useState([]);
  const { theme, themeId, setTheme } = useTheme();
  const styles = useMemo(() => applyTheme(darkStyles, themeId, theme), [themeId]);

  const enrichStrategies = useCallback(async (baseStrategies = []) => {
    if (!baseStrategies.length) return [];

    return Promise.all(baseStrategies.map(async (strategy) => {
      const pricingSource = strategy.pricingSource || 'blend';
      let currentSpot = Number(strategy.savedAtSpot || 0);
      let liveSource = strategy.liveSource || 'saved';
      let chainMap = { CE: {}, PE: {} };
      let whatIfScenarios = [];
      let whatIfBaseSpot = buildWhatIfBaseSpot(currentSpot);

      try {
        const formulaResponse = await fetch(buildExpectedPricingUrl(strategy));
        const formulaData = await formulaResponse.json();
        if (!formulaResponse.ok) {
          throw new Error(formulaData.error || 'Unable to load formula prices.');
        }

        currentSpot = Number(formulaData.referenceSpot || formulaData.liveSpot || currentSpot || 0);
        liveSource = `${getPricingSourceLabel(pricingSource)} / expected formulas`;
        (formulaData.contracts || []).forEach((contract) => {
          if (!chainMap[contract.type]) return;
          chainMap[contract.type][Number(contract.strike)] = resolveExpectedOptionPrice(contract, pricingSource);
        });

        whatIfBaseSpot = buildWhatIfBaseSpot(currentSpot);
        try {
          const scenarioResponse = await fetch(buildWhatIfPricingUrl(strategy, currentSpot));
          const scenarioData = await scenarioResponse.json();
          if (!scenarioResponse.ok) {
            throw new Error(scenarioData.error || 'Unable to load what-if prices.');
          }
          whatIfScenarios = computeProjectedScenarioValues(
            strategy.legs || [],
            Number(strategy.lotSize) || 65,
            scenarioData.scenarioContracts || [],
            pricingSource,
            whatIfBaseSpot,
          );
        } catch (_) {
          whatIfScenarios = [];
        }
      } catch (_) {
        try {
          const query = strategy?.selectedExpiry ? `?symbol=NIFTY&expiry=${strategy.selectedExpiry}` : '?symbol=NIFTY';
          const response = await fetch(`/api/options-chain${query}`);
          const data = await response.json();
          currentSpot = Number(data.spot || currentSpot || 0);
          liveSource = data.source || liveSource;
          (data.strikes || []).forEach((item) => {
            if (!chainMap[item.type]) return;
            chainMap[item.type][Number(item.strike)] = normalizePremium(item.price || item.lastPrice || item.bid || item.ask || 0);
          });
        } catch (_) {
          chainMap = { CE: {}, PE: {} };
        }
      }

      const liveLegs = syncLegsWithChain(strategy.legs || [], chainMap);
      return {
        ...strategy,
        currentSpot,
        liveSource,
        legCatalog: buildLegCatalog(chainMap, currentSpot, strategy.legs || []),
        whatIfBaseSpot,
        whatIfScenarios,
        liveMetrics: computeStrategyMetrics(liveLegs, Number(strategy.lotSize) || 65, currentSpot),
        legs: liveLegs,
      };
    }));
  }, []);

  const loadSavedStrategies = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/options-strategies');
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to load saved strategies.');
      }
      const enriched = await enrichStrategies(data.strategies || []);
      setSavedStrategies(enriched);
    } catch (loadError) {
      setSavedStrategies([]);
      setError(loadError.message || 'Unable to load saved strategies.');
    } finally {
      setLoading(false);
    }
  }, [enrichStrategies]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.push('/');
      return;
    }
    setUser(JSON.parse(storedUser));
  }, [router]);

  useEffect(() => {
    if (!user) return;
    loadSavedStrategies();
    const interval = setInterval(loadSavedStrategies, 30000);
    return () => clearInterval(interval);
  }, [user, loadSavedStrategies]);

  useEffect(() => {
    const loadIndices = async () => {
      try {
        const res = await fetch('/api/market-indices');
        const data = await res.json();
        if (res.ok) setMarketIndices(data.indices || []);
      } catch (_) {}
    };
    loadIndices();
    const iv = setInterval(loadIndices, 3000);
    return () => clearInterval(iv);
  }, []);

  const deleteSavedStrategy = async (id) => {
    if (!confirm('Delete this saved Nifty options strategy?')) return;
    try {
      const response = await fetch('/api/options-strategies', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to delete strategy.');
      }
      const enriched = await enrichStrategies(data.strategies || []);
      setSavedStrategies(enriched);
    } catch (deleteError) {
      alert(deleteError.message || 'Unable to delete strategy.');
    }
  };

  const [closingLegInfo, setClosingLegInfo] = useState(null);
  const [closePrice, setClosePrice] = useState('');
  const [legEditor, setLegEditor] = useState(null);

  const updateStrategyStatus = async (strategyId, newStatus) => {
    const strategy = savedStrategies.find((s) => s.id === strategyId);
    if (!strategy) return;
    try {
      const response = await fetch('/api/options-strategies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...strategy,
          status: newStatus,
          transactions: [
            ...(strategy.transactions || []),
            { type: newStatus === 'active' ? 'BOUGHT' : 'STATUS', description: `Status → ${newStatus.toUpperCase()}`, amount: 0, timestamp: new Date().toISOString() },
          ],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const enriched = await enrichStrategies(data.strategies || []);
      setSavedStrategies(enriched);
    } catch (e) { alert(e.message); }
  };

  const closeLeg = async (strategyId, legId, exitPrice) => {
    const strategy = savedStrategies.find((s) => s.id === strategyId);
    if (!strategy) return;
    const leg = (strategy.legs || []).find((l) => l.id === legId);
    if (!leg) return;
    const qty = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
    const entry = Number(leg.premium) || 0;
    const exit = Number(exitPrice) || 0;
    const lotSize = Number(strategy.lotSize) || 65;
    const pnl = leg.side === 'SELL'
      ? (entry - exit) * qty * lotSize
      : (exit - entry) * qty * lotSize;
    const closedLeg = {
      legId: leg.id, side: leg.side, optionType: leg.optionType, strike: leg.strike,
      quantity: qty, entryPremium: entry, exitPremium: exit, pnl,
      closedAt: new Date().toISOString(),
    };
    const remainingLegs = strategy.legs.filter((l) => l.id !== legId);
    const transaction = {
      type: 'CLOSE',
      description: `Closed ${leg.side} ${qty}L ${leg.optionType} ${leg.strike} @ ${exit.toFixed(2)} → P/L ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`,
      amount: pnl,
      timestamp: new Date().toISOString(),
    };
    try {
      const payload = {
        ...strategy,
        legs: remainingLegs,
        closedLegs: [...(strategy.closedLegs || []), closedLeg],
        transactions: [...(strategy.transactions || []), transaction],
      };
      if (!remainingLegs.length) payload.status = 'closed';
      const response = await fetch('/api/options-strategies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const enriched = await enrichStrategies(data.strategies || []);
      setSavedStrategies(enriched);
      setClosingLegInfo(null);
      setClosePrice('');
    } catch (e) { alert(e.message); }
  };

  const openLegEditor = (strategy, leg = null) => {
    setClosingLegInfo(null);
    setClosePrice('');
    setLegEditor(buildLegEditorDraft(strategy, leg));
  };

  const updateLegEditor = (strategy, patch) => {
    setLegEditor((current) => {
      if (!current || current.strategyId !== strategy.id) return current;

      let next = { ...current, ...patch };

      if (patch.optionType != null) {
        const options = getLegCatalogOptions(strategy, patch.optionType);
        if (!options.some((entry) => String(entry.strike) === String(next.strike))) {
          next.strike = options[0] ? String(options[0].strike) : '';
        }
      }

      if (patch.optionType != null || patch.strike != null) {
        const selectedOption = getLegCatalogOption(strategy, next.optionType, next.strike);
        const selectedPremium = selectedOption?.premium;
        next.marketPremium = selectedPremium != null ? String(selectedPremium.toFixed(2)) : '';
        next.premium = selectedPremium != null ? String(selectedPremium.toFixed(2)) : next.premium;
      }

      return next;
    });
  };

  const saveLegEditor = async (strategyId) => {
    const strategy = savedStrategies.find((s) => s.id === strategyId);
    if (!strategy || !legEditor || legEditor.strategyId !== strategyId) return;

    const strike = Number(legEditor.strike);
    const premium = Number(legEditor.premium);
    const quantity = Math.max(1, parseInt(legEditor.quantity || 1, 10) || 1);
    if (!strike || !premium) { alert('Pick a strike and valid premium'); return; }

    const selectedOption = getLegCatalogOption(strategy, legEditor.optionType, strike);
    const marketPremium = selectedOption?.premium != null ? selectedOption.premium : premium;
    const existingLeg = legEditor.legId != null ? (strategy.legs || []).find((leg) => Number(leg.id) === Number(legEditor.legId)) : null;
    const maxId = Math.max(0, ...(strategy.legs || []).map((leg) => Number(leg.id) || 0));
    const nextLeg = {
      id: existingLeg?.id ?? (maxId + 1),
      side: legEditor.side,
      optionType: legEditor.optionType,
      strike,
      premium: normalizePremium(premium),
      marketPremium: normalizePremium(marketPremium),
      quantity,
      locked: existingLeg?.locked ?? false,
    };

    const updatedLegs = existingLeg
      ? (strategy.legs || []).map((leg) => (Number(leg.id) === Number(existingLeg.id) ? nextLeg : leg))
      : [...(strategy.legs || []), nextLeg];

    const transaction = existingLeg
      ? {
        type: 'EDIT',
        description: `Edited leg ${existingLeg.side} ${Math.max(1, parseInt(existingLeg.quantity || 1, 10) || 1)}L ${existingLeg.optionType} ${existingLeg.strike} → ${nextLeg.side} ${quantity}L ${nextLeg.optionType} ${strike} @ ${nextLeg.premium.toFixed(2)}`,
        amount: 0,
        timestamp: new Date().toISOString(),
      }
      : {
        type: 'ADD',
        description: `Added ${nextLeg.side} ${quantity}L ${nextLeg.optionType} ${strike} @ ${nextLeg.premium.toFixed(2)}`,
        amount: 0,
        timestamp: new Date().toISOString(),
      };

    try {
      const response = await fetch('/api/options-strategies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...strategy,
          legs: updatedLegs,
          transactions: [...(strategy.transactions || []), transaction],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const enriched = await enrichStrategies(data.strategies || []);
      setSavedStrategies(enriched);
      setLegEditor(null);
    } catch (e) { alert(e.message); }
  };

  const totals = useMemo(() => {
    const totalMtm = savedStrategies.reduce((sum, strategy) => sum + Number(strategy.liveMetrics?.markToMarket || 0), 0);
    const profitable = savedStrategies.filter((strategy) => Number(strategy.liveMetrics?.markToMarket || 0) >= 0).length;
    const totalLots = savedStrategies.reduce(
      (sum, strategy) => sum + (strategy.legs || []).reduce((legSum, leg) => legSum + (Math.max(1, parseInt(leg.quantity || 1, 10) || 1)), 0),
      0,
    );
    const activeCount = savedStrategies.filter((s) => s.status === 'active').length;
    const watchingCount = savedStrategies.filter((s) => !s.status || s.status === 'watching').length;
    const closedCount = savedStrategies.filter((s) => s.status === 'closed').length;
    const activeMtm = savedStrategies.filter((s) => s.status === 'active').reduce((sum, s) => sum + Number(s.liveMetrics?.markToMarket || 0), 0);
    const totalRealizedPL = savedStrategies.reduce((sum, s) => sum + (s.closedLegs || []).reduce((cs, cl) => cs + (Number(cl.pnl) || 0), 0), 0);
    return { totalMtm, profitable, totalLots, activeCount, watchingCount, closedCount, activeMtm, totalRealizedPL };
  }, [savedStrategies]);

  const highlightedId = router.query?.saved ? String(router.query.saved) : '';

  if (!user) return <div style={styles.loading}>Loading...</div>;

  return (
    <div style={styles.container} className="nifty-page-container">
      <style>{`
        .mkt-pill { transition: transform 0.15s; }
        .mkt-pill:hover { transform: scale(1.04); }
        details[open] > .nifty-strategy-summary { border-left-color: ${theme.blue} !important; }
        details[open] > .nifty-strategy-summary .expand-chevron { transform: rotate(90deg); }
        details > .nifty-strategy-summary:hover { border-left-color: ${theme.textMuted} !important; }
        details > summary::-webkit-details-marker { display: none; }
        details > summary::marker { content: ''; }
        @media (max-width: 900px) {
          .nifty-graph-grid { grid-template-columns: 1fr !important; }
          .nifty-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .nifty-metrics-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .nifty-analyzer-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .nifty-leg-breakdown { flex-direction: column !important; align-items: flex-start !important; }
          .nifty-leg-prices { text-align: left !important; }
          .nifty-leg-pl { text-align: left !important; min-width: auto !important; }
          .nifty-premium-row { grid-template-columns: 1fr !important; gap: 4px !important; }
          .nifty-tx-row { flex-direction: column !important; align-items: flex-start !important; }
          .nifty-tx-amount { text-align: left !important; }
          .nifty-leg-row { flex-direction: column !important; align-items: flex-start !important; }
          .nifty-leg-toolbar { align-items: flex-start !important; }
        }
        @media (max-width: 640px) {
          .nifty-page-container { padding: 12px !important; }
          .nifty-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 8px !important; }
          .nifty-metrics-grid { grid-template-columns: 1fr !important; }
          .nifty-header { flex-direction: column !important; }
          .nifty-header-actions { width: 100% !important; }
          .nifty-header-actions button { flex: 1 !important; min-height: 44px !important; font-size: 13px !important; }
          .nifty-strategy-summary { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; padding: 12px !important; }
          .nifty-strategy-title { font-size: 15px !important; }
          .nifty-strategy-body { padding: 0 12px 12px !important; }
          .nifty-card-actions { flex-direction: column !important; }
          .nifty-card-actions button { width: 100% !important; min-height: 44px !important; }
          .nifty-analyzer-grid { grid-template-columns: 1fr !important; }
          .nifty-analyzer-header { flex-direction: column !important; align-items: flex-start !important; }
          .nifty-close-form { flex-direction: column !important; align-items: stretch !important; }
          .nifty-close-form input { width: 100% !important; }
          .nifty-close-form button { min-height: 40px !important; }
          .nifty-profit-banner { padding: 12px !important; }
          .nifty-profit-banner > div:first-child { flex-direction: column !important; gap: 8px !important; }
          .nifty-leg-editor { padding: 10px !important; }
          .nifty-leg-editor-row { flex-direction: column !important; }
          .nifty-leg-editor-row select, .nifty-leg-editor-row input { width: 100% !important; }
          .nifty-section-header { font-size: 15px !important; }
          .nifty-page-title { font-size: 22px !important; }
          .nifty-badge { font-size: 11px !important; padding: 4px 8px !important; }
          .nifty-summary-value { font-size: 18px !important; }
          .nifty-info-band { font-size: 11px !important; }
          .market-ticker { gap: 8px !important; }
        }
        @media (max-width: 400px) {
          .nifty-page-container { padding: 8px !important; }
          .nifty-summary-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Global Market Ticker ── */}
      {marketIndices.length > 0 && (
        <div style={styles.tickerStrip} className="market-ticker">
          {marketIndices.map((idx) => {
            const up = idx.change >= 0;
            const palette = getTickerAppearance(idx.key, theme);
            return (
              <div
                key={idx.key}
                className="mkt-pill"
                style={{
                  ...styles.tickerPill,
                  borderColor: palette.border,
                  background: palette.background,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 24px ${palette.glow}`,
                }}
              >
                <div style={styles.tickerFlagWrap}>
                  <span style={styles.tickerFlag}>{idx.flag}</span>
                </div>
                <div style={styles.tickerBody}>
                  <div style={styles.tickerTopRow}>
                    <span style={{ ...styles.tickerName, color: palette.accent }}>{idx.name}</span>
                    <span style={{ ...styles.tickerWindow, color: palette.accent }}>{idx.changeWindow || '1D'}</span>
                  </div>
                  <div style={styles.tickerBottomRow}>
                    <span style={{ ...styles.tickerPrice, color: palette.price }}>
                      {Number(idx.price).toLocaleString('en-IN', { maximumFractionDigits: idx.key === 'INDIAVIX' ? 2 : 0 })}
                    </span>
                    <span style={{ ...styles.tickerDelta, color: up ? theme.green : theme.red }}>
                      {up ? '▲' : '▼'} {Math.abs(idx.changePercent).toFixed(2)}%
                    </span>
                  </div>
                  <div style={{ ...styles.tickerChangeLine, color: up ? theme.green : theme.red }}>
                    {up ? '+' : '-'}{Math.abs(Number(idx.change) || 0).toFixed(idx.key === 'INDIAVIX' ? 2 : 0)} today
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={styles.header} className="nifty-header">
        <div>
          <h1 style={styles.title} className="nifty-page-title">📊 Nifty Strategy Tracker</h1>
          <p style={styles.subtitle}>Saved strategies with live P/L, analyzer, and transaction tracking.</p>
        </div>
        <div style={styles.headerActions} className="nifty-header-actions">
          <ThemePicker theme={theme} themeId={themeId} setTheme={setTheme} />
          <button onClick={loadSavedStrategies} style={styles.secondaryButton}>Refresh</button>
          <button onClick={() => router.push('/options-strategy')} style={styles.primaryButton}>Add / Modify Strategy</button>
          <button onClick={() => router.push('/dashboard')} style={styles.secondaryButton}>Back to Dashboard</button>
        </div>
      </div>

      <div style={styles.summaryGrid} className="nifty-summary-grid">
        <div style={{ ...styles.summaryCard, borderTopColor: theme.green }}>
          <div style={styles.summaryLabel}>Active (Bought)</div>
          <div style={{ ...styles.summaryValue, color: theme.green }} className="nifty-summary-value">{totals.activeCount}</div>
        </div>
        <div style={{ ...styles.summaryCard, borderTopColor: theme.blue }}>
          <div style={styles.summaryLabel}>Watchlist</div>
          <div style={styles.summaryValue} className="nifty-summary-value">{totals.watchingCount}</div>
        </div>
        <div style={{ ...styles.summaryCard, borderTopColor: totals.activeMtm >= 0 ? theme.green : theme.red }}>
          <div style={styles.summaryLabel}>Active MTM</div>
          <div style={{ ...styles.summaryValue, color: totals.activeMtm >= 0 ? theme.green : theme.red }}>{formatCurrency(totals.activeMtm)}</div>
        </div>
        <div style={{ ...styles.summaryCard, borderTopColor: totals.totalRealizedPL >= 0 ? theme.green : theme.red }}>
          <div style={styles.summaryLabel}>Realized P/L</div>
          <div style={{ ...styles.summaryValue, color: totals.totalRealizedPL >= 0 ? theme.green : theme.red }}>{formatCurrency(totals.totalRealizedPL)}</div>
        </div>
        <div style={{ ...styles.summaryCard, borderTopColor: totals.totalMtm >= 0 ? theme.green : theme.red }}>
          <div style={styles.summaryLabel}>Total Live MTM</div>
          <div style={{ ...styles.summaryValue, color: totals.totalMtm >= 0 ? theme.green : theme.red }}>{formatCurrency(totals.totalMtm)}</div>
        </div>
        <div style={{ ...styles.summaryCard, borderTopColor: theme.green }}>
          <div style={styles.summaryLabel}>Profitable</div>
          <div style={{ ...styles.summaryValue, color: theme.green }}>{totals.profitable}</div>
        </div>
        <div style={{ ...styles.summaryCard, borderTopColor: theme.purple }}>
          <div style={styles.summaryLabel}>Total Lots</div>
          <div style={styles.summaryValue}>{totals.totalLots}</div>
        </div>
        <div style={{ ...styles.summaryCard, borderTopColor: theme.textSecondary }}>
          <div style={styles.summaryLabel}>Closed</div>
          <div style={styles.summaryValue}>{totals.closedCount}</div>
        </div>
      </div>

      {loading ? <div style={styles.emptyState}>Loading saved strategies…</div> : null}
      {!loading && error ? <div style={styles.errorText}>{error}</div> : null}
      {!loading && !error && savedStrategies.length === 0 ? (
        <div style={styles.emptyState}>No Nifty options strategy has been saved yet. Open Nifty Options, add legs, and click save.</div>
      ) : null}

      {(() => {
        const activeStrategies = savedStrategies.filter((s) => s.status === 'active');
        const watchingStrategies = savedStrategies.filter((s) => !s.status || s.status === 'watching');
        const closedStrategies = savedStrategies.filter((s) => s.status === 'closed');

        const renderCard = (strategy, defaultOpen) => {
          const metrics = strategy.liveMetrics || computeStrategyMetrics(strategy.legs || [], Number(strategy.lotSize) || 65, Number(strategy.savedAtSpot) || 0);
          const spotMove = Number((Number(strategy.currentSpot || 0) - Number(strategy.savedAtSpot || 0)).toFixed(2));
          const spotMovePct = Number(strategy.savedAtSpot)
            ? Number(((spotMove / Number(strategy.savedAtSpot)) * 100).toFixed(2))
            : 0;
          const isActive = strategy.status === 'active';
          const isClosed = strategy.status === 'closed';
          const statusLabel = isActive ? '✅ BOUGHT' : isClosed ? '🔒 CLOSED' : '👁 WATCHING';
          const statusColor = isActive ? theme.green : isClosed ? theme.textSecondary : theme.blue;

          return (
            <details key={strategy.id} style={{ ...styles.strategyPanel, borderColor: isActive ? theme.greenDim : theme.cardBorder }} open={highlightedId === String(strategy.id) || defaultOpen}>
              <summary style={styles.strategySummary} className="nifty-strategy-summary">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                  <span className="expand-chevron" style={{ fontSize: '18px', color: theme.textMuted, transition: 'transform 0.2s', flexShrink: 0 }}>▶</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={styles.strategyTitle} className="nifty-strategy-title">
                      {strategy.name}
                      <span style={{ ...styles.statusBadge, color: statusColor, borderColor: statusColor }}>{statusLabel}</span>
                    </div>
                    <div style={styles.strategyMeta}>
                      {strategy.expiryLabel || 'No expiry'} · {(strategy.legs || []).length} open legs{(strategy.closedLegs || []).length > 0 ? ` · ${strategy.closedLegs.length} closed` : ''} · {getPricingSourceLabel(strategy.pricingSource || 'blend')}
                    </div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>Click to {'{expand / collapse}'}</div>
                  </div>
                </div>
                <div style={styles.summaryBadges}>
                  <span className="nifty-badge" style={{ ...styles.badge, color: metrics.markToMarket >= 0 ? theme.green : theme.red, borderColor: metrics.markToMarket >= 0 ? theme.greenDim : theme.redDim }}>
                    MTM {formatCurrency(metrics.markToMarket)}
                  </span>
                  <span className="nifty-badge" style={{ ...styles.badge, color: spotMove >= 0 ? theme.green : theme.red, borderColor: theme.cardBorderHover }}>
                    {spotMove >= 0 ? '▲' : '▼'} {formatCurrency(Math.abs(spotMove))}
                  </span>
                </div>
              </summary>

              <div style={styles.strategyBody} className="nifty-strategy-body">
                {isClosed && <ClosedStrategyPanel strategy={strategy} styles={styles} theme={theme} />}

                {!isClosed && (
                  <>
                {/* ── Prominent P/L Banner ── */}
                {isActive && (() => {
                  const analysis = analyzeStrategy(strategy, metrics);
                  return (
                    <div style={{ ...styles.profitBanner, borderColor: analysis.totalPL >= 0 ? theme.greenDim : theme.redDim, background: analysis.totalPL >= 0 ? `${theme.green}14` : `${theme.red}14` }} className="nifty-profit-banner">
                      <div style={styles.profitBannerRow}>
                        <div>
                          <div style={styles.profitBannerLabel}>Current Total P/L</div>
                          <div style={{ ...styles.profitBannerValue, color: analysis.totalPL >= 0 ? theme.green : theme.red }}>
                            {analysis.totalPL >= 0 ? '+' : ''}{formatCurrency(analysis.totalPL)}
                          </div>
                        </div>
                        <div style={styles.profitBannerSplit}>
                          <div><span style={styles.profitBannerSmLabel}>Unrealized:</span> <span style={{ color: analysis.unrealizedPL >= 0 ? theme.green : theme.red, fontWeight: 'bold' }}>{formatCurrency(analysis.unrealizedPL)}</span></div>
                          <div><span style={styles.profitBannerSmLabel}>Realized:</span> <span style={{ color: analysis.realizedPL >= 0 ? theme.green : theme.red, fontWeight: 'bold' }}>{formatCurrency(analysis.realizedPL)}</span></div>
                          <div><span style={styles.profitBannerSmLabel}>Premium Left:</span> <span style={{ color: theme.textPrimary, fontWeight: 'bold' }}>{formatCurrency(analysis.premiumLeft)} ({(analysis.premiumLeft / (Number(strategy.lotSize) || 65)).toFixed(2)} pts)</span></div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {(isActive || isClosed) && (
                  <StrategyAnalyzer strategy={strategy} metrics={metrics} styles={styles} theme={theme} />
                )}

                <div style={styles.metricsGrid} className="nifty-metrics-grid">
                  <div style={styles.metricBox}><div style={styles.metricLabel}>Entry Spot</div><div style={styles.metricValue}>{formatCurrency(strategy.savedAtSpot)}</div></div>
                  <div style={styles.metricBox}><div style={styles.metricLabel}>Live Spot</div><div style={styles.metricValue}>{formatCurrency(strategy.currentSpot)}</div></div>
                  <div style={styles.metricBox}><div style={styles.metricLabel}>Spot Move</div><div style={{ ...styles.metricValue, color: spotMove >= 0 ? theme.green : theme.red }}>{spotMove >= 0 ? '▲' : '▼'} {formatCurrency(Math.abs(spotMove))}</div><div style={styles.metricSub}>{spotMove >= 0 ? '+' : ''}{spotMovePct}% since save</div></div>
                  <div style={styles.metricBox}><div style={styles.metricLabel}>Live MTM</div><div style={{ ...styles.metricValue, color: metrics.markToMarket >= 0 ? theme.green : theme.red }}>{formatCurrency(metrics.markToMarket)}</div></div>
                  <div style={styles.metricBox}><div style={styles.metricLabel}>Current Payoff</div><div style={{ ...styles.metricValue, color: metrics.currentPayoff >= 0 ? theme.green : theme.red }}>{formatCurrency(metrics.currentPayoff)}</div></div>
                  <div style={styles.metricBox}><div style={styles.metricLabel}>Max Profit</div><div style={{ ...styles.metricValue, color: theme.green }}>{formatCurrency(metrics.maxProfit)}</div></div>
                  <div style={styles.metricBox}><div style={styles.metricLabel}>Max Loss</div><div style={{ ...styles.metricValue, color: theme.red }}>{formatCurrency(Math.abs(metrics.maxLoss))}</div></div>
                  <div style={styles.metricBox}><div style={styles.metricLabel}>Lots / Lot Size</div><div style={styles.metricValue}>{(strategy.legs || []).reduce((sum, leg) => sum + (Math.max(1, parseInt(leg.quantity || 1, 10) || 1)), 0)} × {Number(strategy.lotSize) || 65}</div></div>
                </div>

                <div style={styles.infoBand} className="nifty-info-band">
                  <div><strong>Profit Range:</strong> {metrics.profitRange}</div>
                  <div><strong>Loss Range:</strong> {metrics.lossRange}</div>
                  <div><strong>Break-even:</strong> {metrics.breakEvens.length ? metrics.breakEvens.join(', ') : '—'}</div>
                </div>

                <details style={styles.innerExpand} open>
                  <summary style={styles.expandTitle}>Expand graphs</summary>
                  <div style={styles.graphGrid} className="nifty-graph-grid">
                    <div style={styles.graphCard}>
                      <div style={styles.graphTitle}>1. Payoff Curve with X/Y range</div>
                      <AxisPayoffChart points={metrics.points} minY={metrics.minY} maxY={metrics.maxY} currentSpot={strategy.currentSpot} theme={theme} styles={styles} />
                      <div style={styles.graphHint}>Hover over the curve points to see spot and P/L.</div>
                    </div>
                    <div style={styles.graphCard}>
                      <div style={styles.graphTitle}>2. What-If Portfolio Value</div>
                      <ScenarioBarChart scenarios={strategy.whatIfScenarios?.length ? strategy.whatIfScenarios : metrics.scenarios} styles={styles} theme={theme} />
                      <div style={styles.graphHint}>
                        Shows projected portfolio MTM in 50-point steps from {Math.round(strategy.whatIfBaseSpot || strategy.currentSpot || 0).toLocaleString('en-IN')} with 10 downside and 10 upside spots.
                      </div>
                      <WhatIfScenarioGrid scenarios={strategy.whatIfScenarios || []} styles={styles} theme={theme} />
                    </div>
                    <div style={styles.graphCard}>
                      <div style={styles.graphTitle}>3. Profit / Loss Range Map</div>
                      <RangeBandChart metrics={metrics} currentSpot={strategy.currentSpot} styles={styles} />
                      <div style={styles.graphHint}>Green is the profit band, red is the loss band, blue is the live spot.</div>
                    </div>
                    <div style={styles.graphCard}>
                      <div style={styles.graphTitle}>4. Premium Breakdown</div>
                      <PremiumBars metrics={metrics} styles={styles} theme={theme} />
                      <div style={styles.graphHint}>Hover the bars for entry, close, captured, and live MTM values.</div>
                    </div>
                  </div>
                </details>

                <details style={styles.legsPanel}>
                  <summary style={{ ...styles.graphTitle, cursor: 'pointer', userSelect: 'none' }}>Open Legs ({(strategy.legs || []).length}) — click to expand</summary>
                  <div style={styles.legsToolbar} className="nifty-leg-toolbar">
                    <div style={styles.legsToolbarText}>Compact rows with quick add, edit, and close actions.</div>
                    {isActive && (
                      <button onClick={() => openLegEditor(strategy)} style={styles.addLegInlineBtn}>+ Quick Add Leg</button>
                    )}
                  </div>
                  {legEditor?.strategyId === strategy.id && legEditor.legId == null && (
                    <LegEditor
                      draft={legEditor}
                      strategy={strategy}
                      styles={styles}
                      theme={theme}
                      title="Add New Leg"
                      onFieldChange={(patch) => updateLegEditor(strategy, patch)}
                      onSave={() => saveLegEditor(strategy.id)}
                      onCancel={() => setLegEditor(null)}
                    />
                  )}
                  <div style={styles.legsWrap}>
                    {(strategy.legs || []).map((leg) => {
                      const isClosing = closingLegInfo?.strategyId === strategy.id && closingLegInfo?.legId === leg.id;
                      const isEditing = legEditor?.strategyId === strategy.id && Number(legEditor?.legId) === Number(leg.id);
                      const qty = Math.max(1, parseInt(leg.quantity || 1, 10) || 1);
                      const entryP = Number(leg.premium) || 0;
                      const currentP = Number(leg.marketPremium ?? leg.premium) || 0;
                      const lotSz = Number(strategy.lotSize) || 65;
                      const legPL = leg.side === 'SELL' ? (entryP - currentP) * qty * lotSz : (currentP - entryP) * qty * lotSz;
                      const closeAction = leg.side === 'BUY' ? 'Sell at' : 'Buy back at';
                      return (
                        <div key={`${strategy.id}-${leg.id}-${leg.strike}`} style={styles.legCardWrap}>
                          <div style={styles.legCard}>
                            <div style={styles.legCardHeader} className="nifty-leg-row">
                              <div style={styles.legRowMain}>
                                <span style={{ ...styles.legSideBadge, background: leg.side === 'BUY' ? `${theme.blue}20` : `${theme.red}20`, color: leg.side === 'BUY' ? theme.blue : theme.red }}>{leg.side}</span>
                                <span style={styles.legCardStrike}>{qty}L {leg.optionType} {leg.strike}</span>
                                <span style={styles.legCardPrices}>Entry {entryP.toFixed(2)} · Live {currentP.toFixed(2)}</span>
                              </div>
                              <div style={styles.legRowActions}>
                                <span style={{ ...styles.legCardPL, color: legPL >= 0 ? theme.green : theme.red }}>{legPL >= 0 ? '+' : ''}{formatCurrency(legPL)}</span>
                                {isActive && !isClosing && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openLegEditor(strategy, leg); }}
                                    style={styles.legSmallActionBtn}
                                  >Edit</button>
                                )}
                                {isActive && !isClosing && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setLegEditor(null); setClosingLegInfo({ strategyId: strategy.id, legId: leg.id }); setClosePrice(String(currentP.toFixed(2))); }}
                                    style={styles.closeLegInlineBtn}
                                  >{closeAction}</button>
                                )}
                              </div>
                            </div>
                          </div>
                          {isEditing && (
                            <LegEditor
                              draft={legEditor}
                              strategy={strategy}
                              styles={styles}
                              theme={theme}
                              title={`Edit ${leg.optionType} ${leg.strike}`}
                              onFieldChange={(patch) => updateLegEditor(strategy, patch)}
                              onSave={() => saveLegEditor(strategy.id)}
                              onCancel={() => setLegEditor(null)}
                            />
                          )}
                          {isClosing && (
                            <div style={styles.closeLegForm} className="nifty-close-form">
                              <div style={styles.closeLegFormHeader}>{closeAction} — {leg.optionType} {leg.strike}</div>
                              <div style={styles.closeLegFormRow}>
                                <label style={styles.closeLegLabel}>{closeAction}:</label>
                                <input
                                  type="number"
                                  step="0.05"
                                  value={closePrice}
                                  onChange={(e) => setClosePrice(e.target.value)}
                                  style={styles.closeLegInput}
                                  placeholder={`${closeAction} price`}
                                  autoFocus
                                />
                              </div>
                              {closePrice && (() => {
                                const exitP = Number(closePrice) || 0;
                                const previewPL = leg.side === 'SELL' ? (entryP - exitP) * qty * lotSz : (exitP - entryP) * qty * lotSz;
                                return (
                                  <div style={{ ...styles.closeLegPreview, color: previewPL >= 0 ? theme.green : theme.red }}>
                                    P/L: {previewPL >= 0 ? '+' : ''}{formatCurrency(previewPL)}
                                  </div>
                                );
                              })()}
                              <div style={styles.closeLegFormBtns}>
                                <button onClick={() => closeLeg(strategy.id, leg.id, closePrice)} style={styles.closeLegConfirm}>✅ Confirm Close</button>
                                <button onClick={() => { setClosingLegInfo(null); setClosePrice(''); }} style={styles.closeLegCancel}>Cancel</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {(strategy.legs || []).length === 0 && <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 6 }}>All legs closed</div>}
                </details>
                  </>
                )}

                <div style={styles.cardActions} className="nifty-card-actions">
                  {(!strategy.status || strategy.status === 'watching') && (
                    <button onClick={() => updateStrategyStatus(strategy.id, 'active')} style={styles.buyButton}>✅ Mark as Bought</button>
                  )}
                  {isActive && (strategy.legs || []).length > 0 && (
                    <button onClick={() => { if (confirm('Close all remaining legs at current market price?')) updateStrategyStatus(strategy.id, 'closed'); }} style={styles.closeStratBtn}>🔒 Close Strategy</button>
                  )}
                  {isClosed && (
                    <button onClick={() => updateStrategyStatus(strategy.id, 'watching')} style={styles.secondaryButton}>↩ Move to Watchlist</button>
                  )}
                  <button onClick={() => router.push(`/options-strategy?strategyId=${encodeURIComponent(String(strategy.id))}`)} style={styles.primaryButton}>Open Strategy Builder</button>
                  <button onClick={() => deleteSavedStrategy(strategy.id)} style={styles.deleteButton}>Delete</button>
                </div>
              </div>
            </details>
          );
        };

        return (
          <>
            {activeStrategies.length > 0 && (
              <>
                <div style={styles.sectionHeader} className="nifty-section-header">
                  <span style={styles.sectionIcon}>✅</span>
                  <span>Active Positions ({activeStrategies.length})</span>
                </div>
                <div style={styles.strategyStack}>
                  {activeStrategies.map((s) => renderCard(s, false))}
                </div>
              </>
            )}

            {watchingStrategies.length > 0 && (
              <>
                <div style={styles.sectionHeader} className="nifty-section-header">
                  <span style={styles.sectionIcon}>👁</span>
                  <span>Watchlist ({watchingStrategies.length})</span>
                </div>
                <div style={styles.strategyStack}>
                  {watchingStrategies.map((s) => renderCard(s, false))}
                </div>
              </>
            )}

            {closedStrategies.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={styles.sectionHeader}>
                  <span style={styles.sectionIcon}>🔒</span>
                  <span>Closed ({closedStrategies.length})</span>
                </summary>
                <div style={styles.strategyStack}>
                  {closedStrategies.map((s) => renderCard(s, false))}
                </div>
              </details>
            )}
          </>
        );
      })()}
    </div>
  );
}

const darkStyles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #020617, #0f172a)',
    color: '#e2e8f0',
    padding: '24px',
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  },
  loading: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#020617',
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  tickerStrip: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '18px',
  },
  tickerPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    padding: '10px 12px',
    whiteSpace: 'nowrap',
    flex: '1 1 180px',
    minWidth: '180px',
  },
  tickerFlagWrap: {
    width: '34px',
    height: '34px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  tickerFlag: {
    fontSize: '16px',
  },
  tickerBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
    flex: 1,
  },
  tickerTopRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  tickerName: {
    fontSize: '11px',
    color: '#94a3b8',
    fontWeight: '600',
    letterSpacing: '0.3px',
  },
  tickerWindow: {
    fontSize: '10px',
    fontWeight: '800',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  tickerBottomRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '10px',
  },
  tickerPrice: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#f8fafc',
  },
  tickerDelta: {
    fontSize: '11px',
    fontWeight: '700',
  },
  tickerChangeLine: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.02em',
  },
  riskBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
    border: '2px solid',
    borderRadius: '14px',
    padding: '14px 18px',
    marginBottom: '12px',
  },
  riskBannerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  riskScoreCircle: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    border: '3px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    fontWeight: '800',
    background: '#020617',
    flexShrink: 0,
  },
  riskLevelLabel: {
    fontSize: '15px',
    fontWeight: '700',
    letterSpacing: '0.5px',
  },
  riskPosType: {
    fontSize: '12px',
    color: '#94a3b8',
    marginTop: '2px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '18px',
  },
  title: {
    margin: 0,
    fontSize: '28px',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: '13px',
    marginTop: '8px',
    lineHeight: '1.6',
    maxWidth: '760px',
  },
  headerActions: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  primaryButton: {
    background: '#1e293b',
    border: '1px solid #334155',
    color: '#f8fafc',
    borderRadius: '10px',
    padding: '10px 14px',
    cursor: 'pointer',
    fontWeight: '600',
    minHeight: '44px',
    fontSize: '13px',
  },
  secondaryButton: {
    background: '#111827',
    border: '1px solid #334155',
    color: '#e2e8f0',
    borderRadius: '8px',
    padding: '10px 14px',
    cursor: 'pointer',
    minHeight: '44px',
    fontSize: '13px',
  },
  deleteButton: {
    background: '#450a0a',
    border: '1px solid #7f1d1d',
    color: '#fecaca',
    borderRadius: '8px',
    padding: '10px 14px',
    cursor: 'pointer',
    minHeight: '44px',
    fontSize: '13px',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '10px',
    marginBottom: '16px',
  },
  summaryCard: {
    background: 'linear-gradient(135deg, #0f172a, #1e293b40)',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    padding: '14px',
    borderTop: '3px solid #334155',
  },
  summaryLabel: {
    color: '#94a3b8',
    fontSize: '12px',
    marginBottom: '8px',
  },
  summaryValue: {
    color: '#f8fafc',
    fontSize: '24px',
    fontWeight: 'bold',
  },
  emptyState: {
    background: 'rgba(15, 23, 42, 0.88)',
    border: '1px dashed #334155',
    borderRadius: '14px',
    padding: '16px',
    color: '#94a3b8',
    marginBottom: '16px',
  },
  errorText: {
    color: '#fca5a5',
    marginBottom: '16px',
  },
  strategyStack: {
    display: 'grid',
    gap: '14px',
  },
  strategyPanel: {
    background: 'rgba(15, 23, 42, 0.88)',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    overflow: 'hidden',
  },
  strategySummary: {
    listStyle: 'none',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    borderLeft: '4px solid transparent',
    transition: 'border-color 0.2s',
  },
  strategyTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  strategyMeta: {
    fontSize: '12px',
    color: '#94a3b8',
    marginTop: '4px',
  },
  summaryBadges: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 10px',
    borderRadius: '999px',
    border: '1px solid #334155',
    background: '#0f172a',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  strategyBody: {
    padding: '0 16px 16px',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '10px',
    marginBottom: '12px',
  },
  metricBox: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    padding: '12px',
  },
  metricLabel: {
    color: '#94a3b8',
    fontSize: '11px',
    textTransform: 'uppercase',
    marginBottom: '6px',
  },
  metricValue: {
    color: '#f8fafc',
    fontSize: '16px',
    fontWeight: 'bold',
  },
  metricSub: {
    color: '#94a3b8',
    fontSize: '10px',
    marginTop: '4px',
  },
  infoBand: {
    display: 'grid',
    gap: '6px',
    background: '#08111f',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    padding: '12px',
    color: '#cbd5e1',
    fontSize: '12px',
    marginBottom: '12px',
  },
  innerExpand: {
    background: '#08111f',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    padding: '12px',
    marginBottom: '12px',
  },
  expandTitle: {
    cursor: 'pointer',
    fontWeight: 'bold',
    color: '#bfdbfe',
    marginBottom: '10px',
  },
  graphGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '12px',
    marginTop: '12px',
  },
  graphCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    padding: '12px',
  },
  graphTitle: {
    color: '#f8fafc',
    fontSize: '13px',
    fontWeight: 'bold',
    marginBottom: '8px',
  },
  graphHint: {
    color: '#94a3b8',
    fontSize: '11px',
    marginTop: '6px',
    lineHeight: '1.5',
  },
  closedHero: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '14px',
    flexWrap: 'wrap',
    border: '1px solid',
    borderRadius: '14px',
    padding: '16px',
    marginBottom: '14px',
  },
  closedHeroLabel: {
    color: '#94a3b8',
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '6px',
  },
  closedHeroValue: {
    color: '#f8fafc',
    fontSize: '28px',
    fontWeight: '800',
  },
  closedHeroStats: {
    display: 'grid',
    gap: '6px',
    color: '#e2e8f0',
    fontSize: '13px',
  },
  closedHeroKey: {
    color: '#94a3b8',
  },
  closedBars: {
    display: 'grid',
    gap: '10px',
    marginTop: '10px',
  },
  closedBarRow: {
    display: 'grid',
    gridTemplateColumns: '96px 1fr 110px',
    gap: '8px',
    alignItems: 'center',
  },
  closedBarLabelWrap: {
    minWidth: 0,
  },
  closedBarLabel: {
    color: '#f8fafc',
    fontSize: '12px',
    fontWeight: '700',
  },
  closedBarSub: {
    color: '#94a3b8',
    fontSize: '10px',
    marginTop: '2px',
  },
  closedBarTrack: {
    height: '10px',
    borderRadius: '999px',
    background: '#020617',
    overflow: 'hidden',
    border: '1px solid #1e293b',
  },
  closedBarFill: {
    height: '100%',
    borderRadius: '999px',
  },
  closedBarValue: {
    textAlign: 'right',
    fontSize: '11px',
    fontWeight: '700',
  },
  whatIfGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '8px',
    marginTop: '12px',
  },
  whatIfCard: {
    background: '#08111f',
    border: '1px solid #1e293b',
    borderRadius: '10px',
    padding: '10px',
  },
  whatIfTopRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    marginBottom: '8px',
  },
  whatIfSpot: {
    color: '#f8fafc',
    fontSize: '12px',
    fontWeight: '700',
  },
  whatIfOffset: {
    fontSize: '11px',
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  whatIfLabel: {
    color: '#94a3b8',
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginBottom: '4px',
  },
  whatIfValue: {
    color: '#f8fafc',
    fontSize: '16px',
    fontWeight: '700',
  },
  whatIfSubLabel: {
    color: '#94a3b8',
    fontSize: '11px',
    marginTop: '4px',
  },
  emptyChart: {
    color: '#94a3b8',
    fontSize: '12px',
    padding: '30px 0',
    textAlign: 'center',
  },
  premiumList: {
    display: 'grid',
    gap: '8px',
    marginTop: '10px',
  },
  premiumRow: {
    display: 'grid',
    gridTemplateColumns: '80px 1fr 100px',
    gap: '8px',
    alignItems: 'center',
  },
  premiumLabel: {
    color: '#cbd5e1',
    fontSize: '11px',
  },
  premiumTrack: {
    height: '10px',
    borderRadius: '999px',
    background: '#020617',
    overflow: 'hidden',
    border: '1px solid #1e293b',
  },
  premiumFill: {
    height: '100%',
    borderRadius: '999px',
  },
  premiumValue: {
    textAlign: 'right',
    fontSize: '11px',
    fontWeight: 'bold',
  },
  rangeWrap: {
    position: 'relative',
    height: '56px',
    marginTop: '8px',
  },
  rangeTrack: {
    position: 'absolute',
    top: '22px',
    left: 0,
    right: 0,
    height: '12px',
    borderRadius: '999px',
    background: '#1e293b',
  },
  rangeSeg: {
    position: 'absolute',
    top: '22px',
    height: '12px',
    borderRadius: '999px',
  },
  rangeMarker: {
    position: 'absolute',
    top: '10px',
    width: '2px',
    height: '34px',
    background: '#38bdf8',
  },
  rangeAxis: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    color: '#94a3b8',
    fontSize: '11px',
    marginTop: '6px',
  },
  legsPanel: {
    background: '#08111f',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    padding: '12px',
    marginBottom: '12px',
  },
  legsToolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    flexWrap: 'wrap',
    marginBottom: '10px',
  },
  legsToolbarText: {
    color: '#94a3b8',
    fontSize: '11px',
  },
  legsWrap: {
    display: 'grid',
    gap: '8px',
  },
  legChip: {
    background: '#0f172a',
    border: '1px solid #334155',
    color: '#cbd5e1',
    borderRadius: '999px',
    padding: '6px 10px',
    fontSize: '11px',
  },
  cardActions: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '18px',
    fontWeight: '700',
    color: '#f8fafc',
    margin: '20px 0 10px',
    cursor: 'pointer',
    listStyle: 'none',
    background: 'linear-gradient(90deg, #1e293b40, transparent)',
    padding: '10px 14px',
    borderRadius: '10px',
  },
  sectionIcon: {
    fontSize: '20px',
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    marginLeft: '10px',
    padding: '3px 8px',
    borderRadius: '999px',
    border: '1px solid',
    fontSize: '10px',
    fontWeight: 'bold',
    verticalAlign: 'middle',
  },
  buyButton: {
    background: '#14532d',
    border: '1px solid #22c55e',
    color: '#bbf7d0',
    borderRadius: '8px',
    padding: '10px 14px',
    cursor: 'pointer',
    fontWeight: 'bold',
    minHeight: '44px',
    fontSize: '13px',
  },
  closeStratBtn: {
    background: '#1e293b',
    border: '1px solid #64748b',
    color: '#e2e8f0',
    borderRadius: '8px',
    padding: '10px 14px',
    cursor: 'pointer',
    fontWeight: 'bold',
    minHeight: '44px',
    fontSize: '13px',
  },
  legChipWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  closeLegBtn: {
    background: 'none',
    border: 'none',
    color: '#f87171',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
    marginLeft: '6px',
    padding: '4px 8px',
    minWidth: '32px',
    minHeight: '32px',
  },
  closeLegForm: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '6px 8px',
  },
  closeLegLabel: {
    color: '#94a3b8',
    fontSize: '11px',
  },
  closeLegInput: {
    width: '80px',
    background: '#020617',
    border: '1px solid #334155',
    borderRadius: '6px',
    color: '#e2e8f0',
    padding: '8px 10px',
    fontSize: '14px',
    minHeight: '40px',
  },
  closeLegConfirm: {
    background: '#14532d',
    border: '1px solid #22c55e',
    color: '#bbf7d0',
    borderRadius: '6px',
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
    minHeight: '40px',
  },
  closeLegCancel: {
    background: 'none',
    border: '1px solid #475569',
    color: '#94a3b8',
    borderRadius: '6px',
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '12px',
    minHeight: '40px',
  },
  analyzerWrap: {
    background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.7))',
    border: '1px solid #334155',
    borderRadius: '14px',
    padding: '16px',
    marginBottom: '14px',
  },
  analyzerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    marginBottom: '8px',
  },
  analyzerTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  analyzerRec: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 12px',
    borderRadius: '999px',
    border: '1px solid',
    fontSize: '12px',
    fontWeight: 'bold',
    background: 'rgba(0,0,0,0.3)',
  },
  analyzerReason: {
    color: '#94a3b8',
    fontSize: '13px',
    lineHeight: '1.5',
    marginBottom: '12px',
  },
  analyzerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '10px',
    marginBottom: '12px',
  },
  analyzerCard: {
    background: 'linear-gradient(135deg, #0f172a, #1e293b30)',
    border: '1px solid #1e293b',
    borderRadius: '10px',
    padding: '12px',
  },
  analyzerLabel: {
    color: '#94a3b8',
    fontSize: '10px',
    textTransform: 'uppercase',
    marginBottom: '4px',
    letterSpacing: '0.5px',
  },
  analyzerValue: {
    color: '#f8fafc',
    fontSize: '15px',
    fontWeight: 'bold',
  },
  analyzerSub: {
    color: '#94a3b8',
    fontSize: '10px',
    marginTop: '4px',
  },
  gaugeWrap: {
    height: '8px',
    borderRadius: '999px',
    background: '#1e293b',
    marginTop: '6px',
    overflow: 'hidden',
  },
  gaugeBar: {
    height: '100%',
    borderRadius: '999px',
    transition: 'width 0.3s ease',
  },
  analyzerSection: {
    marginTop: '10px',
    paddingTop: '10px',
    borderTop: '1px solid #1e293b',
  },
  analyzerSubTitle: {
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#cbd5e1',
    marginBottom: '8px',
  },
  legBreakdownTable: {
    display: 'grid',
    gap: '6px',
  },
  legBreakdownRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '6px 8px',
    background: '#0f172a',
    borderRadius: '8px',
    fontSize: '12px',
    flexWrap: 'wrap',
  },
  legBreakdownLabel: {
    color: '#e2e8f0',
    fontWeight: 'bold',
    minWidth: '120px',
  },
  legBreakdownPrices: {
    color: '#94a3b8',
    flex: 1,
    textAlign: 'center',
  },
  legBreakdownPL: {
    fontWeight: 'bold',
    minWidth: '100px',
    textAlign: 'right',
  },
  suggestionList: {
    margin: '0',
    paddingLeft: '18px',
    color: '#94a3b8',
    fontSize: '12px',
    lineHeight: '1.8',
  },
  suggestionItem: {
    color: '#cbd5e1',
  },
  txDetails: {
    marginTop: '10px',
    borderTop: '1px solid #1e293b',
    paddingTop: '10px',
  },
  txSummary: {
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#cbd5e1',
    listStyle: 'none',
  },
  txList: {
    display: 'grid',
    gap: '4px',
    marginTop: '8px',
  },
  txRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 8px',
    background: '#0f172a',
    borderRadius: '8px',
    fontSize: '11px',
    flexWrap: 'wrap',
  },
  txType: {
    color: '#60a5fa',
    fontWeight: 'bold',
    minWidth: '50px',
  },
  txDesc: {
    color: '#cbd5e1',
    flex: 1,
  },
  txAmount: {
    fontWeight: 'bold',
    minWidth: '90px',
    textAlign: 'right',
  },
  txTime: {
    color: '#64748b',
    fontSize: '10px',
  },
  profitBanner: {
    border: '2px solid',
    borderRadius: '14px',
    padding: '16px',
    marginBottom: '14px',
  },
  profitBannerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  },
  profitBannerLabel: {
    fontSize: '12px',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '4px',
  },
  profitBannerValue: {
    fontSize: '28px',
    fontWeight: 'bold',
    letterSpacing: '-0.5px',
  },
  profitBannerSplit: {
    display: 'flex',
    gap: '16px',
    fontSize: '13px',
    color: '#94a3b8',
    flexWrap: 'wrap',
  },
  profitBannerSmLabel: {
    color: '#64748b',
  },
  legCardWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    width: '100%',
  },
  legCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '10px',
    padding: '10px 12px',
  },
  legCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
  },
  legRowMain: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
    minWidth: 0,
    flex: 1,
  },
  legRowActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  legSideBadge: {
    padding: '2px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 'bold',
  },
  legCardStrike: {
    color: '#e2e8f0',
    fontWeight: 'bold',
    fontSize: '14px',
    flex: 1,
  },
  legCardPL: {
    fontWeight: 'bold',
    fontSize: '14px',
  },
  legCardPrices: {
    display: 'flex',
    gap: '8px',
    fontSize: '12px',
    color: '#94a3b8',
    alignItems: 'center',
  },
  legSmallActionBtn: {
    background: '#0b1220',
    border: '1px solid #334155',
    color: '#cbd5e1',
    borderRadius: '8px',
    padding: '6px 10px',
    cursor: 'pointer',
    fontSize: '12px',
    minHeight: '34px',
  },
  closeLegInlineBtn: {
    background: '#172033',
    border: '1px solid #475569',
    color: '#e2e8f0',
    borderRadius: '8px',
    padding: '6px 10px',
    cursor: 'pointer',
    fontSize: '12px',
    minHeight: '34px',
    fontWeight: '700',
  },
  closeLegActionBtn: {
    width: '100%',
    marginTop: '8px',
    background: '#1e293b',
    border: '1px solid #475569',
    color: '#e2e8f0',
    borderRadius: '8px',
    padding: '8px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
    minHeight: '40px',
  },
  closeLegFormHeader: {
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#e2e8f0',
    marginBottom: '8px',
  },
  closeLegFormRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  closeLegPreview: {
    fontSize: '14px',
    fontWeight: 'bold',
    padding: '6px 0',
  },
  closeLegFormBtns: {
    display: 'flex',
    gap: '8px',
    marginTop: '6px',
  },
  addLegBtn: {
    marginTop: '10px',
    width: '100%',
    background: '#0f172a',
    border: '2px dashed #334155',
    color: '#60a5fa',
    borderRadius: '10px',
    padding: '10px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 'bold',
    minHeight: '44px',
  },
  addLegInlineBtn: {
    background: '#0f172a',
    border: '1px solid #334155',
    color: '#93c5fd',
    borderRadius: '9px',
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '700',
    minHeight: '38px',
  },
  addLegForm: {
    marginTop: '10px',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '12px',
    padding: '14px',
  },
  legEditor: {
    marginBottom: '10px',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '12px',
    padding: '12px',
  },
  legEditorHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
    marginBottom: '10px',
  },
  legEditorTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#f8fafc',
  },
  legEditorHint: {
    color: '#94a3b8',
    fontSize: '11px',
    marginTop: '3px',
  },
  legEditorSpot: {
    color: '#93c5fd',
    fontSize: '12px',
    fontWeight: '700',
  },
  legEditorRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: '8px',
  },
  legEditorMeta: {
    display: 'flex',
    gap: '14px',
    flexWrap: 'wrap',
    color: '#94a3b8',
    fontSize: '11px',
    marginBottom: '10px',
  },
  addLegTitle: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#e2e8f0',
    marginBottom: '10px',
  },
  addLegRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: '10px',
  },
  addLegSelect: {
    background: '#020617',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: '#e2e8f0',
    padding: '8px 10px',
    fontSize: '13px',
    minHeight: '40px',
    cursor: 'pointer',
  },
  addLegInput: {
    background: '#020617',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: '#e2e8f0',
    padding: '8px 10px',
    fontSize: '13px',
    width: '90px',
    minHeight: '40px',
  },
  addLegActions: {
    display: 'flex',
    gap: '8px',
  },
};
