/**
 * POST /api/options-best-strategies
 *
 * Searches thousands of option leg combinations (3-8 legs) using step-based
 * iteration to find the best shorting strategies quickly.
 *
 * Body: { spot, expiry, lotSize, pricingSource, rate, iv, strikeRange }
 *
 * Calendar mode (separate, on-demand):
 * Body: { ...above, calendar: true, sellExpiry, buyExpiry }
 */

async function fetchYahooPrice(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&includePrePost=false`;
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0',
      accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`Yahoo response ${response.status}`);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const price = result?.meta?.regularMarketPrice;
  if (!Number.isFinite(price)) throw new Error('Yahoo payload missing price');
  return Number(price);
}

const LOT_SIZE_DEFAULT = 65;
const STRIKE_STEP = 50;

// ---- Math helpers ----

function normalCdf(x) {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * absX);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-absX * absX);
  return 0.5 * (1 + sign * erf);
}

function normalPdf(x) { return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); }

function optionIntrinsic(type, strike, spot) {
  return type === 'CE' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
}

// ---- Pricing models ----

function blackScholesPrice({ spot, strike, timeYears, volatility, riskFreeRate, type }) {
  const iv = optionIntrinsic(type, strike, spot);
  if (!timeYears || timeYears <= 0 || !volatility || volatility <= 0) return iv;
  const sT = volatility * Math.sqrt(timeYears);
  if (!sT) return iv;
  const d1 = (Math.log(spot / strike) + (riskFreeRate + 0.5 * volatility * volatility) * timeYears) / sT;
  const d2 = d1 - sT;
  if (type === 'CE') return spot * normalCdf(d1) - strike * Math.exp(-riskFreeRate * timeYears) * normalCdf(d2);
  return strike * Math.exp(-riskFreeRate * timeYears) * normalCdf(-d2) - spot * normalCdf(-d1);
}

function binomialCrrPrice({ spot, strike, timeYears, volatility, riskFreeRate, type }) {
  const iv = optionIntrinsic(type, strike, spot);
  if (!timeYears || timeYears <= 0 || !volatility || volatility <= 0) return iv;
  const steps = 60;
  const dt = timeYears / steps;
  const up = Math.exp(volatility * Math.sqrt(dt));
  const dn = 1 / up;
  const g = Math.exp(riskFreeRate * dt);
  const p = Math.min(1, Math.max(0, (g - dn) / (up - dn)));
  const v = [];
  for (let i = 0; i <= steps; i++) v[i] = optionIntrinsic(type, strike, spot * (up ** (steps - i)) * (dn ** i));
  for (let s = steps - 1; s >= 0; s--) for (let i = 0; i <= s; i++) v[i] = Math.exp(-riskFreeRate * dt) * (p * v[i] + (1 - p) * v[i + 1]);
  return v[0];
}

function bachelierPrice({ spot, strike, timeYears, volatility, riskFreeRate, type }) {
  const iv = optionIntrinsic(type, strike, spot);
  if (!timeYears || timeYears <= 0 || !volatility || volatility <= 0) return iv;
  const df = Math.exp(-riskFreeRate * timeYears);
  const fwd = spot * Math.exp(riskFreeRate * timeYears);
  const sT = Math.max(spot * volatility, 1e-9) * Math.sqrt(timeYears);
  const d = (fwd - strike) / sT;
  if (type === 'CE') return df * ((fwd - strike) * normalCdf(d) + sT * normalPdf(d));
  return df * ((strike - fwd) * normalCdf(-d) + sT * normalPdf(d));
}

function createSeededRandom(seed) {
  let v = seed >>> 0;
  return () => { v = (1664525 * v + 1013904223) >>> 0; return v / 4294967296; };
}

function monteCarloGbmPrice({ spot, strike, timeYears, volatility, riskFreeRate, type, seed = 22600 }) {
  const iv = optionIntrinsic(type, strike, spot);
  if (!timeYears || timeYears <= 0 || !volatility || volatility <= 0) return iv;
  const rng = createSeededRandom(seed);
  const paths = 2000;
  let total = 0;
  for (let i = 0; i < paths; i++) {
    const u1 = Math.max(rng(), 1e-12); const u2 = Math.max(rng(), 1e-12);
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    total += optionIntrinsic(type, strike, spot * Math.exp((riskFreeRate - 0.5 * volatility * volatility) * timeYears + volatility * Math.sqrt(timeYears) * z));
  }
  return Math.exp(-riskFreeRate * timeYears) * (total / paths);
}

function getTheoreticalVolatility({ spot, strike, timeYears, type, baseVolatility }) {
  const dTE = timeYears * 365;
  const wingDist = Math.abs(strike - spot) / spot;
  const logMoney = Math.abs(Math.log(Math.max(strike, 1) / Math.max(spot, 1)));
  const weeklyBoost = dTE <= 2 ? ((2 - dTE) / 2) * 0.12 : dTE <= 7 ? ((7 - dTE) / 5) * 0.03 : 0;
  const bw = Math.pow(Math.max(wingDist * 10, logMoney * 7), 1.08);
  const pw = type === 'PE' && strike < spot ? bw * 0.189 : 0;
  const cw = type === 'CE' && strike > spot ? bw * 0.0216 : 0;
  const ow = ((type === 'CE' && strike < spot) || (type === 'PE' && strike > spot)) ? bw * 0.0072 : 0;
  const ps = type === 'PE' && strike < spot ? Math.pow(((spot - strike) / spot) * 10, 1.15) * 0.04 : 0;
  const cs = type === 'CE' && strike > spot ? Math.pow(((strike - spot) / spot) * 10, 1.05) * 0.014 : 0;
  const nAtm = dTE <= 2 ? Math.max(0, 0.018 - wingDist * 0.12) : 0;
  const nfc = type === 'CE' && strike > spot ? Math.pow(Math.max((strike - spot) / spot, 0) * 10, 1.12) * (dTE <= 7 ? 0.16 : 0.07) : 0;
  const nfp = type === 'PE' && strike < spot ? Math.pow(Math.max((spot - strike) / spot, 0) * 10, 1.02) * (dTE <= 7 ? 0.035 : 0.015) : 0;
  return Math.min(1.4, Math.max(0.05, baseVolatility / 100 + weeklyBoost + pw + cw + ow + ps + cs - nAtm - nfc - nfp));
}

function blendPrice({ spot, strike, timeYears, volatility, riskFreeRate, type, pricingSource, seed }) {
  const args = { spot, strike, timeYears, volatility, riskFreeRate, type };
  if (pricingSource && pricingSource !== 'blend') {
    const fns = { blackScholes: blackScholesPrice, binomialCrr: binomialCrrPrice, bachelier: bachelierPrice, monteCarlo: (a) => monteCarloGbmPrice({ ...a, seed }), intrinsic: () => optionIntrinsic(type, strike, spot) };
    return Number(((fns[pricingSource] || blackScholesPrice)(args)).toFixed(2));
  }
  return Number((blackScholesPrice(args) * 0.35 + binomialCrrPrice(args) * 0.35 + bachelierPrice(args) * 0.15 + monteCarloGbmPrice({ ...args, seed }) * 0.15).toFixed(2));
}

// ---- Payoff engine ----

function legPayoff(leg, spot) {
  const intr = optionIntrinsic(leg.type, leg.strike, spot);
  return ((leg.side === 'SELL' ? leg.premium : -leg.premium) + (leg.side === 'SELL' ? -intr : intr)) * leg.quantity;
}

function evaluateCandidate(legs, refSpot, lotSize) {
  const orderedStrikes = legs.map((l) => l.strike).sort((a, b) => a - b);
  const lo = Math.max(0, orderedStrikes[0] - 2000);
  const hi = orderedStrikes[orderedStrikes.length - 1] + 2000;
  const pts = [];
  for (let s = lo; s <= hi; s += STRIKE_STEP) pts.push({ spot: s, value: Number((legs.reduce((sm, l) => sm + legPayoff(l, s), 0) * lotSize).toFixed(2)) });
  const vals = pts.map((p) => p.value);
  const maxProfit = Math.max(...vals);
  const maxLoss = Math.min(...vals);
  const be = [];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1]; const c = pts[i];
    if ((p.value < 0 && c.value > 0) || (p.value > 0 && c.value < 0)) {
      const r = Math.abs(p.value) / (Math.abs(p.value) + Math.abs(c.value));
      be.push(Math.round(p.spot + (c.spot - p.spot) * r));
    }
  }
  const profitZones = []; const lossZones = [];
  let zStart = null; let zType = null;
  for (let i = 0; i < pts.length; i++) {
    const ct = pts[i].value >= 0 ? 'p' : 'l';
    if (zType === null) { zStart = pts[i].spot; zType = ct; }
    else if (ct !== zType) {
      const prev = pts[i - 1];
      const r = Math.abs(prev.value) / (Math.abs(prev.value) + Math.abs(pts[i].value));
      const boundary = Math.round(prev.spot + (pts[i].spot - prev.spot) * r);
      (zType === 'p' ? profitZones : lossZones).push({ from: zStart, to: boundary });
      zStart = boundary; zType = ct;
    }
  }
  if (zType && pts.length) (zType === 'p' ? profitZones : lossZones).push({ from: zStart, to: pts[pts.length - 1].spot });
  const profitZoneWidth = profitZones.reduce((s, z) => s + Math.max(z.to - z.from, 0), 0);
  const entryCredit = Number((legs.reduce((s, l) => s + (l.side === 'SELL' ? l.premium * l.quantity : -l.premium * l.quantity), 0) * lotSize).toFixed(2));
  const payoffAtSpot = Number((legs.reduce((s, l) => s + legPayoff(l, refSpot), 0) * lotSize).toFixed(2));
  const rr = maxLoss < 0 ? Number((maxProfit / Math.abs(maxLoss)).toFixed(3)) : null;
  return { legs, maxProfit: Number(maxProfit.toFixed(2)), maxLoss: Number(maxLoss.toFixed(2)), entryCredit, payoffAtSpot, breakEvens: [...new Set(be)], profitZones, lossZones, profitZoneWidth, rewardToRisk: rr, totalLots: legs.reduce((s, l) => s + l.quantity, 0) };
}

// ---- Premium map ----

function buildPremiumMap({ strikes, referenceSpot, timeYears, riskFreeRate, baseVolatility, pricingSource }) {
  const map = {};
  for (const strike of strikes) {
    for (const type of ['CE', 'PE']) {
      const vol = getTheoreticalVolatility({ spot: referenceSpot, strike, timeYears, type, baseVolatility });
      map[`${strike}|${type}`] = Math.max(blendPrice({ spot: referenceSpot, strike, timeYears, volatility: vol, riskFreeRate, type, pricingSource, seed: Math.round(referenceSpot + strike + type.charCodeAt(0)) }), 0.05);
    }
  }
  return map;
}

function gp(map, strike, type) { return map[`${strike}|${type}`] || 0; }

function makeLeg(side, type, strike, quantity, premMap) {
  return { side, type, strike, quantity, premium: gp(premMap, strike, type) };
}

// ---- Step-based generators (fast) ----

function generateIronCondors(spot, premMap, step) {
  const results = [];
  for (let scd = 0; scd <= 24; scd++) {
    const sc = spot + scd * step;
    for (let spd = 0; spd <= 24; spd++) {
      const sp = spot - spd * step;
      if (sp <= 0) continue;
      for (let wcw = 1; wcw <= 18; wcw++) {
        const lc = sc + wcw * step;
        for (let wpw = 1; wpw <= 18; wpw++) {
          const lp = sp - wpw * step;
          if (lp <= 0) continue;
          results.push([makeLeg('SELL', 'CE', sc, 1, premMap), makeLeg('SELL', 'PE', sp, 1, premMap), makeLeg('BUY', 'CE', lc, 1, premMap), makeLeg('BUY', 'PE', lp, 1, premMap)]);
        }
      }
    }
  }
  return results;
}

function generateIronButterflies(spot, premMap, step) {
  const results = [];
  for (let cd = -6; cd <= 6; cd++) {
    const center = spot + cd * step;
    if (center <= 0) continue;
    for (let cw = 1; cw <= 18; cw++) {
      const wingCe = center + cw * step;
      for (let pw = 1; pw <= 18; pw++) {
        const wingPe = center - pw * step;
        if (wingPe <= 0) continue;
        results.push([makeLeg('SELL', 'CE', center, 1, premMap), makeLeg('SELL', 'PE', center, 1, premMap), makeLeg('BUY', 'CE', wingCe, 1, premMap), makeLeg('BUY', 'PE', wingPe, 1, premMap)]);
      }
    }
  }
  return results;
}

function generateJadeLizards(spot, premMap, step) {
  const results = [];
  for (let pd = 1; pd <= 18; pd++) {
    const putStrike = spot - pd * step;
    if (putStrike <= 0) continue;
    for (let cd = 0; cd <= 18; cd++) {
      const callSell = spot + cd * step;
      for (let cw = 1; cw <= 14; cw++) {
        const callBuy = callSell + cw * step;
        results.push([makeLeg('SELL', 'PE', putStrike, 1, premMap), makeLeg('SELL', 'CE', callSell, 1, premMap), makeLeg('BUY', 'CE', callBuy, 1, premMap)]);
      }
    }
  }
  return results;
}

function generateTwistedSisters(spot, premMap, step) {
  const results = [];
  for (let cd = 0; cd <= 18; cd++) {
    const callStrike = spot + cd * step;
    for (let pd = 1; pd <= 18; pd++) {
      const putSell = spot - pd * step;
      if (putSell <= 0) continue;
      for (let pw = 1; pw <= 14; pw++) {
        const putBuy = putSell - pw * step;
        if (putBuy <= 0) continue;
        results.push([makeLeg('SELL', 'CE', callStrike, 1, premMap), makeLeg('SELL', 'PE', putSell, 1, premMap), makeLeg('BUY', 'PE', putBuy, 1, premMap)]);
      }
    }
  }
  return results;
}

function generateRatioCondors(spot, premMap, step) {
  const results = [];
  for (let scd = 0; scd <= 12; scd++) {
    const sc = spot + scd * step;
    for (let spd = 0; spd <= 12; spd++) {
      const sp = spot - spd * step;
      if (sp <= 0) continue;
      for (let wcw = 1; wcw <= 10; wcw++) {
        const lc = sc + wcw * step;
        for (let wpw = 1; wpw <= 10; wpw++) {
          const lp = sp - wpw * step;
          if (lp <= 0) continue;
          results.push([makeLeg('SELL', 'CE', sc, 1, premMap), makeLeg('SELL', 'PE', sp, 1, premMap), makeLeg('BUY', 'CE', lc, 2, premMap), makeLeg('BUY', 'PE', lp, 2, premMap)]);
        }
      }
    }
  }
  return results;
}

function generateStrangleWithWings(spot, premMap, step) {
  const results = [];
  for (let cd = 1; cd <= 14; cd++) {
    const sc = spot + cd * step;
    for (let pd = 1; pd <= 14; pd++) {
      const sp = spot - pd * step;
      if (sp <= 0) continue;
      for (let wcw = 2; wcw <= 12; wcw++) {
        const wc = sc + wcw * step;
        for (let wpw = 2; wpw <= 12; wpw++) {
          const wp = sp - wpw * step;
          if (wp <= 0) continue;
          results.push([makeLeg('SELL', 'CE', sc, 1, premMap), makeLeg('SELL', 'PE', sp, 1, premMap), makeLeg('BUY', 'CE', wc, 1, premMap), makeLeg('BUY', 'PE', wp, 1, premMap)]);
        }
      }
    }
  }
  return results;
}

function generateRatioSpreads(spot, premMap, step) {
  const results = [];
  for (let sd = 0; sd <= 10; sd++) {
    const sc = spot + sd * step;
    for (let bw = 2; bw <= 10; bw++) {
      const bc = sc + bw * step;
      for (let pd = 1; pd <= 10; pd++) {
        const sp = spot - pd * step;
        if (sp <= 0) continue;
        for (let phw = 2; phw <= 10; phw++) {
          const hp = sp - phw * step;
          if (hp <= 0) continue;
          results.push([makeLeg('SELL', 'CE', sc, 1, premMap), makeLeg('BUY', 'CE', bc, 2, premMap), makeLeg('SELL', 'PE', sp, 1, premMap), makeLeg('BUY', 'PE', hp, 1, premMap)]);
        }
      }
    }
  }
  return results;
}

function generateDoubleCondors(spot, premMap, step) {
  const results = [];
  for (let icd = 0; icd <= 8; icd++) {
    const sc1 = spot + icd * step;
    for (let ipd = 0; ipd <= 8; ipd++) {
      const sp1 = spot - ipd * step;
      if (sp1 <= 0) continue;
      for (let iw = 2; iw <= 6; iw++) {
        const lc1 = sc1 + iw * step;
        const lp1 = sp1 - iw * step;
        if (lp1 <= 0) continue;
        for (let od = 1; od <= 4; od++) {
          const sc2 = lc1 + od * step;
          const sp2 = lp1 - od * step;
          if (sp2 <= 0) continue;
          for (let ow = 2; ow <= 5; ow++) {
            const lc2 = sc2 + ow * step;
            const lp2 = sp2 - ow * step;
            if (lp2 <= 0) continue;
            results.push([
              makeLeg('SELL', 'CE', sc1, 1, premMap), makeLeg('SELL', 'PE', sp1, 1, premMap),
              makeLeg('BUY', 'CE', lc1, 1, premMap), makeLeg('BUY', 'PE', lp1, 1, premMap),
              makeLeg('SELL', 'CE', sc2, 1, premMap), makeLeg('SELL', 'PE', sp2, 1, premMap),
              makeLeg('BUY', 'CE', lc2, 1, premMap), makeLeg('BUY', 'PE', lp2, 1, premMap),
            ]);
          }
        }
      }
    }
  }
  return results;
}

function generateBearCallLadders(spot, premMap, step) {
  const results = [];
  for (let sd = 0; sd <= 18; sd++) {
    const sellCe = spot + sd * step;
    for (let b1w = 1; b1w <= 14; b1w++) {
      const buyCe1 = sellCe + b1w * step;
      for (let b2w = 1; b2w <= 14; b2w++) {
        const buyCe2 = buyCe1 + b2w * step;
        results.push([makeLeg('SELL', 'CE', sellCe, 1, premMap), makeLeg('BUY', 'CE', buyCe1, 1, premMap), makeLeg('BUY', 'CE', buyCe2, 1, premMap)]);
      }
    }
  }
  return results;
}

function generateBullPutLadders(spot, premMap, step) {
  const results = [];
  for (let sd = 0; sd <= 18; sd++) {
    const sellPe = spot - sd * step;
    if (sellPe <= 0) continue;
    for (let b1w = 1; b1w <= 14; b1w++) {
      const buyPe1 = sellPe - b1w * step;
      if (buyPe1 <= 0) continue;
      for (let b2w = 1; b2w <= 14; b2w++) {
        const buyPe2 = buyPe1 - b2w * step;
        if (buyPe2 <= 0) continue;
        results.push([makeLeg('SELL', 'PE', sellPe, 1, premMap), makeLeg('BUY', 'PE', buyPe1, 1, premMap), makeLeg('BUY', 'PE', buyPe2, 1, premMap)]);
      }
    }
  }
  return results;
}

function generateLayeredCondors(spot, premMap, step) {
  const results = [];
  for (let c1d = 0; c1d <= 8; c1d++) {
    const sc1 = spot + c1d * step;
    for (let p1d = 0; p1d <= 8; p1d++) {
      const sp1 = spot - p1d * step;
      if (sp1 <= 0) continue;
      for (let c2w = 1; c2w <= 6; c2w++) {
        const sc2 = sc1 + c2w * step;
        for (let p2w = 1; p2w <= 6; p2w++) {
          const sp2 = sp1 - p2w * step;
          if (sp2 <= 0) continue;
          for (let cHw = 1; cHw <= 5; cHw++) {
            const lc = sc2 + cHw * step;
            for (let pHw = 1; pHw <= 5; pHw++) {
              const lp = sp2 - pHw * step;
              if (lp <= 0) continue;
              results.push([makeLeg('SELL', 'CE', sc1, 1, premMap), makeLeg('SELL', 'PE', sp1, 1, premMap), makeLeg('SELL', 'CE', sc2, 1, premMap), makeLeg('SELL', 'PE', sp2, 1, premMap), makeLeg('BUY', 'CE', lc, 1, premMap), makeLeg('BUY', 'PE', lp, 1, premMap)]);
            }
          }
        }
      }
    }
  }
  return results;
}

// ---- Scoring profiles ----

const PROFILES = [
  { key: 'balanced', label: 'Best Overall', description: 'Best balance of credit, limited loss, and wide profit zone.', score: (c) => ((Math.max(c.entryCredit, 0) + 1) * (c.profitZoneWidth + 1)) / Math.max(Math.abs(c.maxLoss), 1) },
  { key: 'widest-range', label: 'Widest Profit Range', description: 'Largest spot range where strategy stays profitable at expiry.', score: (c) => c.profitZoneWidth * 1000 + (c.rewardToRisk || 0) * 50 + Math.max(c.entryCredit, 0) },
  { key: 'highest-credit', label: 'Highest Credit', description: 'Largest entry credit received.', score: (c) => Math.max(c.entryCredit, 0) * 1000 + c.profitZoneWidth + (c.rewardToRisk || 0) },
  { key: 'lowest-risk', label: 'Lowest Max Loss', description: 'Minimises worst-case loss.', score: (c) => (c.maxLoss >= 0 ? 1e9 : 1 / Math.abs(c.maxLoss)) * 1000 + c.profitZoneWidth + Math.max(c.entryCredit, 0) * 0.1 },
  { key: 'best-ratio', label: 'Best Risk/Reward', description: 'Highest max profit vs max loss ratio.', score: (c) => (c.rewardToRisk || 0) * 10000 + c.profitZoneWidth + Math.max(c.entryCredit, 0) },
  { key: 'highest-profit', label: 'Highest Profit', description: 'Maximum possible profit at expiry.', score: (c) => c.maxProfit * 1000 + c.profitZoneWidth + Math.max(c.entryCredit, 0) },
];

// ---- Calendar spread generators (cross-expiry) ----

function generateCalendarSpreads(spot, sellPremMap, buyPremMap, step) {
  const results = [];
  // Single calendar CE / PE
  for (let sd = -10; sd <= 15; sd++) {
    const sellStrike = spot + sd * step;
    if (sellStrike <= 0) continue;
    for (let bd = -10; bd <= 15; bd++) {
      const buyStrike = spot + bd * step;
      if (buyStrike <= 0) continue;
      results.push({ legs: [makeLeg('SELL', 'CE', sellStrike, 1, sellPremMap), makeLeg('BUY', 'CE', buyStrike, 1, buyPremMap)], family: 'Calendar CE Spread' });
      results.push({ legs: [makeLeg('SELL', 'PE', sellStrike, 1, sellPremMap), makeLeg('BUY', 'PE', buyStrike, 1, buyPremMap)], family: 'Calendar PE Spread' });
    }
  }
  // Double calendar
  for (let cd = 0; cd <= 12; cd++) {
    const sellCe = spot + cd * step;
    for (let pd = 0; pd <= 12; pd++) {
      const sellPe = spot - pd * step;
      if (sellPe <= 0) continue;
      for (let bcd = 0; bcd <= 12; bcd++) {
        const buyCe = spot + bcd * step;
        for (let bpd = 0; bpd <= 12; bpd++) {
          const buyPe = spot - bpd * step;
          if (buyPe <= 0) continue;
          results.push({
            legs: [makeLeg('SELL', 'CE', sellCe, 1, sellPremMap), makeLeg('SELL', 'PE', sellPe, 1, sellPremMap), makeLeg('BUY', 'CE', buyCe, 1, buyPremMap), makeLeg('BUY', 'PE', buyPe, 1, buyPremMap)],
            family: 'Double Calendar',
          });
        }
      }
    }
  }
  // Calendar condor
  for (let cd = 0; cd <= 10; cd++) {
    const sc = spot + cd * step;
    for (let pd = 0; pd <= 10; pd++) {
      const sp = spot - pd * step;
      if (sp <= 0) continue;
      for (let wc = 2; wc <= 8; wc++) {
        const lc = sc + wc * step;
        for (let wp = 2; wp <= 8; wp++) {
          const lp = sp - wp * step;
          if (lp <= 0) continue;
          results.push({
            legs: [makeLeg('SELL', 'CE', sc, 1, sellPremMap), makeLeg('SELL', 'PE', sp, 1, sellPremMap), makeLeg('BUY', 'CE', lc, 1, buyPremMap), makeLeg('BUY', 'PE', lp, 1, buyPremMap)],
            family: 'Calendar Condor',
          });
        }
      }
    }
  }
  return results;
}

const CALENDAR_PROFILES = [
  { key: 'cal-balanced', label: 'Best Calendar Overall', description: 'Best balance across calendar strategies.', score: (c) => ((Math.max(c.entryCredit, 0) + 1) * (c.profitZoneWidth + 1)) / Math.max(Math.abs(c.maxLoss), 1) },
  { key: 'cal-credit', label: 'Calendar Highest Credit', description: 'Largest credit from selling near-term, buying far-term.', score: (c) => Math.max(c.entryCredit, 0) * 1000 + c.profitZoneWidth },
  { key: 'cal-safety', label: 'Calendar Safest', description: 'Lowest max loss with calendar structure.', score: (c) => (c.maxLoss >= 0 ? 1e9 : 1 / Math.abs(c.maxLoss)) * 1000 + Math.max(c.entryCredit, 0) },
];

// ---- Main handler ----

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const body = req.body || {};
  const spot = Math.round((Number(body.spot) || 24000) / STRIKE_STEP) * STRIKE_STEP;
  const lotSize = Number(body.lotSize) || LOT_SIZE_DEFAULT;
  const pricingSource = body.pricingSource || 'blend';
  const riskFreeRate = (Number(body.rate) || 6) / 100;
  const manualVolatility = Number(body.iv) || null;
  let indiaVix = null;
  try {
    indiaVix = await fetchYahooPrice('^INDIAVIX');
  } catch (_) {
    indiaVix = null;
  }
  const baseVolatility = indiaVix ?? manualVolatility ?? 14;
  const isCalendar = Boolean(body.calendar);

  const computeTimeYears = (expiryUnix) => {
    if (!expiryUnix || expiryUnix <= 0) return 7 / 365;
    const secs = Math.max(expiryUnix - Math.floor(Date.now() / 1000), 0);
    return secs > 0 ? secs / (365 * 24 * 60 * 60) : 1 / 365;
  };

  const expiryUnix = Number(body.expiry) || 0;
  const timeYears = computeTimeYears(expiryUnix);
  const strikes = [];
  for (let s = spot - 2000; s <= spot + 2000; s += STRIKE_STEP) { if (s > 0) strikes.push(s); }
  const premMap = buildPremiumMap({ strikes, referenceSpot: spot, timeYears, riskFreeRate, baseVolatility, pricingSource });
  const step = STRIKE_STEP;

  // -- Calendar mode --
  if (isCalendar) {
    const sellExpiry = Number(body.sellExpiry) || 0;
    const buyExpiry = Number(body.buyExpiry) || 0;
    if (!sellExpiry || !buyExpiry) { res.status(400).json({ error: 'Calendar mode requires sellExpiry and buyExpiry unix timestamps.' }); return; }
    const sellPremMap = buildPremiumMap({ strikes, referenceSpot: spot, timeYears: computeTimeYears(sellExpiry), riskFreeRate, baseVolatility, pricingSource });
    const buyPremMap = buildPremiumMap({ strikes, referenceSpot: spot, timeYears: computeTimeYears(buyExpiry), riskFreeRate, baseVolatility, pricingSource });
    const candidates = generateCalendarSpreads(spot, sellPremMap, buyPremMap, step);
    const viable = [];
    for (const { legs, family } of candidates) {
      const nc = legs.reduce((s, l) => s + (l.side === 'SELL' ? l.premium * l.quantity : -l.premium * l.quantity), 0);
      if (nc <= 0) continue;
      const ev = evaluateCandidate(legs, spot, lotSize);
      if (ev.maxProfit <= 0 || ev.profitZoneWidth <= 0) continue;
      viable.push({ ...ev, family });
    }
    const seen = new Set();
    const unique = viable.filter((c) => { const k = c.legs.map((l) => `${l.side}-${l.quantity}-${l.type}-${l.strike}`).sort().join('|'); if (seen.has(k)) return false; seen.add(k); return true; });
    const profiles = CALENDAR_PROFILES.map((profile) => {
      const ranked = [...unique].sort((a, b) => profile.score(b) - profile.score(a));
      return { key: profile.key, label: profile.label, description: profile.description, strategies: ranked.slice(0, 5).map((c, i) => ({ rank: i + 1, family: c.family, legCount: c.legs.length, legs: c.legs.map((l) => ({ side: l.side, type: l.type, strike: l.strike, quantity: l.quantity, premium: l.premium })), entryCredit: c.entryCredit, maxProfit: c.maxProfit, maxLoss: c.maxLoss, payoffAtSpot: c.payoffAtSpot, breakEvens: c.breakEvens, profitZoneWidth: c.profitZoneWidth, rewardToRisk: c.rewardToRisk, totalLots: c.totalLots, score: Number(profile.score(c).toFixed(2)) })) };
    });
    res.status(200).json({ mode: 'calendar', spot, lotSize, pricingSource, sellExpiryDays: Number((computeTimeYears(sellExpiry) * 365).toFixed(2)), buyExpiryDays: Number((computeTimeYears(buyExpiry) * 365).toFixed(2)), totalCombinationsEvaluated: candidates.length, viableCandidates: unique.length, profiles });
    return;
  }

  // -- Normal single-expiry mode --
  const startMs = Date.now();
  const families = [
    { name: 'Iron Condor', fn: () => generateIronCondors(spot, premMap, step) },
    { name: 'Iron Butterfly', fn: () => generateIronButterflies(spot, premMap, step) },
    { name: 'Jade Lizard', fn: () => generateJadeLizards(spot, premMap, step) },
    { name: 'Twisted Sister', fn: () => generateTwistedSisters(spot, premMap, step) },
    { name: 'Ratio Condor (2x)', fn: () => generateRatioCondors(spot, premMap, step) },
    { name: 'Strangle + Wings', fn: () => generateStrangleWithWings(spot, premMap, step) },
    { name: 'Ratio Spread + Hedge', fn: () => generateRatioSpreads(spot, premMap, step) },
    { name: 'Double Condor (8-leg)', fn: () => generateDoubleCondors(spot, premMap, step) },
    { name: 'Bear Call Ladder', fn: () => generateBearCallLadders(spot, premMap, step) },
    { name: 'Bull Put Ladder', fn: () => generateBullPutLadders(spot, premMap, step) },
    { name: 'Layered Condor (6-leg)', fn: () => generateLayeredCondors(spot, premMap, step) },
  ];
  let totalCombinations = 0;
  const allCandidates = [];
  const familyCounts = {};
  for (const { name, fn } of families) {
    const combos = fn();
    familyCounts[name] = combos.length;
    totalCombinations += combos.length;
    for (const legs of combos) {
      const nc = legs.reduce((s, l) => s + (l.side === 'SELL' ? l.premium * l.quantity : -l.premium * l.quantity), 0);
      if (nc <= 0) continue;
      const ev = evaluateCandidate(legs, spot, lotSize);
      if (ev.maxProfit <= 0 || ev.profitZoneWidth <= 0) continue;
      allCandidates.push({ ...ev, family: name });
    }
  }
  const seen = new Set();
  const unique = allCandidates.filter((c) => { const k = c.legs.map((l) => `${l.side}-${l.quantity}-${l.type}-${l.strike}`).sort().join('|'); if (seen.has(k)) return false; seen.add(k); return true; });
  const bestPerFamily = {};
  for (const c of unique) {
    if (!bestPerFamily[c.family] || PROFILES[0].score(c) > PROFILES[0].score(bestPerFamily[c.family])) bestPerFamily[c.family] = c;
  }
  const bestPerFamilyList = Object.entries(bestPerFamily).map(([family, c]) => ({
    family, legCount: c.legs.length,
    legs: c.legs.map(l => ({ side: l.side, type: l.type, strike: l.strike, quantity: l.quantity, premium: l.premium })),
    entryCredit: c.entryCredit, maxProfit: c.maxProfit, maxLoss: c.maxLoss, payoffAtSpot: c.payoffAtSpot,
    profitZoneWidth: c.profitZoneWidth, rewardToRisk: c.rewardToRisk, breakEvens: c.breakEvens, totalLots: c.totalLots,
  }));
  const profiles = PROFILES.map((profile) => {
    const ranked = [...unique].sort((a, b) => profile.score(b) - profile.score(a));
    return { key: profile.key, label: profile.label, description: profile.description, strategies: ranked.slice(0, 8).map((c, i) => ({ rank: i + 1, family: c.family, legCount: c.legs.length, legs: c.legs.map((l) => ({ side: l.side, type: l.type, strike: l.strike, quantity: l.quantity, premium: l.premium })), entryCredit: c.entryCredit, maxProfit: c.maxProfit, maxLoss: c.maxLoss, payoffAtSpot: c.payoffAtSpot, breakEvens: c.breakEvens, profitZoneWidth: c.profitZoneWidth, rewardToRisk: c.rewardToRisk, totalLots: c.totalLots, score: Number(profile.score(c).toFixed(2)) })) };
  });
  res.status(200).json({ mode: 'single-expiry', spot, lotSize, strikes: strikes.length, pricingSource, timeToExpiryDays: Number((timeYears * 365).toFixed(2)), totalCombinationsEvaluated: totalCombinations, viableCandidates: unique.length, computeTimeMs: Date.now() - startMs, familyCounts, bestPerFamily: bestPerFamilyList, profiles });
}
