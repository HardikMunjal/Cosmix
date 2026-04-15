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
];

function buildFallbackIndex(index) {
  const history = Array.from({ length: 20 }, (_, idx) => {
    const isVolatilityIndex = index.key === 'INDIAVIX';
    const wave = Math.sin(idx / 2.5) * (isVolatilityIndex ? 0.028 : 0.006);
    const drift = (idx - 10) * (isVolatilityIndex ? 0.0018 : 0.0008);
    return Number((index.fallback * (1 + wave + drift)).toFixed(2));
  });
  const price = history[history.length - 1];
  const previousClose = history[history.length - 2] || price;
  const change = Number((price - previousClose).toFixed(2));
  const changePercent = Number(((change / previousClose) * 100).toFixed(2));

  return {
    key: index.key,
    symbol: index.symbol,
    name: index.name,
    flag: index.flag || '',
    price,
    previousClose,
    change,
    changePercent,
    history,
    source: 'fallback-index-data',
  };
}

async function fetchIndex(index) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(index.symbol)}?interval=1d&range=1mo&includePrePost=false`;
    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0',
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Yahoo response ${response.status}`);
    }

    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    const meta = result?.meta;
    const closes = (result?.indicators?.quote?.[0]?.close || []).filter((value) => Number.isFinite(value));

    if (!meta || closes.length === 0) {
      throw new Error('Index payload missing data');
    }

    const latestClose = closes[closes.length - 1];
    const previousDailyClose = closes[closes.length - 2] ?? meta.previousClose ?? meta.chartPreviousClose ?? latestClose;
    const price = Number((meta.regularMarketPrice ?? latestClose).toFixed(2));
    const previousClose = Number(previousDailyClose.toFixed(2));
    const change = Number((price - previousClose).toFixed(2));
    const changePercent = Number(((change / previousClose) * 100).toFixed(2));

    return {
      key: index.key,
      symbol: index.symbol,
      name: index.name,
      flag: index.flag || '',
      price,
      previousClose,
      change,
      changePercent,
      history: closes.slice(-20).map((value) => Number(value.toFixed(2))),
      changeWindow: '1D',
      source: 'yahoo-finance-public',
    };
  } catch (error) {
    return {
      ...buildFallbackIndex(index),
      changeWindow: '1D',
      warning: error.message,
    };
  }
}

export default async function handler(req, res) {
  try {
    const indices = await Promise.all(indexConfig.map(fetchIndex));
    res.status(200).json({
      indices,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch indices' });
  }
}
