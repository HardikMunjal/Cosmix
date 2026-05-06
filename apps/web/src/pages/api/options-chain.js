import https from 'https';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';

// Next.js built-in fetch (undici) ignores NODE_TLS_REJECT_UNAUTHORIZED.
// Use Node's https module directly so rejectUnauthorized:false actually works.
const _tlsAgent = new https.Agent({ rejectUnauthorized: false });
let _syntheticConfigCache = null;

function loadSyntheticConfig() {
  if (_syntheticConfigCache) return _syntheticConfigCache;

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

  _syntheticConfigCache = {
    baseVolatility: readNumber('OPTIONS_BASE_IV', 18),
    nearExpiryBoost: readNumber('OPTIONS_NEAR_EXPIRY_BOOST', 6),
    smileFactor: readNumber('OPTIONS_SMILE_FACTOR', 18),
    putSkewFactor: readNumber('OPTIONS_PUT_SKEW_FACTOR', 4),
    riskFreeRate: readNumber('OPTIONS_RISK_FREE_RATE', 6),
  };
  return _syntheticConfigCache;
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
    function doReq(url, hops) {
      const u = new URL(url);
      const req = https.request({
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'GET',
        headers: { 'Accept-Encoding': 'identity', ...headers },
        agent: _tlsAgent,
      }, (res) => {
        // Follow redirects (NSE homepage may redirect)
        if ([301, 302, 307, 308].includes(res.statusCode) && hops > 0 && res.headers.location) {
          res.resume();
          const next = /^https?:\/\//i.test(res.headers.location)
            ? res.headers.location
            : `https://${u.hostname}${res.headers.location}`;
          doReq(next, hops - 1);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const enc = (res.headers['content-encoding'] || '').toLowerCase();
          const decompress = enc === 'gzip' ? zlib.gunzipSync :
                             enc === 'deflate' ? zlib.inflateSync :
                             enc === 'br' ? zlib.brotliDecompressSync : null;
          const body = decompress ? decompress(buf).toString('utf8') : buf.toString('utf8');
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            headers: res.headers,
            text: () => body,
            json: () => JSON.parse(body),
          });
        });
      });
      req.on('error', reject);
      req.end();
    }
    doReq(url, 3);
  });
}

async function fetchYahooPrice(symbol) {
  const response = await nodeGet(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&includePrePost=false`,
    { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
  );
  if (!response.ok) throw new Error(`Yahoo response ${response.status}`);
  const payload = response.json();
  const price = payload?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (!Number.isFinite(price)) throw new Error('Yahoo payload missing price');
  return Number(price);
}

// ── Parse "27-Mar-2025" (NSE date format) → unix seconds
function nseToUnix(s) {
  const mo = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const p = s.split('-');
  if (p.length === 3 && mo[p[1]] !== undefined) {
    return Math.floor(new Date(+p[2], mo[p[1]], +p[0]).getTime() / 1000);
  }
  const d = new Date(s);
  return isNaN(d) ? null : Math.floor(d.getTime() / 1000);
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

function blackScholesPrice({ spot, strike, timeYears, volatility, riskFreeRate, type }) {
  const intrinsic = type === 'CE'
    ? Math.max(spot - strike, 0)
    : Math.max(strike - spot, 0);
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
    ? Math.max(0, (0.018 - wingDistance * 0.12))
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
        - nearExpiryAtmTaper,
        - nearExpiryFarCallTaper
        - nearExpiryFarPutTaper,
    ),
  );
}

// Build theoretical strikes using Black-Scholes.
function buildSyntheticStrikes(spot, expiryUnix, config) {
  const base = Math.round(spot / 50) * 50;
  const out = [];
  const secondsToExpiry = Math.max(expiryUnix - Math.floor(Date.now() / 1000), 0);
  const timeYears = secondsToExpiry / (365 * 24 * 60 * 60);

  for (let strike = base - 2500; strike <= base + 2500; strike += 50) {
    const ceVol = getTheoreticalVolatility({ spot, strike, timeYears, type: 'CE', config });
    const peVol = getTheoreticalVolatility({ spot, strike, timeYears, type: 'PE', config });
    const cePrice = +blackScholesPrice({
      spot,
      strike,
      timeYears,
      volatility: ceVol,
      riskFreeRate: config.riskFreeRate / 100,
      type: 'CE',
    }).toFixed(2);
    const pePrice = +blackScholesPrice({
      spot,
      strike,
      timeYears,
      volatility: peVol,
      riskFreeRate: config.riskFreeRate / 100,
      type: 'PE',
    }).toFixed(2);

    out.push({ strike, type: 'CE', price: cePrice, lastPrice: cePrice, bid: 0, ask: 0, oi: 0, iv: +(ceVol * 100).toFixed(2) });
    out.push({ strike, type: 'PE', price: pePrice, lastPrice: pePrice, bid: 0, ask: 0, oi: 0, iv: +(peVol * 100).toFixed(2) });
  }
  return out;
}

// NSE Nifty weekly expiry is Tuesday — do NOT include today blindly;
// NSE API itself returns the correct dates (including holiday-moved dates).
// This fallback is only used when NSE is unreachable.
function nextExpiryDates(n = 12) {
  const moNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}-${moNames[d.getMonth()]}-${d.getFullYear()}`;
  const result = [];
  const cur = new Date();
  cur.setHours(0, 0, 0, 0); // midnight local — adding +1 day before first check ensures today is never picked
  while (result.length < n) {
    cur.setDate(cur.getDate() + 1);
    if (cur.getDay() === 2) { // 2 = Tuesday
      result.push({ unix: Math.floor(cur.getTime() / 1000), label: fmt(cur) });
    }
  }
  return result;
}

function extractSetCookies(response) {
  // undici/fetch Response (modern Node)
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie().map((c) => c.split(';')[0].trim());
  }
  // undici/fetch Response (older)
  if (typeof response.headers.get === 'function') {
    const sc = response.headers.get('set-cookie');
    if (!sc) return [];
    return sc.split(/,(?=\s*[\w-]+=)/).map((c) => c.split(';')[0].trim()).filter(Boolean);
  }
  // nodeGet() response — headers is a plain IncomingHttpHeaders object
  const sc = response.headers['set-cookie'];
  if (!sc) return [];
  if (Array.isArray(sc)) return sc.map((c) => c.split(';')[0].trim());
  return [sc.split(';')[0].trim()];
}

function mergeCookieStrings(...parts) {
  const map = {};
  parts.flat().forEach((c) => {
    const eq = c.indexOf('=');
    if (eq === -1) return;
    const key = c.slice(0, eq).trim();
    map[key] = c; // later values overwrite, so fresh cookies win
  });
  return Object.values(map).join('; ');
}

export default async function handler(req, res) {
  const { symbol = 'NIFTY', expiry, iv, rate } = req.query;
  const manualVolatility = Number(iv) || null;

  // ── 1. Try NSE live options chain ────────────────────────────────────────
  try {
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    const baseHeaders = {
      'User-Agent': UA,
      'Accept-Language': 'en-IN,en;q=0.9',
      'Accept-Encoding': 'identity',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    };

    // ── Phase 1: seed session via NSE homepage (uses nodeGet for TLS bypass) ─
    let cookieStr = '';
    try {
      const homeResp = await nodeGet('https://www.nseindia.com/', {
        ...baseHeaders,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'Upgrade-Insecure-Requests': '1',
      });
      const homeCookies = extractSetCookies(homeResp);

      // ── Phase 2: visit /option-chain page (NSE requires this before API)
      const ocResp = await nodeGet('https://www.nseindia.com/option-chain', {
        ...baseHeaders,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Referer': 'https://www.nseindia.com/',
        'Cookie': mergeCookieStrings(homeCookies),
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'same-origin',
        'Upgrade-Insecure-Requests': '1',
      });
      const ocCookies = extractSetCookies(ocResp);
      cookieStr = mergeCookieStrings(homeCookies, ocCookies);
    } catch (_) { /* proceed without cookie */ }

    const nseUrl = `https://www.nseindia.com/api/option-chain-indices?symbol=${encodeURIComponent(symbol.toUpperCase())}`;
    const chainRes = await nodeGet(nseUrl, {
      ...baseHeaders,
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://www.nseindia.com/option-chain',
      'X-Requested-With': 'XMLHttpRequest',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      ...(cookieStr && { Cookie: cookieStr }),
    });
    if (!chainRes.ok) throw new Error(`NSE HTTP ${chainRes.status}`);

    const payload = chainRes.json();
    const records = payload?.records;
    if (!records?.data?.length) throw new Error('Empty NSE response');

    const expiryDates = records.expiryDates || [];
    const spot = records.underlyingValue ?? null;
    const expirations = expiryDates.map(nseToUnix).filter(Boolean);

    // Determine target expiry date string
    let targetDate = expiryDates[0];
    if (expiry) {
      const matched = expiryDates.find((d) => {
        const u = nseToUnix(d);
        return u && Math.abs(u - Number(expiry)) < 86400;
      });
      if (matched) targetDate = matched;
    }

    const strikes = [];
    for (const row of records.data) {
      if (row.expiryDate !== targetDate) continue;
      if (row.CE) {
        const ceLtp = row.CE.lastPrice ?? 0;
        const ceBid = row.CE.bidprice ?? 0;
        const ceAsk = row.CE.askPrice ?? 0;
        const cePrice = ceLtp > 0 ? ceLtp : (ceBid + ceAsk > 0 ? +((ceBid + ceAsk) / 2).toFixed(2) : 0);
        strikes.push({
          strike: row.strikePrice,
          type: 'CE',
          price: cePrice,
          lastPrice: ceLtp,
          bid: ceBid,
          ask: ceAsk,
          oi: row.CE.openInterest ?? 0,
          iv: row.CE.impliedVolatility ?? 0,
        });
      }
      if (row.PE) {
        const peLtp = row.PE.lastPrice ?? 0;
        const peBid = row.PE.bidprice ?? 0;
        const peAsk = row.PE.askPrice ?? 0;
        const pePrice = peLtp > 0 ? peLtp : (peBid + peAsk > 0 ? +((peBid + peAsk) / 2).toFixed(2) : 0);
        strikes.push({
          strike: row.strikePrice,
          type: 'PE',
          price: pePrice,
          lastPrice: peLtp,
          bid: peBid,
          ask: peAsk,
          oi: row.PE.openInterest ?? 0,
          iv: row.PE.impliedVolatility ?? 0,
        });
      }
    }

    return res.status(200).json({ symbol, expirations, expiryDates, spot, strikes, source: 'nse' });

  } catch (nseErr) {
    // ── 2. Fallback: synthetic premiums based on live Yahoo spot ─────────────
    let spot = 23000;
    try {
      spot = await fetchYahooPrice('^NSEI');
    } catch (_) { /* keep default */ }

    let indiaVix = null;
    try {
      indiaVix = await fetchYahooPrice('^INDIAVIX');
    } catch (_) {
      indiaVix = null;
    }

    const expiries = nextExpiryDates(12);
    const expirations = expiries.map((t) => t.unix);
    const expiryDates = expiries.map((t) => t.label);
    let targetExpiryUnix = expirations[0];
    if (expiry) {
      const requested = Number(expiry);
      const matched = expirations.find((u) => Math.abs(u - requested) < 86400);
      if (matched) targetExpiryUnix = matched;
    }
    const syntheticConfig = resolveSyntheticConfig({
      baseVolatility: indiaVix ?? manualVolatility,
      riskFreeRate: rate,
    });
    const timeToExpiryDays = Math.max((targetExpiryUnix - Math.floor(Date.now() / 1000)) / 86400, 0);

    return res.status(200).json({
      symbol,
      expirations,
      expiryDates,
      spot,
      strikes: buildSyntheticStrikes(spot, targetExpiryUnix, syntheticConfig),
      source: 'synthetic-fallback',
      pricingModel: {
        name: 'black-scholes',
        baseIv: syntheticConfig.baseVolatility,
        volatilitySource: indiaVix != null ? 'india-vix' : manualVolatility != null ? 'manual-iv-override' : 'config-fallback',
        nearExpiryBoost: syntheticConfig.nearExpiryBoost,
        smileFactor: syntheticConfig.smileFactor,
        putSkewFactor: syntheticConfig.putSkewFactor,
        riskFreeRate: syntheticConfig.riskFreeRate,
        timeToExpiryDays: +timeToExpiryDays.toFixed(2),
      },
      warning: `Live option quotes unavailable (${nseErr.message}). Using Black-Scholes theoretical pricing.`,
    });
  }
}
