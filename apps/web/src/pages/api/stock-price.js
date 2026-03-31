const fallbackPrices = {
  RELIANCE: 2948.35,
  TCS: 4126.4,
  INFY: 1612.25,
  HDFCBANK: 1689.8,
  ICICIBANK: 1218.6,
  SBIN: 782.45,
  LT: 3721.9,
  ITC: 428.15,
  BHARTIARTL: 1194.7,
  ASIANPAINT: 2876.55,
};

function buildFallbackQuote(symbol) {
  const base = fallbackPrices[symbol] || 1000;
  const history = Array.from({ length: 20 }, (_, index) => {
    const wave = Math.sin(index / 2) * 0.015;
    const drift = (index - 10) * 0.0015;
    return Number((base * (1 + wave + drift)).toFixed(2));
  });
  const price = history[history.length - 1];
  const previousClose = history[history.length - 2] || price;
  const change = Number((price - previousClose).toFixed(2));
  const changePercent = Number(((change / previousClose) * 100).toFixed(2));

  return {
    symbol,
    price,
    previousClose,
    change,
    changePercent,
    history,
    currency: 'INR',
    source: 'fallback-nifty-data',
    exchangeSymbol: `${symbol}.NS`,
  };
}

export default async function handler(req, res) {
  const { symbol } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol required' });
  }

  const upperSymbol = symbol.toUpperCase();

  try {
    const exchangeSymbol = `${upperSymbol}.NS`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(exchangeSymbol)}?interval=1d&range=1mo&includePrePost=false`;
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
      throw new Error('Quote payload missing data');
    }

    const price = Number((meta.regularMarketPrice ?? closes[closes.length - 1]).toFixed(2));
    const previousClose = Number((meta.previousClose ?? meta.chartPreviousClose ?? closes[closes.length - 2] ?? price).toFixed(2));
    const change = Number((price - previousClose).toFixed(2));
    const changePercent = Number(((change / previousClose) * 100).toFixed(2));

    return res.status(200).json({
      symbol: upperSymbol,
      exchangeSymbol,
      price,
      previousClose,
      change,
      changePercent,
      history: closes.slice(-20).map((value) => Number(value.toFixed(2))),
      currency: meta.currency || 'INR',
      timestamp: new Date().toISOString(),
      source: 'yahoo-finance-public',
    });
  } catch (error) {
    const fallback = buildFallbackQuote(upperSymbol);
    return res.status(200).json({
      ...fallback,
      timestamp: new Date().toISOString(),
      warning: error.message,
    });
  }
}
