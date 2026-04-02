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

function parseOptionalNumber(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
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

function nextTuesdayExpiries(count = 2) {
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

function parseExpiryList(raw) {
  if (!raw) return nextTuesdayExpiries(2);
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

function parseStrikeList(raw, fallbackSpot) {
  if (!raw) {
    const centeredSpot = Math.round((Number(fallbackSpot) || 0) / 50) * 50;
    return [centeredSpot - 100, centeredSpot, centeredSpot + 100];
  }
  const values = String(raw)
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
  return values.length ? values : [
    Math.round((fallbackSpot - 100) / 50) * 50,
    Math.round(fallbackSpot / 50) * 50,
    Math.round((fallbackSpot + 100) / 50) * 50,
  ];
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
  const weeklyBoost = daysToExpiry <= 2
    ? ((2 - daysToExpiry) / 2) * ((config.nearExpiryBoost + 4) / 100)
    : daysToExpiry <= 7
      ? ((7 - daysToExpiry) / 5) * (config.nearExpiryBoost / 200)
      : 0;
  const smileBoost = Math.pow(Math.max(wingDistance * 12, logMoneyness * 8), 1.1) * (config.smileFactor / 100);
  const downsideSkewBoost = type === 'PE' && strike < spot
    ? Math.pow(((spot - strike) / spot) * 10, 1.15) * (config.putSkewFactor / 100)
    : 0;
  const upsideCallBoost = type === 'CE' && strike > spot
    ? Math.pow(((strike - spot) / spot) * 10, 1.05) * ((config.putSkewFactor * 0.35) / 100)
    : 0;
  const nearExpiryAtmTaper = daysToExpiry <= 2
    ? Math.max(0, 0.018 - wingDistance * 0.12)
    : 0;

  return Math.min(
    1.4,
    Math.max(
      0.05,
      (config.baseVolatility / 100)
        + weeklyBoost
        + smileBoost
        + downsideSkewBoost
        + upsideCallBoost
        - nearExpiryAtmTaper,
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
  const { symbol = 'NIFTY', spot: spotQuery, strikes: strikesQuery, expiries: expiriesQuery, rate } = req.query;
  const config = resolveSyntheticConfig({ riskFreeRate: rate });

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
    indiaVix = config.baseVolatility;
    vixSource = 'config-fallback';
    vixWarning = error.message;
  }

  const requestedSpot = parseOptionalNumber(spotQuery);
  const referenceSpot = requestedSpot ?? liveSpot;
  const strikes = parseStrikeList(strikesQuery, referenceSpot);
  const expiries = parseExpiryList(expiriesQuery);

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
    const secondsToExpiry = Math.max(expiryUnix - Math.floor(Date.now() / 1000), 0);
    const timeYears = secondsToExpiry / (365 * 24 * 60 * 60);

    return strikes.flatMap((strike) => ['CE', 'PE'].map((type) => {
      const liveContract = contractMap.get(`${expiryLabel.replace(/ /g, '-') }|${strike}|${type}`)
        || contractMap.get(`${expiryLabel}|${strike}|${type}`)
        || contractMap.get(`${expiryNameMap.get(expiryUnix) || ''}|${strike}|${type}`)
        || null;
      const livePremium = liveContract
        ? (liveContract.price > 0 ? liveContract.price : ((liveContract.bid + liveContract.ask) > 0 ? Number(((liveContract.bid + liveContract.ask) / 2).toFixed(2)) : null))
        : null;
      const liveIv = liveContract?.iv && liveContract.iv > 0 ? Number(liveContract.iv) : null;

      const baseVolatility = liveIv ?? indiaVix ?? config.baseVolatility;
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
          : 'config-fallback-smile';
      const riskFreeRate = config.riskFreeRate / 100;

      const results = {
        intrinsic: optionIntrinsic(type, strike, referenceSpot),
        blackScholes: blackScholesPrice({ spot: referenceSpot, strike, timeYears, volatility: derivedVol, riskFreeRate, type }),
        binomialCrr: binomialCrrPrice({ spot: referenceSpot, strike, timeYears, volatility: derivedVol, riskFreeRate, type }),
        bachelier: bachelierPrice({ spot: referenceSpot, strike, timeYears, volatility: derivedVol, riskFreeRate, type }),
        monteCarlo: monteCarloGbmPrice({ spot: referenceSpot, strike, timeYears, volatility: derivedVol, riskFreeRate, type, seed: Math.round(referenceSpot + strike + expiryUnix + (type === 'CE' ? 1 : 7)) }),
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
    }));
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
    inputs: {
      riskFreeRate: config.riskFreeRate,
      baseVolatility: config.baseVolatility,
    },
    sources: {
      spot: {
        value: Number(liveSpot.toFixed(2)),
        source: liveSpotSource,
        warning: spotWarning,
      },
      volatilityIndex: {
        value: Number(indiaVix.toFixed(2)),
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