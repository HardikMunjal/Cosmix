import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { restoreUserSession } from '../lib/auth-client';

const niftyStocks = [
  { symbol: 'ADANIENT', name: 'Adani Enterprises', sector: 'Conglomerate' },
  { symbol: 'ADANIPORTS', name: 'Adani Ports', sector: 'Infrastructure' },
  { symbol: 'APOLLOHOSP', name: 'Apollo Hospitals', sector: 'Healthcare' },
  { symbol: 'ASIANPAINT', name: 'Asian Paints', sector: 'Consumer' },
  { symbol: 'AXISBANK', name: 'Axis Bank', sector: 'Banking' },
  { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto', sector: 'Auto' },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance', sector: 'Finance' },
  { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv', sector: 'Finance' },
  { symbol: 'BEL', name: 'Bharat Electronics', sector: 'Defense' },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', sector: 'Telecom' },
  { symbol: 'BPCL', name: 'BPCL', sector: 'Energy' },
  { symbol: 'BRITANNIA', name: 'Britannia', sector: 'Consumer' },
  { symbol: 'CIPLA', name: 'Cipla', sector: 'Healthcare' },
  { symbol: 'COALINDIA', name: 'Coal India', sector: 'Mining' },
  { symbol: 'DRREDDY', name: 'Dr Reddy\'s', sector: 'Healthcare' },
  { symbol: 'EICHERMOT', name: 'Eicher Motors', sector: 'Auto' },
  { symbol: 'GRASIM', name: 'Grasim', sector: 'Materials' },
  { symbol: 'HCLTECH', name: 'HCLTech', sector: 'IT' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', sector: 'Banking' },
  { symbol: 'HDFCLIFE', name: 'HDFC Life', sector: 'Insurance' },
  { symbol: 'HEROMOTOCO', name: 'Hero MotoCorp', sector: 'Auto' },
  { symbol: 'HINDALCO', name: 'Hindalco', sector: 'Metals' },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever', sector: 'Consumer' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', sector: 'Banking' },
  { symbol: 'INDUSINDBK', name: 'IndusInd Bank', sector: 'Banking' },
  { symbol: 'INFY', name: 'Infosys', sector: 'IT' },
  { symbol: 'ITC', name: 'ITC', sector: 'Consumer' },
  { symbol: 'JIOFIN', name: 'Jio Financial', sector: 'Finance' },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', sector: 'Banking' },
  { symbol: 'LT', name: 'Larsen & Toubro', sector: 'Infrastructure' },
  { symbol: 'M&M', name: 'Mahindra & Mahindra', sector: 'Auto' },
  { symbol: 'MARUTI', name: 'Maruti Suzuki', sector: 'Auto' },
  { symbol: 'NESTLEIND', name: 'Nestle India', sector: 'Consumer' },
  { symbol: 'NTPC', name: 'NTPC', sector: 'Energy' },
  { symbol: 'ONGC', name: 'ONGC', sector: 'Energy' },
  { symbol: 'POWERGRID', name: 'Power Grid', sector: 'Utilities' },
  { symbol: 'RELIANCE', name: 'Reliance Industries', sector: 'Energy' },
  { symbol: 'SBILIFE', name: 'SBI Life', sector: 'Insurance' },
  { symbol: 'SBIN', name: 'State Bank of India', sector: 'Banking' },
  { symbol: 'SHRIRAMFIN', name: 'Shriram Finance', sector: 'Finance' },
  { symbol: 'SUNPHARMA', name: 'Sun Pharma', sector: 'Healthcare' },
  { symbol: 'TATACONSUM', name: 'Tata Consumer', sector: 'Consumer' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors', sector: 'Auto' },
  { symbol: 'TATASTEEL', name: 'Tata Steel', sector: 'Metals' },
  { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'IT' },
  { symbol: 'TECHM', name: 'Tech Mahindra', sector: 'IT' },
  { symbol: 'TITAN', name: 'Titan', sector: 'Consumer' },
  { symbol: 'TRENT', name: 'Trent', sector: 'Retail' },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement', sector: 'Materials' },
  { symbol: 'WIPRO', name: 'Wipro', sector: 'IT' },
];

const defaultStrategy = {
  name: '',
  symbol: 'RELIANCE',
  quantity: 10,
  entryPrice: 2920,
  stopLoss: 2850,
  targetPrice: 3050,
  type: 'swing',
};

function getStrategiesStorageKey(userId) {
  return `strategies:${userId || 'default'}`;
}

function Sparkline({ points, color = '#00ff9f' }) {
  const values = (points || []).filter((point) => Number.isFinite(point));

  if (values.length < 2) {
    return <div style={{ color: '#00ff9f55', fontSize: '11px' }}>No chart data</div>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coords = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 36 - ((value - min) / range) * 32;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ width: '100%', height: '44px' }}>
      <polyline fill="none" stroke={color} strokeWidth="2" points={coords} />
    </svg>
  );
}

export default function Stocks() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [strategyForm, setStrategyForm] = useState(defaultStrategy);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sectorFilter, setSectorFilter] = useState('All');
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const sectors = ['All', ...new Set(niftyStocks.map((stock) => stock.sector))];
  const filteredStocks = niftyStocks.filter((stock) => {
    const matchesSearch = `${stock.symbol} ${stock.name}`.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSector = sectorFilter === 'All' || stock.sector === sectorFilter;
    return matchesSearch && matchesSector;
  });
  const selectedStock = niftyStocks.find((stock) => stock.symbol === strategyForm.symbol) || niftyStocks[0];

  useEffect(() => {
    restoreUserSession(router, setUser).then((sessionUser) => {
      if (!sessionUser) return;
      const ownerKey = sessionUser.id || sessionUser.email || sessionUser.username;
      loadStrategies(ownerKey);
    });
  }, [router]);

  useEffect(() => {
    fetchSelectedQuote(strategyForm.symbol);
  }, [strategyForm.symbol]);

  const loadStrategies = (ownerKey) => {
    try {
      const scopedKey = getStrategiesStorageKey(ownerKey);
      const stored = localStorage.getItem(scopedKey) || localStorage.getItem('strategies');
      if (stored) {
        const parsed = JSON.parse(stored).map((strategy) => ({
          ...strategy,
          entryPrice: strategy.entryPrice ?? strategy.buyPrice ?? 0,
          stopLoss: strategy.stopLoss ?? Math.max((strategy.entryPrice ?? strategy.buyPrice ?? 0) * 0.97, 0),
          targetPrice: strategy.targetPrice ?? strategy.sellPrice ?? 0,
          history: strategy.history ?? [],
          source: strategy.source ?? 'saved-local',
        }));
        if (!localStorage.getItem(scopedKey)) {
          localStorage.setItem(scopedKey, JSON.stringify(parsed));
        }
        setStrategies(parsed);
      }
    } catch (e) {
      console.error('Load error:', e);
    }
  };

  const saveStrategies = (newStrategies) => {
    try {
      const ownerKey = user?.id || user?.email || user?.username;
      localStorage.setItem(getStrategiesStorageKey(ownerKey), JSON.stringify(newStrategies));
      setStrategies(newStrategies);
    } catch (e) {
      console.error('Save error:', e);
    }
  };

  const fetchStockQuote = async (symbol) => {
    try {
      const res = await fetch(`/api/stock-price?symbol=${encodeURIComponent(symbol)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch quote');
      }

      return data;
    } catch (err) {
      console.error('Fetch error:', err);
      return null;
    }
  };

  const fetchSelectedQuote = async (symbol) => {
    setLoading(true);
    const quote = await fetchStockQuote(symbol);
    if (quote) {
      setSelectedQuote(quote);
      setStrategyForm((current) => {
        if (current.symbol !== symbol) return current;

        const nextEntry = current.entryPrice || quote.price;
        const nextStop = current.stopLoss || Number((quote.price * 0.98).toFixed(2));
        const nextTarget = current.targetPrice || Number((quote.price * 1.03).toFixed(2));

        return {
          ...current,
          entryPrice: nextEntry,
          stopLoss: nextStop,
          targetPrice: nextTarget,
        };
      });
    }
    setLoading(false);
  };

  const refreshStrategies = async () => {
    if (strategies.length === 0) return;

    setRefreshing(true);
    try {
      const updated = await Promise.all(
        strategies.map(async (strategy) => {
          const quote = await fetchStockQuote(strategy.symbol);
          if (!quote) return strategy;

          return {
            ...strategy,
            currentPrice: quote.price,
            history: quote.history || strategy.history || [],
            changePercent: quote.changePercent,
            source: quote.source,
            profit: (quote.price - strategy.entryPrice) * strategy.quantity,
          };
        })
      );
      saveStrategies(updated);
    } finally {
      setRefreshing(false);
    }
  };

  const createStrategy = async () => {
    if (!strategyForm.name.trim()) {
      alert('Enter a strategy name');
      return;
    }

    if (strategyForm.stopLoss >= strategyForm.entryPrice) {
      alert('Stop-loss should be below entry price for a long strategy');
      return;
    }

    if (strategyForm.targetPrice <= strategyForm.entryPrice) {
      alert('Target should be above entry price for a long strategy');
      return;
    }

    setLoading(true);
    const quote = await fetchStockQuote(strategyForm.symbol);
    setLoading(false);
    if (!quote) {
      alert('Unable to fetch live market data');
      return;
    }

    const newStrategy = {
      id: Date.now(),
      ...strategyForm,
      createdAt: new Date().toLocaleDateString(),
      currentPrice: quote.price,
      status: 'pending',
      history: quote.history || [],
      source: quote.source,
      profit: (quote.price - strategyForm.entryPrice) * strategyForm.quantity,
      changePercent: quote.changePercent,
    };

    const updated = [...strategies, newStrategy];
    saveStrategies(updated);

    setStrategyForm({
      ...defaultStrategy,
      symbol: strategyForm.symbol,
      entryPrice: quote.price,
      stopLoss: Number((quote.price * 0.98).toFixed(2)),
      targetPrice: Number((quote.price * 1.03).toFixed(2)),
    });

    alert('Strategy created!');
  };

  const deleteStrategy = (id) => {
    if (!confirm('Delete this strategy?')) return;
    const updated = strategies.filter(s => s.id !== id);
    saveStrategies(updated);
  };

  const updateStrategyStatus = (id, status) => {
    const updated = strategies.map(s =>
      s.id === id ? { ...s, status } : s
    );
    saveStrategies(updated);
  };

  if (!user) return <div style={styles.loading}>Loading...</div>;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; width: 100%; overflow-x: hidden; }
        @media (max-width: 768px) {
          h1 { font-size: 16px !important; }
          h2 { font-size: 14px !important; }
          button { font-size: 11px !important; padding: 8px 10px !important; }
          input { font-size: 12px !important; }
          select { font-size: 12px !important; }
        }
      `}</style>
      <div style={styles.container}>
        <div style={styles.header}>
          <h1>📈 Nifty 50 Strategies</h1>
          <div style={styles.headerActions}>
            <button onClick={refreshStrategies} style={styles.refreshBtn}>
              {refreshing ? 'Refreshing...' : '↻ Refresh'}
            </button>
            <button onClick={() => router.push('/dashboard')} style={styles.back}>
              ← Back
            </button>
          </div>
        </div>

        {/* CREATE STRATEGY */}
        <div style={styles.card}>
          <h2>➕ Create Strategy</h2>
          <p style={styles.helperText}>Live prices and charts come from Yahoo Finance public NSE-compatible data via the app API.</p>

          <div style={styles.discoveryRow}>
            <input
              placeholder="Search Nifty 50 stocks"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={styles.input}
            />
            <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)} style={styles.input}>
              {sectors.map((sector) => (
                <option key={sector} value={sector}>{sector}</option>
              ))}
            </select>
          </div>

          <div style={styles.stockChipWrap}>
            {filteredStocks.slice(0, 12).map((stock) => (
              <button
                key={stock.symbol}
                onClick={() => setStrategyForm((current) => ({ ...current, symbol: stock.symbol }))}
                style={{
                  ...styles.stockChip,
                  background: stock.symbol === strategyForm.symbol ? '#00ff9f' : 'rgba(0,255,159,0.08)',
                  color: stock.symbol === strategyForm.symbol ? '#04110b' : '#9afbd3',
                }}
              >
                {stock.symbol}
              </button>
            ))}
          </div>

          {selectedQuote && (
            <div style={styles.quoteCard}>
              <div style={styles.quoteHeader}>
                <div>
                  <div style={styles.quoteTitle}>{selectedStock.name}</div>
                  <div style={styles.quoteMeta}>{selectedStock.symbol} • {selectedStock.sector} • {selectedQuote.source}</div>
                </div>
                <div style={styles.quotePriceBlock}>
                  <div style={styles.quotePrice}>Rs. {selectedQuote.price.toFixed(2)}</div>
                  <div style={{ ...styles.quoteChange, color: selectedQuote.change >= 0 ? '#00ff9f' : '#ff7b7b' }}>
                    {selectedQuote.change >= 0 ? '+' : ''}{selectedQuote.change.toFixed(2)} ({selectedQuote.changePercent}%)
                  </div>
                </div>
              </div>
              <Sparkline points={selectedQuote.history} color={selectedQuote.change >= 0 ? '#00ff9f' : '#ff7b7b'} />
            </div>
          )}

          <div style={styles.form}>
            <div style={styles.row}>
              <input
                placeholder="Strategy Name"
                value={strategyForm.name}
                onChange={(e) => setStrategyForm({ ...strategyForm, name: e.target.value })}
                style={styles.input}
              />
              <select
                value={strategyForm.symbol}
                onChange={(e) => setStrategyForm({ ...strategyForm, symbol: e.target.value })}
                style={styles.input}
              >
                {filteredStocks.map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.symbol} - {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.row}>
              <select
                value={strategyForm.type}
                onChange={(e) => setStrategyForm({ ...strategyForm, type: e.target.value })}
                style={styles.input}
              >
                <option value="scalp">Scalping (minutes)</option>
                <option value="swing">Swing (days)</option>
                <option value="position">Position (weeks/months)</option>
              </select>
              <input
                type="number"
                placeholder="Quantity"
                value={strategyForm.quantity}
                onChange={(e) => setStrategyForm({ ...strategyForm, quantity: parseInt(e.target.value) })}
                style={styles.input}
              />
            </div>

            <div style={styles.row}>
              <input
                type="number"
                placeholder="Entry Price"
                value={strategyForm.entryPrice}
                onChange={(e) => setStrategyForm({ ...strategyForm, entryPrice: parseFloat(e.target.value || 0) })}
                style={styles.input}
              />
              <input
                type="number"
                placeholder="Stop Loss"
                value={strategyForm.stopLoss}
                onChange={(e) => setStrategyForm({ ...strategyForm, stopLoss: parseFloat(e.target.value || 0) })}
                style={styles.input}
              />
              <input
                type="number"
                placeholder="Target"
                value={strategyForm.targetPrice}
                onChange={(e) => setStrategyForm({ ...strategyForm, targetPrice: parseFloat(e.target.value || 0) })}
                style={styles.input}
              />
            </div>

            <div style={styles.metricsBar}>
              <div style={styles.metricBox}>
                Risk/share: Rs. {(Math.max(strategyForm.entryPrice - strategyForm.stopLoss, 0)).toFixed(2)}
              </div>
              <div style={styles.metricBox}>
                Reward/share: Rs. {(Math.max(strategyForm.targetPrice - strategyForm.entryPrice, 0)).toFixed(2)}
              </div>
              <div style={styles.metricBox}>
                R:R {((Math.max(strategyForm.targetPrice - strategyForm.entryPrice, 0)) / Math.max(strategyForm.entryPrice - strategyForm.stopLoss, 1)).toFixed(2)}
              </div>
            </div>

            <button onClick={createStrategy} disabled={loading} style={styles.createBtn}>
              {loading ? 'Creating...' : '✅ Create Strategy'}
            </button>
          </div>
        </div>

        {/* STRATEGIES LIST */}
        <div style={styles.card}>
          <h2>📋 Your Strategies ({strategies.length})</h2>

          {strategies.length === 0 ? (
            <p style={styles.empty}>No strategies yet. Create one above!</p>
          ) : (
            <div style={styles.strategiesList}>
              {strategies.map((strategy) => {
                const profitLoss = strategy.profit || 0;
                const roi = ((profitLoss / (strategy.entryPrice * strategy.quantity)) * 100).toFixed(2);
                const isProfitable = profitLoss >= 0;
                const risk = Math.max(strategy.entryPrice - strategy.stopLoss, 0);
                const reward = Math.max(strategy.targetPrice - strategy.entryPrice, 0);
                const ratio = reward / Math.max(risk, 1);

                return (
                  <div key={strategy.id} style={{ ...styles.strategyCard, borderLeft: `4px solid ${isProfitable ? '#00ff9f' : '#ff4d4d'}` }}>
                    <div style={styles.strategyHeader}>
                      <h3 style={styles.strategyName}>{strategy.name}</h3>
                      <span style={{ ...styles.badge, background: strategy.type === 'scalp' ? '#ff7a00' : strategy.type === 'swing' ? '#00e5ff' : '#7cff00' }}>
                        {strategy.type}
                      </span>
                      <span style={{ ...styles.badge, background: strategy.status === 'active' ? '#00ff9f' : 'rgba(0,255,159,0.3)' }}>
                        {strategy.status}
                      </span>
                    </div>

                    <div style={styles.strategyDetails}>
                      <div>
                        <strong>{strategy.symbol}</strong> | Qty: {strategy.quantity} | Source: {strategy.source || 'n/a'}
                      </div>
                      <div style={styles.prices}>
                        Entry: Rs. {strategy.entryPrice.toFixed(2)} | SL: Rs. {strategy.stopLoss.toFixed(2)} | Target: Rs. {strategy.targetPrice.toFixed(2)} | Current: Rs. {strategy.currentPrice.toFixed(2)}
                      </div>
                      <div style={{ ...styles.profitLoss, color: isProfitable ? '#00ff9f' : '#ff4d4d' }}>
                        P/L: Rs. {profitLoss.toFixed(2)} ({roi}%)
                      </div>
                      <div style={styles.riskLine}>
                        Risk/Reward: {ratio.toFixed(2)} | Risk/share: Rs. {risk.toFixed(2)} | Reward/share: Rs. {reward.toFixed(2)}
                      </div>
                    </div>

                    <div style={styles.chartShell}>
                      <Sparkline points={strategy.history} color={isProfitable ? '#00ff9f' : '#ff7b7b'} />
                    </div>

                    <div style={styles.strategyActions}>
                      <button
                        onClick={() => updateStrategyStatus(strategy.id, strategy.status === 'active' ? 'paused' : 'active')}
                        style={{
                          ...styles.actionBtn,
                          background: strategy.status === 'active' ? '#ff7a00' : '#00ff9f',
                        }}
                      >
                        {strategy.status === 'active' ? '⏸ Pause' : '▶ Activate'}
                      </button>
                      <button onClick={() => deleteStrategy(strategy.id)} style={styles.deleteBtn}>
                        🗑 Delete
                      </button>
                    </div>

                    <div style={styles.timestamp}>{strategy.createdAt}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* INFO */}
        <div style={styles.card}>
          <h2>ℹ️ How It Works</h2>
          <ul style={{ color: '#00ff9f99', fontSize: '12px', lineHeight: '1.6' }}>
            <li>Search and filter the Nifty 50 by name, symbol, or sector</li>
            <li>Live prices and recent history are fetched from a free Yahoo Finance NSE-compatible endpoint</li>
            <li>Each strategy tracks entry, stop-loss, target, live P/L, and risk-reward ratio</li>
            <li>Mini charts help you compare current structure against the latest market trend</li>
            <li>Track multiple strategies: Scalping (quick trades), Swing (days), or Position (long-term)</li>
            <li>Pause or delete strategies anytime</li>
          </ul>
        </div>
      </div>
    </>
  );
}

const styles = {
  container: {
    background: '#0f0f0f',
    color: '#00ff9f',
    minHeight: '100vh',
    width: '100vw',
    padding: '8px',
    fontFamily: "'Fira Code', monospace",
    boxSizing: 'border-box',
    overflowX: 'hidden',
  },

  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    background: '#0f0f0f',
    color: '#00ff9f',
  },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px',
    gap: '8px',
    flexWrap: 'wrap',
  },

  headerActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },

  back: {
    background: 'black',
    border: '1px solid #00ff9f',
    color: '#00ff9f',
    padding: '6px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },

  refreshBtn: {
    background: '#13291f',
    border: '1px solid #00ff9f',
    color: '#9afbd3',
    padding: '6px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    whiteSpace: 'nowrap',
  },

  card: {
    background: 'rgba(0, 255, 159, 0.05)',
    border: '1px solid #00ff9f33',
    borderRadius: '10px',
    padding: '12px',
    marginBottom: '12px',
    width: '100%',
    boxSizing: 'border-box',
  },

  helperText: {
    color: '#00ff9f88',
    fontSize: '12px',
    lineHeight: '1.4',
    marginTop: '0',
    marginBottom: '12px',
  },

  discoveryRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: '8px',
    marginBottom: '10px',
    width: '100%',
  },

  stockChipWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '12px',
  },

  stockChip: {
    border: '1px solid rgba(0,255,159,0.22)',
    borderRadius: '999px',
    padding: '6px 10px',
    fontSize: '11px',
    cursor: 'pointer',
  },

  quoteCard: {
    background: 'rgba(0, 0, 0, 0.28)',
    border: '1px solid rgba(0,255,159,0.2)',
    borderRadius: '10px',
    padding: '12px',
    marginBottom: '12px',
  },

  quoteHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    alignItems: 'flex-start',
    marginBottom: '8px',
    flexWrap: 'wrap',
  },

  quoteTitle: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#d5ffef',
  },

  quoteMeta: {
    fontSize: '11px',
    color: '#00ff9f77',
    marginTop: '4px',
  },

  quotePriceBlock: {
    textAlign: 'right',
  },

  quotePrice: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#dffef0',
  },

  quoteChange: {
    fontSize: '12px',
    marginTop: '4px',
  },

  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },

  row: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },

  input: {
    flex: 1,
    padding: '8px',
    background: 'black',
    border: '1px solid #00ff9f',
    color: '#00ff9f',
    borderRadius: '6px',
    fontSize: '12px',
    fontFamily: 'monospace',
    minWidth: '0',
  },

  metricsBar: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    width: '100%',
  },

  metricBox: {
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(0,255,159,0.15)',
    borderRadius: '8px',
    padding: '8px',
    fontSize: '11px',
    color: '#9afbd3',
  },

  createBtn: {
    background: '#00ff9f',
    color: '#000',
    border: 'none',
    padding: '10px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '12px',
    width: '100%',
  },

  empty: {
    color: '#00ff9f77',
    fontSize: '12px',
    textAlign: 'center',
    padding: '15px',
  },

  strategiesList: {
    display: 'grid',
    gap: '10px',
    gridTemplateColumns: '1fr',
  },

  strategyCard: {
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid #00ff9f22',
    borderRadius: '8px',
    padding: '10px',
  },

  strategyHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
    flexWrap: 'wrap',
  },

  strategyName: {
    margin: 0,
    fontSize: '13px',
    color: '#00ff9f',
  },

  badge: {
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '10px',
    color: '#000',
    fontWeight: 'bold',
  },

  strategyDetails: {
    fontSize: '11px',
    color: '#00ff9f99',
    marginBottom: '8px',
    lineHeight: '1.4',
  },

  prices: {
    marginTop: '4px',
  },

  profitLoss: {
    marginTop: '4px',
    fontWeight: 'bold',
    fontSize: '12px',
  },

  riskLine: {
    marginTop: '4px',
    fontSize: '11px',
    color: '#9afbd3',
  },

  chartShell: {
    marginBottom: '8px',
    padding: '6px 0',
  },

  strategyActions: {
    display: 'flex',
    gap: '6px',
    marginBottom: '6px',
    flexWrap: 'wrap',
  },

  actionBtn: {
    flex: 1,
    padding: '6px',
    borderRadius: '4px',
    border: 'none',
    color: '#000',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 'bold',
  },

  deleteBtn: {
    background: '#da3633',
    color: 'white',
    border: 'none',
    padding: '6px 10px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '11px',
  },

  timestamp: {
    fontSize: '9px',
    color: '#00ff9f55',
  },
};
