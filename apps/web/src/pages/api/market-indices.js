const indexConfig = [
  {
    key: 'NIFTY50',
    symbol: '^NSEI',
    name: 'Nifty 50',
    fallback: 22450.35,
    flag: '🇮🇳',
  },
  {
    key: 'BANKNIFTY',
    symbol: '^NSEBANK',
    name: 'Bank Nifty',
    fallback: 48120.6,
    flag: '🏦',
  },
  {
    key: 'SENSEX',
    symbol: '^BSESN',
    name: 'Sensex',
    fallback: 76800.0,
    flag: '🇮🇳',
  },
  {
    key: 'INDIAVIX',
    symbol: '^INDIAVIX',
    name: 'India VIX',
    fallback: 14.8,
    flag: '⚡',
  },
  {
    key: 'DOWFUT',
    symbol: 'YM=F',
    name: 'Dow Futures',
    fallback: 39200.0,
    flag: '🇺🇸',
  },
  {
    key: 'SP500FUT',
    symbol: 'ES=F',
    name: 'S&P 500 Fut',
    fallback: 5250.0,
    flag: '🇺🇸',
  },
  {
    key: 'HANGSENG',
    symbol: '^HSI',
    name: 'Hang Seng',
    fallback: 17650.0,
    flag: '🇭🇰',
  },
  {
    key: 'NIKKEI',
    symbol: '^N225',
    name: 'Nikkei 225',
    fallback: 38400.0,
    flag: '🇯🇵',
  },
  {
    key: 'DAX',
    symbol: '^GDAXI',
    name: 'DAX',
    fallback: 18200.0,
    flag: '🇩🇪',
  },
  {
    key: 'FTSE',
    symbol: '^FTSE',
    name: 'FTSE 100',
    fallback: 8100.0,
    flag: '🇬🇧',
  },
  {
    key: 'CRUDEWTI',
    symbol: 'CL=F',
    name: 'WTI Crude',
    fallback: 78.0,
    flag: '🛢️',
  },
  {
    key: 'CRUDEBRENT',
    symbol: 'BZ=F',
    name: 'Brent Crude',
    fallback: 82.0,
    flag: '🛢️',
  },
];

const FRESH_CACHE_MS = 15 * 1000;
const STALE_CACHE_MS = 10 * 60 * 1000;
const RATE_LIMIT_BACKOFF_MS = 2 * 60 * 1000;
const indexRuntime = new Map();

function buildIndexSnapshot(index, {
  price,
  previousClose,
  history,
  source,
  sourceLabel,
  changeWindow,
  warning = '',
  isStale = false,
  asOf = new Date().toISOString(),
}) {
  const normalizedHistory = (history || []).filter((value) => Number.isFinite(value)).slice(-20);
  const safePrice = Number.isFinite(price) ? price : (normalizedHistory[normalizedHistory.length - 1] ?? index.fallback);
  const safePreviousClose = Number.isFinite(previousClose) ? previousClose : safePrice;
  const change = Number((safePrice - safePreviousClose).toFixed(2));
  const changePercent = safePreviousClose
    ? Number(((change / safePreviousClose) * 100).toFixed(2))
    : 0;

  return {
    key: index.key,
    symbol: index.symbol,
    name: index.name,
    flag: index.flag || '',
    price: Number(safePrice.toFixed(2)),
    previousClose: Number(safePreviousClose.toFixed(2)),
    change,
    changePercent,
    history: normalizedHistory.map((value) => Number(value.toFixed(2))),
    changeWindow,
    source,
    sourceLabel,
    warning,
    isStale,
    asOf,
  };
}

function buildFallbackIndex(index, warning = '') {
  const history = Array.from({ length: 20 }, (_, idx) => {
    const isVolatilityIndex = index.key === 'INDIAVIX';
    const wave = Math.sin(idx / 2.5) * (isVolatilityIndex ? 0.028 : 0.006);
    const drift = (idx - 10) * (isVolatilityIndex ? 0.0018 : 0.0008);
    return Number((index.fallback * (1 + wave + drift)).toFixed(2));
  });
  const price = history[history.length - 1];
  const previousClose = history[history.length - 2] || price;

  return buildIndexSnapshot(index, {
    price,
    previousClose,
    history,
    source: 'fallback-index-data',
    sourceLabel: 'Static fallback',
    changeWindow: '1D',
    warning,
    isStale: true,
  });
}

function decorateCachedSnapshot(snapshot, warning = '') {
  return {
    ...snapshot,
    isStale: true,
    sourceLabel: snapshot.sourceLabel?.includes('(cached)')
      ? snapshot.sourceLabel
      : `${snapshot.sourceLabel || snapshot.source || 'Cached source'} (cached)`,
    warning: [warning, snapshot.warning].filter(Boolean).join(' ').trim(),
  };
}

async function fetchYahooChart(symbol, { interval, range, includePrePost }) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=${includePrePost ? 'true' : 'false'}`;
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'user-agent': 'Mozilla/5.0',
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    const error = new Error(`Yahoo response ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function extractChartSnapshot(payload, maxPoints = 20) {
  const result = payload?.chart?.result?.[0];
  const meta = result?.meta;
  const closes = (result?.indicators?.quote?.[0]?.close || []).filter((value) => Number.isFinite(value));

  if (!meta || closes.length === 0) {
    throw new Error('Index payload missing data');
  }

  const latestClose = closes[closes.length - 1];
  const priceRaw = meta.regularMarketPrice ?? meta.postMarketPrice ?? meta.preMarketPrice ?? latestClose;
  const previousCloseRaw = meta.previousClose ?? meta.chartPreviousClose ?? meta.previousRegularMarketClose ?? closes[closes.length - 2] ?? priceRaw;
  const asOf = meta.regularMarketTime
    ? new Date(meta.regularMarketTime * 1000).toISOString()
    : new Date().toISOString();

  return {
    price: Number(priceRaw),
    previousClose: Number(previousCloseRaw),
    history: closes.slice(-maxPoints).map((value) => Number(value)),
    asOf,
  };
}

async function fetchIndex(index) {
  const now = Date.now();
  const runtime = indexRuntime.get(index.key) || {
    snapshot: null,
    fetchedAt: 0,
    backoffUntil: 0,
  };
  const hasFreshCache = runtime.snapshot && (now - runtime.fetchedAt) < FRESH_CACHE_MS;
  const hasStaleCache = runtime.snapshot && (now - runtime.fetchedAt) < STALE_CACHE_MS;

  if (hasFreshCache) {
    return runtime.snapshot;
  }

  if (runtime.backoffUntil > now && hasStaleCache) {
    const secondsRemaining = Math.ceil((runtime.backoffUntil - now) / 1000);
    return decorateCachedSnapshot(runtime.snapshot, `Yahoo backoff active for ${secondsRemaining}s.`);
  }

  try {
    const intradayPayload = await fetchYahooChart(index.symbol, {
      interval: '5m',
      range: '1d',
      includePrePost: true,
    });
    const intraday = extractChartSnapshot(intradayPayload, 20);
    const snapshot = buildIndexSnapshot(index, {
      ...intraday,
      source: 'yahoo-finance-public',
      sourceLabel: 'Yahoo Finance intraday',
      changeWindow: '5m',
    });

    indexRuntime.set(index.key, {
      snapshot,
      fetchedAt: now,
      backoffUntil: 0,
    });
    return snapshot;
  } catch (intradayError) {
    try {
      const dailyPayload = await fetchYahooChart(index.symbol, {
        interval: '1d',
        range: '1mo',
        includePrePost: false,
      });
      const daily = extractChartSnapshot(dailyPayload, 20);
      const warning = intradayError?.status === 429
        ? 'Yahoo intraday rate limited. Showing daily snapshot.'
        : 'Intraday feed unavailable. Showing daily snapshot.';
      const snapshot = buildIndexSnapshot(index, {
        ...daily,
        source: 'yahoo-finance-public',
        sourceLabel: 'Yahoo Finance daily',
        changeWindow: '1D',
        warning,
      });

      indexRuntime.set(index.key, {
        snapshot,
        fetchedAt: now,
        backoffUntil: intradayError?.status === 429 ? now + RATE_LIMIT_BACKOFF_MS : 0,
      });
      return snapshot;
    } catch (dailyError) {
      const primaryMessage = intradayError?.status === 429
        ? 'Yahoo intraday rate limited (429).'
        : (intradayError?.message || 'Yahoo intraday fetch failed.');
      const dailyMessage = dailyError?.status === 429
        ? 'Yahoo daily rate limited (429).'
        : (dailyError?.message || 'Yahoo daily fetch failed.');
      const combinedWarning = `${primaryMessage} ${dailyMessage}`.trim();
      const nextBackoffUntil = (intradayError?.status === 429 || dailyError?.status === 429)
        ? now + RATE_LIMIT_BACKOFF_MS
        : 0;

      indexRuntime.set(index.key, {
        ...runtime,
        backoffUntil: nextBackoffUntil,
      });

      if (hasStaleCache) {
        return decorateCachedSnapshot(runtime.snapshot, `${combinedWarning} Serving cached snapshot.`);
      }

      return buildFallbackIndex(index, combinedWarning);
    }
  }
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    const indices = await Promise.all(indexConfig.map(fetchIndex));
    const warnings = indices
      .filter((index) => index.warning)
      .map((index) => ({ key: index.key, warning: index.warning }));
    res.status(200).json({
      indices,
      timestamp: new Date().toISOString(),
      polling: {
        serverCacheMs: FRESH_CACHE_MS,
        backoffMs: RATE_LIMIT_BACKOFF_MS,
      },
      warnings,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch indices' });
  }
}
