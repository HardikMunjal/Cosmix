import https from 'https';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';

const tlsAgent = new https.Agent({ rejectUnauthorized: false });
let syntheticConfigCache = null;

const FORMULAS = [
  { key: 'intrinsic', name: 'Intrinsic Value' },
  { key: 'blackScholes', name: 'Black-Scholes' },
  { key: 'binomialCrr', name: 'Binomial CRR' },
  { key: 'bachelier', name: 'Bachelier' },
  { key: 'monteCarlo', name: 'Monte Carlo GBM' },
];

const STRATEGY_FAMILIES = [
  {
    key: 'iron-condor-1x',
    name: 'Strategy 1 · 1x Wing Condor',
    description: 'Sell one call and one put around spot, then buy one farther call and one farther put to cap both tails.',
    longQuantity: 1,
    shortQuantity: 1,
  },
  {
    key: 'iron-condor-2x',
    name: 'Strategy 2 · 2x Wing Condor',
    description: 'Sell one call and one put around spot, then buy two farther calls and two farther puts for heavier crash and melt-up protection.',
    longQuantity: 2,
    shortQuantity: 1,
  },
];

const STRATEGY_PROFILES = [
  {
    key: 'balanced',
    label: 'Balanced Pick',
    description: 'Best blend of credit received, max-loss containment, and usable profit zone width.',
    score(candidate) {
      return ((Math.max(candidate.entryCredit, 0) + 1) * (candidate.profitZoneWidth + 1)) / Math.max(Math.abs(candidate.maxLoss), 1);
    },
  },
  {
    key: 'range',
    label: 'Widest Profit Range',
    description: 'Favors combinations that keep you profitable across the broadest expiry range.',
    score(candidate) {
      return candidate.profitZoneWidth * 1000 + (candidate.rewardToRisk || 0) * 10 + Math.max(candidate.entryCredit, 0);
    },
  },
  {
    key: 'credit',
    label: 'Highest Credit',
    description: 'Favors larger entry credit, accepting a tighter or sharper payoff profile.',
    score(candidate) {
      return Math.max(candidate.entryCredit, 0) * 1000 + candidate.profitZoneWidth + (candidate.rewardToRisk || 0);
    },
  },
];

function parseOptionalNumber(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStrikeGap(value) {
  const parsed = parseOptionalNumber(value);
  if (!parsed || parsed <= 0) return 100;
  return parsed;
}

function parsePositiveInteger(value, fallback) {
  const parsed = parseOptionalNumber(value);
  if (!parsed || parsed <= 0) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function loadSyntheticConfig() {
  if (syntheticConfigCache) return syntheticConfigCache;

  const merged = {};
  const envFiles = [
    path.resolve(process.cwd(), '../.env'),
    path.resolve(process.cwd(), '.env.local'),
  ];

  envFiles.forEach((file) => {
    if (!fs.existsSync(file)) return;
    const text = fs.readFileSync(file, 'utf8');
    text.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (key && value && merged[key] == null) merged[key] = value;
    });
  });

  const readNumber = (key, fallback) => {
    const raw = process.env[key] ?? merged[key];
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  syntheticConfigCache = {
    baseVolatility: readNumber('OPTIONS_BASE_IV', 18),
    nearExpiryBoost: readNumber('OPTIONS_NEAR_EXPIRY_BOOST', 6),
    smileFactor: readNumber('OPTIONS_SMILE_FACTOR', 18),
    putSkewFactor: readNumber('OPTIONS_PUT_SKEW_FACTOR', 4),
    riskFreeRate: readNumber('OPTIONS_RISK_FREE_RATE', 6),
  };
  return syntheticConfigCache;
}

function resolveSyntheticConfig(overrides = {}) {
  const base = loadSyntheticConfig();
  const next = { ...base };
  Object.entries(overrides).forEach(([key, value]) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) next[key] = parsed;
  });
  return next;
}

function nodeGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    function doRequest(targetUrl, hops) {
      const parsed = new URL(targetUrl);
      const req = https.request({
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: { 'Accept-Encoding': 'identity', ...headers },
        agent: tlsAgent,
      }, (response) => {
        if ([301, 302, 307, 308].includes(response.statusCode) && hops > 0 && response.headers.location) {
          response.resume();
          const nextUrl = /^https?:\/\//i.test(response.headers.location)
            ? response.headers.location
            : `https://${parsed.hostname}${response.headers.location}`;
          doRequest(nextUrl, hops - 1);
          return;
        }

        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const encoding = (response.headers['content-encoding'] || '').toLowerCase();
          const decompress = encoding === 'gzip' ? zlib.gunzipSync
            : encoding === 'deflate' ? zlib.inflateSync
              : encoding === 'br' ? zlib.brotliDecompressSync
                : null;
          const body = decompress ? decompress(buffer).toString('utf8') : buffer.toString('utf8');
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            headers: response.headers,
            text: () => body,
            json: () => JSON.parse(body),
          });
        });
      });

      req.on('error', reject);
      req.end();
    }

    doRequest(url, 3);
  });
}

function extractSetCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0].trim());
  }
  if (typeof response.headers.get === 'function') {
    const setCookie = response.headers.get('set-cookie');
    if (!setCookie) return [];
    return setCookie.split(/,(?=\s*[\w-]+=)/).map((cookie) => cookie.split(';')[0].trim()).filter(Boolean);
  }
  const setCookie = response.headers['set-cookie'];
  if (!setCookie) return [];
  if (Array.isArray(setCookie)) return setCookie.map((cookie) => cookie.split(';')[0].trim());
  return [setCookie.split(';')[0].trim()];
}

function mergeCookieStrings(...parts) {
  const map = {};
  parts.flat().forEach((cookie) => {
    const eq = cookie.indexOf('=');
    if (eq === -1) return;
    const key = cookie.slice(0, eq).trim();
    map[key] = cookie;
  });
  return Object.values(map).join('; ');
}

function nseToUnix(value) {
  const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const parts = String(value || '').split('-');
  if (parts.length === 3 && months[parts[1]] !== undefined) {
    return Math.floor(new Date(Number(parts[2]), months[parts[1]], Number(parts[0])).getTime() / 1000);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : Math.floor(date.getTime() / 1000);
}

function formatExpiryLabel(unix) {
  const date = new Date(unix * 1000);
  const day = String(date.getDate()).padStart(2, '0');
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()];
  return `${day} ${month} ${date.getFullYear()}`;
}

function nextTuesdayExpiries(count = 1) {
  const expiries = [];
  const cursor = new Date();
  cursor.setHours(23, 59, 59, 0);
  while (expiries.length < count) {
    cursor.setDate(cursor.getDate() + 1);
    if (cursor.getDay() === 2) {
      expiries.push(Math.floor(cursor.getTime() / 1000));
    }
  }
  return expiries;
}

function parseExpiryList(raw, expiryCount) {
  if (!raw) return nextTuesdayExpiries(expiryCount);
  return String(raw)
    .split(',')
    .map((value) => value.trim())
    .map((value) => {
      if (!value) return null;
      if (/^\d+$/.test(value)) {
        const numeric = Number(value);
        return numeric > 1e12 ? Math.floor(numeric / 1000) : numeric;
      }
      return nseToUnix(value);
    })
    .filter((value) => Number.isFinite(value));
}

function parseStrikeList(raw, fallbackSpot, strikeGap, strikeLevelsEachSide) {
  const buildCenteredStrikes = (spotValue) => {
    const centeredSpot = Math.round((Number(spotValue) || 0) / 50) * 50;
    const strikes = [];
    for (let offset = strikeLevelsEachSide; offset >= 1; offset -= 1) {
      strikes.push(centeredSpot - offset * strikeGap);
    }
    strikes.push(centeredSpot);
    for (let offset = 1; offset <= strikeLevelsEachSide; offset += 1) {
      strikes.push(centeredSpot + offset * strikeGap);
    }
    return [...new Set(strikes)].sort((left, right) => left - right);
  };

  if (!raw) {
    return buildCenteredStrikes(fallbackSpot);
  }
  const values = String(raw)
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
  return values.length ? values : buildCenteredStrikes(fallbackSpot);
}

function parseScenarioSpotList(raw) {
  if (!raw) return [];
  return [...new Set(
    String(raw)
      .split(',')
      .map((value) => parseOptionalNumber(value))
      .filter((value) => Number.isFinite(value) && value >= 0)
      .map((value) => Number(value.toFixed(2))),
  )].sort((left, right) => left - right);
}

function normalPdf(x) {
  return Math.exp((-0.5) * x * x) / Math.sqrt(2 * Math.PI);
}

function normalCdf(x) {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * absX);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return 0.5 * (1 + sign * erf);
}

function optionIntrinsic(type, strike, spot) {
  return type === 'CE' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
}

function legPayoffAtExpiry(leg, spot) {
  const intrinsic = optionIntrinsic(leg.type, leg.strike, spot);
  const signedPremium = leg.side === 'SELL' ? leg.premium : -leg.premium;
  const signedIntrinsic = leg.side === 'SELL' ? -intrinsic : intrinsic;
  return (signedPremium + signedIntrinsic) * leg.quantity;
}

function findBreakEvens(points) {
  const breakEvens = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous.value === 0) {
      breakEvens.push(previous.spot);
      continue;
    }
    if ((previous.value < 0 && current.value > 0) || (previous.value > 0 && current.value < 0)) {
      const ratio = Math.abs(previous.value) / (Math.abs(previous.value) + Math.abs(current.value));
      breakEvens.push(Number((previous.spot + (current.spot - previous.spot) * ratio).toFixed(2)));
    }
  }
  return [...new Set(breakEvens.map((value) => Number(value.toFixed(2))))];
}

function buildZones(points, predicate) {
  const zones = [];
  let start = null;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const matches = predicate(point.value);
    if (matches && start == null) {
      start = point.spot;
    }
    if (!matches && start != null) {
      zones.push({ from: start, to: points[index - 1].spot });
      start = null;
    }
  }
  if (start != null) {
    zones.push({ from: start, to: points[points.length - 1].spot });
  }
  return zones;
}

function sumZoneWidths(zones) {
  return Number(zones.reduce((sum, zone) => sum + Math.max(zone.to - zone.from, 0), 0).toFixed(2));
}

function buildStrikeUniverse({ chainData, expiryNameMap, expiries, referenceSpot, strikes, strikeGap }) {
  return expiries.map((expiryUnix) => {
    const expiryLabel = expiryNameMap.get(expiryUnix);
    const centeredSpot = Math.round((referenceSpot || 0) / strikeGap) * strikeGap;
    const chainStrikes = expiryLabel && chainData
      ? chainData.rows
        .filter((row) => row.expiryDate === expiryLabel)
        .map((row) => Number(row.strikePrice))
        .filter((value) => Number.isFinite(value) && Math.abs(value - referenceSpot) <= Math.max(strikeGap * 15, 1500))
      : [];

    const fallbackCentered = [];
    for (let step = 1; step <= 10; step += 1) {
      fallbackCentered.push(centeredSpot - strikeGap * step);
      fallbackCentered.push(centeredSpot + strikeGap * step);
    }
    fallbackCentered.push(centeredSpot);

    return {
      expiryUnix,
      strikes: [...new Set((chainStrikes.length ? chainStrikes : [...strikes, ...fallbackCentered]).map((value) => Number(value).toFixed(2)))]
        .map(Number)
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((left, right) => left - right),
    };
  });
}

function resolveLiveContract(contractMap, expiryLabel, expiryUnix, strike, type) {
  return contractMap.get(`${expiryLabel.replace(/ /g, '-')}|${strike}|${type}`)
    || contractMap.get(`${expiryLabel}|${strike}|${type}`)
    || contractMap.get(`${formatExpiryLabel(expiryUnix)}|${strike}|${type}`)
    || null;
}

function resolvePremiumValue(liveContract) {
  if (!liveContract) return null;
  if (liveContract.price > 0) return Number(liveContract.price.toFixed(2));
  if ((liveContract.bid + liveContract.ask) > 0) return Number((((liveContract.bid + liveContract.ask) / 2)).toFixed(2));
  return null;
}

function buildContractSnapshot({
  referenceSpot,
  expiryUnix,
  expiryLabel,
  strike,
  type,
  liveContract,
  indiaVix,
  manualVolatility,
  config,
  includeLivePremium = true,
}) {
  const secondsToExpiry = Math.max(expiryUnix - Math.floor(Date.now() / 1000), 0);
  const timeYears = secondsToExpiry / (365 * 24 * 60 * 60);
  const livePremium = includeLivePremium ? resolvePremiumValue(liveContract) : null;
  const liveIv = liveContract?.iv && liveContract.iv > 0 ? Number(liveContract.iv) : null;

  const baseVolatility = liveIv ?? indiaVix ?? manualVolatility ?? config.baseVolatility;
  const derivedVol = getTheoreticalVolatility({
    spot: referenceSpot,
    strike,
    timeYears,
    type,
    config: {
      ...config,
      baseVolatility,
    },
  });
  const volatilitySource = liveIv != null
    ? 'nse-implied-volatility'
    : indiaVix != null
      ? 'india-vix-derived-smile'
      : manualVolatility != null
        ? 'manual-iv-override-smile'
        : 'config-fallback-smile';
  const riskFreeRate = config.riskFreeRate / 100;

  const results = {
    intrinsic: optionIntrinsic(type, strike, referenceSpot),
    blackScholes: blackScholesPrice({ spot: referenceSpot, strike, timeYears, volatility: derivedVol, riskFreeRate, type }),
    binomialCrr: binomialCrrPrice({ spot: referenceSpot, strike, timeYears, volatility: derivedVol, riskFreeRate, type }),
    bachelier: bachelierPrice({ spot: referenceSpot, strike, timeYears, volatility: derivedVol, riskFreeRate, type }),
    monteCarlo: monteCarloGbmPrice({
      spot: referenceSpot,
      strike,
      timeYears,
      volatility: derivedVol,
      riskFreeRate,
      type,
      seed: Math.round(referenceSpot + strike + expiryUnix + (type === 'CE' ? 1 : 7)),
    }),
  };

  const formulaResults = FORMULAS.map((formula) => ({
    key: formula.key,
    name: formula.name,
    price: Number(results[formula.key].toFixed(2)),
  }));

  return {
    expiryUnix,
    expiryLabel,
    strike,
    type,
    livePremium: livePremium != null ? Number(livePremium.toFixed(2)) : null,
    liveIv,
    appliedVolatility: Number((derivedVol * 100).toFixed(2)),
    volatilitySource,
    openInterest: liveContract?.oi ?? null,
    timeToExpiryDays: Number((timeYears * 365).toFixed(2)),
    formulaResults,
  };
}

function buildStrategyPremiumLookup({ strikeUniverse, expiryNameMap, contractMap, referenceSpot, indiaVix, manualVolatility, config }) {
  const lookup = new Map();

  strikeUniverse.forEach((expiryEntry) => {
    const expiryUnix = expiryEntry.expiryUnix;
    const expiryLabel = expiryNameMap.get(expiryUnix) || formatExpiryLabel(expiryUnix);
    const secondsToExpiry = Math.max(expiryUnix - Math.floor(Date.now() / 1000), 0);
    const timeYears = secondsToExpiry / (365 * 24 * 60 * 60);
    const riskFreeRate = config.riskFreeRate / 100;

    expiryEntry.strikes.forEach((strike) => {
      ['CE', 'PE'].forEach((type) => {
        const liveContract = resolveLiveContract(contractMap, expiryLabel, expiryUnix, strike, type);
        const livePremium = resolvePremiumValue(liveContract);
        const liveIv = liveContract?.iv && liveContract.iv > 0 ? Number(liveContract.iv) : null;
        const baseVolatility = liveIv ?? indiaVix ?? manualVolatility ?? config.baseVolatility;
        const derivedVol = getTheoreticalVolatility({
          spot: referenceSpot,
          strike,
          timeYears,
          type,
          config: {
            ...config,
            baseVolatility,
          },
        });
        const blackScholesPremium = Number(blackScholesPrice({
          spot: referenceSpot,
          strike,
          timeYears,
          volatility: derivedVol,
          riskFreeRate,
          type,
        }).toFixed(2));
        const premium = livePremium ?? blackScholesPremium;

        lookup.set(`${expiryUnix}|${strike}|${type}`, {
          premium,
          source: livePremium != null ? 'live-premium' : 'black-scholes-fallback',
          livePremium,
          blackScholesPremium,
          appliedVolatility: Number((derivedVol * 100).toFixed(2)),
        });
      });
    });
  });

  return lookup;
}

function resolveNearestAtOrAbove(strikes, target) {
  return strikes.find((strike) => strike >= target) ?? null;
}

function resolveNearestAtOrBelow(strikes, target) {
  for (let index = strikes.length - 1; index >= 0; index -= 1) {
    if (strikes[index] <= target) return strikes[index];
  }
  return null;
}

function buildPayoffPoints(legs, strikeGap) {
  const orderedStrikes = legs.map((leg) => leg.strike).sort((left, right) => left - right);
  const start = Math.max(0, orderedStrikes[0] - strikeGap * 6);
  const end = orderedStrikes[orderedStrikes.length - 1] + strikeGap * 6;
  const step = Math.max(25, Math.round(strikeGap / 2));
  const points = [];
  for (let spot = start; spot <= end; spot += step) {
    const payoff = legs.reduce((sum, leg) => sum + legPayoffAtExpiry(leg, spot), 0);
    points.push({ spot, value: Number(payoff.toFixed(2)) });
  }
  return points;
}

function buildStrategyCandidate({ family, shortCallStrike, shortPutStrike, longCallStrike, longPutStrike, premiumLookup, expiryUnix, referenceSpot, strikeGap }) {
  const legDefs = [
    { side: 'SELL', type: 'CE', quantity: family.shortQuantity, strike: shortCallStrike },
    { side: 'SELL', type: 'PE', quantity: family.shortQuantity, strike: shortPutStrike },
    { side: 'BUY', type: 'CE', quantity: family.longQuantity, strike: longCallStrike },
    { side: 'BUY', type: 'PE', quantity: family.longQuantity, strike: longPutStrike },
  ];

  const legs = [];
  let premiumSources = new Set();
  for (const leg of legDefs) {
    const premiumEntry = premiumLookup.get(`${expiryUnix}|${leg.strike}|${leg.type}`);
    if (!premiumEntry) return null;
    premiumSources.add(premiumEntry.source);
    legs.push({
      ...leg,
      premium: premiumEntry.premium,
      premiumSource: premiumEntry.source,
    });
  }

  const points = buildPayoffPoints(legs, strikeGap);
  const pointValues = points.map((point) => point.value);
  const maxProfit = Number(Math.max(...pointValues).toFixed(2));
  const maxLoss = Number(Math.min(...pointValues).toFixed(2));
  const breakEvens = findBreakEvens(points);
  const profitZones = buildZones(points, (value) => value > 0);
  const lossZones = buildZones(points, (value) => value < 0);
  const entryCredit = Number(legs.reduce((sum, leg) => sum + (leg.side === 'SELL' ? leg.premium * leg.quantity : -leg.premium * leg.quantity), 0).toFixed(2));
  const payoffAtSpot = Number(legs.reduce((sum, leg) => sum + legPayoffAtExpiry(leg, referenceSpot), 0).toFixed(2));
  const profitZoneWidth = sumZoneWidths(profitZones);
  const rewardToRisk = maxLoss < 0 ? Number((maxProfit / Math.abs(maxLoss)).toFixed(2)) : null;

  return {
    strategyKey: family.key,
    legs,
    shortDistance: shortCallStrike - referenceSpot,
    wingWidth: longCallStrike - shortCallStrike,
    entryCredit,
    payoffAtSpot,
    maxProfit,
    maxLoss,
    breakEvens,
    profitZones,
    lossZones,
    profitZoneWidth,
    rewardToRisk,
    premiumMode: premiumSources.size === 1 ? [...premiumSources][0] : 'mixed',
  };
}

function uniqueByLegs(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = candidate.legs.map((leg) => `${leg.side}-${leg.quantity}-${leg.type}-${leg.strike}`).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildStrategySuggestions({ expiries, strikeUniverse, referenceSpot, strikeGap, premiumLookup }) {
  return expiries.map((expiryUnix) => {
    const availableStrikes = strikeUniverse.find((entry) => entry.expiryUnix === expiryUnix)?.strikes || [];
    const familySuggestions = STRATEGY_FAMILIES.map((family) => {
      const candidates = [];
      for (let shortSteps = 1; shortSteps <= 6; shortSteps += 1) {
        for (let wingSteps = 1; wingSteps <= 8; wingSteps += 1) {
          const shortCallStrike = resolveNearestAtOrAbove(availableStrikes, referenceSpot + shortSteps * strikeGap);
          const shortPutStrike = resolveNearestAtOrBelow(availableStrikes, referenceSpot - shortSteps * strikeGap);
          const longCallStrike = resolveNearestAtOrAbove(availableStrikes, referenceSpot + (shortSteps + wingSteps) * strikeGap);
          const longPutStrike = resolveNearestAtOrBelow(availableStrikes, referenceSpot - (shortSteps + wingSteps) * strikeGap);

          if (![shortCallStrike, shortPutStrike, longCallStrike, longPutStrike].every(Number.isFinite)) continue;
          if (!(longCallStrike > shortCallStrike && longPutStrike < shortPutStrike)) continue;

          const candidate = buildStrategyCandidate({
            family,
            shortCallStrike,
            shortPutStrike,
            longCallStrike,
            longPutStrike,
            premiumLookup,
            expiryUnix,
            referenceSpot,
            strikeGap,
          });

          if (!candidate) continue;
          if (candidate.maxProfit <= 0 || candidate.profitZoneWidth <= 0) continue;
          candidates.push(candidate);
        }
      }

      const uniqueCandidates = uniqueByLegs(candidates);
      const profiles = STRATEGY_PROFILES.map((profile) => {
        const ranked = [...uniqueCandidates].sort((left, right) => profile.score(right) - profile.score(left));
        const best = ranked[0] || null;
        if (!best) return null;
        return {
          key: profile.key,
          label: profile.label,
          description: profile.description,
          ...best,
        };
      }).filter(Boolean);

      return {
        key: family.key,
        name: family.name,
        description: family.description,
        profiles,
      };
    }).filter((family) => family.profiles.length > 0);

    return {
      expiryUnix,
      families: familySuggestions,
    };
  }).filter((entry) => entry.families.length > 0);
}

function blackScholesPrice({ spot, strike, timeYears, volatility, riskFreeRate, type }) {
  const intrinsic = optionIntrinsic(type, strike, spot);
  if (!timeYears || timeYears <= 0 || !volatility || volatility <= 0) return intrinsic;
  const sigmaSqrtT = volatility * Math.sqrt(timeYears);
  if (!sigmaSqrtT) return intrinsic;
  const d1 = (Math.log(spot / strike) + (riskFreeRate + (volatility * volatility) / 2) * timeYears) / sigmaSqrtT;
  const d2 = d1 - sigmaSqrtT;
  if (type === 'CE') {
    return spot * normalCdf(d1) - strike * Math.exp(-riskFreeRate * timeYears) * normalCdf(d2);
  }
  return strike * Math.exp(-riskFreeRate * timeYears) * normalCdf(-d2) - spot * normalCdf(-d1);
}

function binomialCrrPrice({ spot, strike, timeYears, volatility, riskFreeRate, type, steps = 125 }) {
  const intrinsic = optionIntrinsic(type, strike, spot);
  if (!timeYears || timeYears <= 0 || !volatility || volatility <= 0) return intrinsic;
  const dt = timeYears / steps;
  const up = Math.exp(volatility * Math.sqrt(dt));
  const down = 1 / up;
  const growth = Math.exp(riskFreeRate * dt);
  const probability = (growth - down) / (up - down);
  const boundedProbability = Math.min(1, Math.max(0, probability));
  const values = [];

  for (let i = 0; i <= steps; i += 1) {
    const terminalSpot = spot * (up ** (steps - i)) * (down ** i);
    values[i] = optionIntrinsic(type, strike, terminalSpot);
  }

  for (let step = steps - 1; step >= 0; step -= 1) {
    for (let i = 0; i <= step; i += 1) {
      values[i] = Math.exp(-riskFreeRate * dt) * (
        boundedProbability * values[i] + (1 - boundedProbability) * values[i + 1]
      );
    }
  }

  return values[0];
}

function bachelierPrice({ spot, strike, timeYears, volatility, riskFreeRate, type }) {
  const intrinsic = optionIntrinsic(type, strike, spot);
  if (!timeYears || timeYears <= 0 || !volatility || volatility <= 0) return intrinsic;
  const discountFactor = Math.exp(-riskFreeRate * timeYears);
  const forward = spot * Math.exp(riskFreeRate * timeYears);
  const sigmaAbs = Math.max(spot * volatility, 1e-9);
  const sigmaT = sigmaAbs * Math.sqrt(timeYears);
  const diff = forward - strike;
  const d = diff / sigmaT;
  if (type === 'CE') {
    return discountFactor * ((diff * normalCdf(d)) + sigmaT * normalPdf(d));
  }
  return discountFactor * (((strike - forward) * normalCdf(-d)) + sigmaT * normalPdf(d));
}

function createSeededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function monteCarloGbmPrice({ spot, strike, timeYears, volatility, riskFreeRate, type, paths = 6000, seed = 22600 }) {
  const intrinsic = optionIntrinsic(type, strike, spot);
  if (!timeYears || timeYears <= 0 || !volatility || volatility <= 0) return intrinsic;
  const random = createSeededRandom(seed);
  let total = 0;
  for (let i = 0; i < paths; i += 1) {
    const u1 = Math.max(random(), 1e-12);
    const u2 = Math.max(random(), 1e-12);
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const terminalSpot = spot * Math.exp((riskFreeRate - 0.5 * volatility * volatility) * timeYears + volatility * Math.sqrt(timeYears) * z);
    total += optionIntrinsic(type, strike, terminalSpot);
  }
  return Math.exp(-riskFreeRate * timeYears) * (total / paths);
}

function getTheoreticalVolatility({ spot, strike, timeYears, type, config }) {
  const daysToExpiry = timeYears * 365;
  const wingDistance = Math.abs(strike - spot) / spot;
  const logMoneyness = Math.abs(Math.log(strike / spot));
  const upsideDistance = Math.max((strike - spot) / spot, 0);
  const downsideDistance = Math.max((spot - strike) / spot, 0);
  const weeklyBoost = daysToExpiry <= 2
    ? ((2 - daysToExpiry) / 2) * ((config.nearExpiryBoost + 4) / 100)
    : daysToExpiry <= 7
      ? ((7 - daysToExpiry) / 5) * (config.nearExpiryBoost / 200)
      : 0;
  const baseWingBoost = Math.pow(Math.max(wingDistance * 10, logMoneyness * 7), 1.08);
  const downsidePutBoost = type === 'PE' && strike < spot
    ? baseWingBoost * ((config.smileFactor * 1.05) / 100)
    : 0;
  const upsideCallWingBoost = type === 'CE' && strike > spot
    ? baseWingBoost * ((config.smileFactor * 0.12) / 100)
    : 0;
  const mildOppositeWingBoost = ((type === 'CE' && strike < spot) || (type === 'PE' && strike > spot))
    ? baseWingBoost * ((config.smileFactor * 0.04) / 100)
    : 0;
  const downsideSkewBoost = type === 'PE' && strike < spot
    ? Math.pow(((spot - strike) / spot) * 10, 1.15) * (config.putSkewFactor / 100)
    : 0;
  const upsideCallSkewBoost = type === 'CE' && strike > spot
    ? Math.pow(((strike - spot) / spot) * 10, 1.05) * ((config.putSkewFactor * 0.35) / 100)
    : 0;
  const nearExpiryAtmTaper = daysToExpiry <= 2
    ? Math.max(0, 0.018 - wingDistance * 0.12)
    : 0;
  const nearExpiryFarCallTaper = type === 'CE' && strike > spot
    ? Math.pow(upsideDistance * 10, 1.12) * (daysToExpiry <= 7 ? 0.16 : 0.07)
    : 0;
  const nearExpiryFarPutTaper = type === 'PE' && strike < spot
    ? Math.pow(downsideDistance * 10, 1.02) * (daysToExpiry <= 7 ? 0.035 : 0.015)
    : 0;

  return Math.min(
    1.4,
    Math.max(
      0.05,
      (config.baseVolatility / 100)
        + weeklyBoost
        + downsidePutBoost
        + upsideCallWingBoost
        + mildOppositeWingBoost
        + downsideSkewBoost
        + upsideCallSkewBoost
        - nearExpiryAtmTaper
        - nearExpiryFarCallTaper
        - nearExpiryFarPutTaper,
    ),
  );
}

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

async function fetchNseOptionChain(symbol) {
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  const baseHeaders = {
    'User-Agent': userAgent,
    'Accept-Language': 'en-IN,en;q=0.9',
    'Accept-Encoding': 'identity',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };

  let cookieString = '';
  try {
    const homeResponse = await nodeGet('https://www.nseindia.com/', {
      ...baseHeaders,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'Upgrade-Insecure-Requests': '1',
    });
    const homeCookies = extractSetCookies(homeResponse);
    const optionChainResponse = await nodeGet('https://www.nseindia.com/option-chain', {
      ...baseHeaders,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      Referer: 'https://www.nseindia.com/',
      Cookie: mergeCookieStrings(homeCookies),
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'same-origin',
      'Upgrade-Insecure-Requests': '1',
    });
    const optionChainCookies = extractSetCookies(optionChainResponse);
    cookieString = mergeCookieStrings(homeCookies, optionChainCookies);
  } catch (_) {
  }

  const response = await nodeGet(`https://www.nseindia.com/api/option-chain-indices?symbol=${encodeURIComponent(symbol)}`, {
    ...baseHeaders,
    Accept: 'application/json, text/plain, */*',
    Referer: 'https://www.nseindia.com/option-chain',
    'X-Requested-With': 'XMLHttpRequest',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    ...(cookieString && { Cookie: cookieString }),
  });

  if (!response.ok) throw new Error(`NSE HTTP ${response.status}`);
  const payload = response.json();
  const records = payload?.records;
  if (!records?.data?.length) throw new Error('Empty NSE response');
  return {
    spot: records.underlyingValue ?? null,
    expiryDates: records.expiryDates || [],
    rows: records.data,
  };
}

function toContractMap(rows) {
  const contractMap = new Map();
  rows.forEach((row) => {
    if (row.CE) {
      contractMap.set(`${row.expiryDate}|${row.strikePrice}|CE`, {
        price: row.CE.lastPrice ?? 0,
        bid: row.CE.bidprice ?? 0,
        ask: row.CE.askPrice ?? 0,
        iv: row.CE.impliedVolatility ?? 0,
        oi: row.CE.openInterest ?? 0,
      });
    }
    if (row.PE) {
      contractMap.set(`${row.expiryDate}|${row.strikePrice}|PE`, {
        price: row.PE.lastPrice ?? 0,
        bid: row.PE.bidprice ?? 0,
        ask: row.PE.askPrice ?? 0,
        iv: row.PE.impliedVolatility ?? 0,
        oi: row.PE.openInterest ?? 0,
      });
    }
  });
  return contractMap;
}

export default async function handler(req, res) {
  const {
    symbol = 'NIFTY',
    spot: spotQuery,
    strikes: strikesQuery,
    expiries: expiriesQuery,
    iv,
    rate,
    strikeGap: strikeGapQuery,
    strikeLevels: strikeLevelsQuery,
    expiryCount: expiryCountQuery,
  } = req.query;
  const config = resolveSyntheticConfig({ riskFreeRate: rate });
  const manualVolatility = parseOptionalNumber(iv);
  const strikeGap = parseStrikeGap(strikeGapQuery);
  const strikeLevelsEachSide = parsePositiveInteger(strikeLevelsQuery, 3);
  const expiryCount = parsePositiveInteger(expiryCountQuery, 1);
  const scenarioSpots = parseScenarioSpotList(req.query.scenarioSpots);

  let liveSpot = null;
  let liveSpotSource = 'manual-input';
  let spotWarning = '';
  try {
    liveSpot = await fetchYahooPrice('^NSEI');
    liveSpotSource = 'yahoo-finance-public:^NSEI';
  } catch (error) {
    liveSpot = 22600;
    liveSpotSource = 'fallback-spot';
    spotWarning = error.message;
  }

  let indiaVix = null;
  let vixSource = 'not-available';
  let vixWarning = '';
  try {
    indiaVix = await fetchYahooPrice('^INDIAVIX');
    vixSource = 'yahoo-finance-public:^INDIAVIX';
  } catch (error) {
    indiaVix = null;
    vixSource = manualVolatility != null ? 'manual-iv-override' : 'config-fallback';
    vixWarning = error.message;
  }

  const requestedSpot = parseOptionalNumber(spotQuery);
  const referenceSpot = requestedSpot ?? liveSpot;
  const strikes = parseStrikeList(strikesQuery, referenceSpot, strikeGap, strikeLevelsEachSide);
  const expiries = parseExpiryList(expiriesQuery, expiryCount);

  let chainData = null;
  let chainSource = 'unavailable';
  let chainWarning = '';
  try {
    chainData = await fetchNseOptionChain(String(symbol).toUpperCase());
    chainSource = 'nse-public-options-chain';
  } catch (error) {
    chainWarning = error.message;
  }

  const contractMap = chainData ? toContractMap(chainData.rows) : new Map();
  const expiryNameMap = new Map((chainData?.expiryDates || []).map((label) => [nseToUnix(label), label]));

  const contracts = expiries.flatMap((expiryUnix) => {
    const expiryLabel = expiryNameMap.get(expiryUnix) || formatExpiryLabel(expiryUnix);

    return strikes.flatMap((strike) => ['CE', 'PE'].map((type) => {
      const liveContract = resolveLiveContract(contractMap, expiryLabel, expiryUnix, strike, type);
      return buildContractSnapshot({
        referenceSpot,
        expiryUnix,
        expiryLabel,
        strike,
        type,
        liveContract,
        indiaVix,
        manualVolatility,
        config,
        includeLivePremium: true,
      });
    }));
  });

  const scenarioContracts = scenarioSpots.map((scenarioSpot) => ({
    spot: Number(scenarioSpot.toFixed(2)),
    contracts: expiries.flatMap((expiryUnix) => {
      const expiryLabel = expiryNameMap.get(expiryUnix) || formatExpiryLabel(expiryUnix);
      return strikes.flatMap((strike) => ['CE', 'PE'].map((type) => {
        const liveContract = resolveLiveContract(contractMap, expiryLabel, expiryUnix, strike, type);
        return buildContractSnapshot({
          referenceSpot: scenarioSpot,
          expiryUnix,
          expiryLabel,
          strike,
          type,
          liveContract,
          indiaVix,
          manualVolatility,
          config,
          includeLivePremium: false,
        });
      }));
    }),
  }));

  const strikeUniverse = buildStrikeUniverse({
    chainData,
    expiryNameMap,
    expiries,
    referenceSpot,
    strikes,
    strikeGap,
  });
  const premiumLookup = buildStrategyPremiumLookup({
    strikeUniverse,
    expiryNameMap,
    contractMap,
    referenceSpot,
    indiaVix,
    manualVolatility,
    config,
  });
  const strategySuggestions = buildStrategySuggestions({
    expiries,
    strikeUniverse,
    referenceSpot,
    strikeGap,
    premiumLookup,
  });

  res.status(200).json({
    symbol: String(symbol).toUpperCase(),
    referenceSpot: Number(referenceSpot.toFixed(2)),
    liveSpot: Number(liveSpot.toFixed(2)),
    strikes,
    expiries: expiries.map((expiryUnix) => ({
      unix: expiryUnix,
      label: expiryNameMap.get(expiryUnix) || formatExpiryLabel(expiryUnix),
    })),
    formulas: FORMULAS,
    contracts,
    scenarioContracts,
    strategySuggestions,
    inputs: {
      riskFreeRate: config.riskFreeRate,
      baseVolatility: config.baseVolatility,
      strikeGap,
      strikeLevelsEachSide,
      expiryCount,
    },
    sources: {
      spot: {
        value: Number(liveSpot.toFixed(2)),
        source: liveSpotSource,
        warning: spotWarning,
      },
      volatilityIndex: {
        value: Number((indiaVix ?? manualVolatility ?? config.baseVolatility).toFixed(2)),
        source: vixSource,
        warning: vixWarning,
      },
      optionsChain: {
        source: chainSource,
        warning: chainWarning,
      },
      riskFreeRate: {
        value: config.riskFreeRate,
        source: Number.isFinite(Number(rate)) ? 'query-override' : 'config-fallback',
        note: 'An open public live India risk-free rate feed is not wired yet; this uses the configured fallback unless you override rate in the request.',
      },
      candidateOpenSources: [
        'Yahoo Finance public chart API for NIFTY (^NSEI) spot',
        'Yahoo Finance public chart API for INDIA VIX (^INDIAVIX)',
        'NSE public options chain for per-strike implied volatility and live premium',
        'RBI public datasets can be used later for live sovereign rates',
      ],
    },
  });
}