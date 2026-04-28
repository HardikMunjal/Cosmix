import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { restoreUserSession } from '../lib/auth-client';
import { useTheme } from '../lib/ThemePicker';
import { applyTheme } from '../lib/themes';

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

function formatDuration(startIso, endIso) {
  if (!startIso || !endIso) return '—';
  const ms = new Date(endIso) - new Date(startIso);
  if (ms < 0) return '—';
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days === 0 && hours === 0) return '< 1 hour';
  if (days === 0) return `${hours}h`;
  if (hours === 0) return `${days}d`;
  return `${days}d ${hours}h`;
}

function formatCurrency(v) {
  const n = Number(v) || 0;
  return (n >= 0 ? '+' : '') + n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function getStrategyEndDate(strategy) {
  // Prefer the latest closedAt among closed legs, fallback to updatedAt
  const closedDates = (strategy.closedLegs || [])
    .map((cl) => cl.closedAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a));
  if (closedDates.length) return closedDates[0];
  const txDates = (strategy.transactions || [])
    .filter((tx) => tx.type === 'STATUS' || tx.type === 'CLOSE')
    .map((tx) => tx.timestamp)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a));
  if (txDates.length) return txDates[0];
  return strategy.updatedAt || null;
}

function calcRealizedPL(strategy) {
  return (strategy.closedLegs || []).reduce((sum, cl) => sum + (Number(cl.pnl) || 0), 0);
}

export default function StrategyHistoryPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('endDate'); // endDate | startDate | pl | name | duration
  const [sortDir, setSortDir] = useState('desc');
  const [filterStatus, setFilterStatus] = useState('all'); // all | closed | active | watching
  const { theme, themeId } = useTheme();
  const styles = useMemo(() => applyTheme(darkStyles, themeId, theme), [themeId, theme]);

  useEffect(() => {
    restoreUserSession(router, setUser).then((u) => {
      if (u) setUser(u);
    });
  }, [router]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetch('/api/options-strategies')
      .then((r) => r.json())
      .then((data) => {
        setStrategies(data.strategies || []);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [user]);

  const processed = useMemo(() => {
    return strategies.map((s) => ({
      ...s,
      _startDate: s.entryAt || s.createdAt || s.savedAt || null,
      _endDate: s.status === 'closed' ? getStrategyEndDate(s) : null,
      _pl: calcRealizedPL(s),
      _legs: (s.legs || []).length + (s.closedLegs || []).length,
    }));
  }, [strategies]);

  const filtered = useMemo(() => {
    let list = processed;
    if (filterStatus !== 'all') {
      if (filterStatus === 'closed') list = list.filter((s) => s.status === 'closed');
      else if (filterStatus === 'active') list = list.filter((s) => s.status === 'active');
      else if (filterStatus === 'watching') list = list.filter((s) => !s.status || s.status === 'watching');
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.learning || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [processed, filterStatus, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case 'name': return dir * (a.name || '').localeCompare(b.name || '');
        case 'startDate': return dir * (new Date(a._startDate || 0) - new Date(b._startDate || 0));
        case 'endDate': return dir * (new Date(a._endDate || 0) - new Date(b._endDate || 0));
        case 'pl': return dir * (a._pl - b._pl);
        case 'duration': {
          const durA = a._endDate && a._startDate ? new Date(a._endDate) - new Date(a._startDate) : 0;
          const durB = b._endDate && b._startDate ? new Date(b._endDate) - new Date(b._startDate) : 0;
          return dir * (durA - durB);
        }
        default: return 0;
      }
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const stats = useMemo(() => {
    const closed = processed.filter((s) => s.status === 'closed');
    const totalPL = closed.reduce((sum, s) => sum + s._pl, 0);
    const profitable = closed.filter((s) => s._pl > 0).length;
    const losing = closed.filter((s) => s._pl < 0).length;
    const winRate = closed.length > 0 ? ((profitable / closed.length) * 100).toFixed(1) : '—';
    const avgPL = closed.length > 0 ? (totalPL / closed.length) : 0;
    const best = closed.length > 0 ? Math.max(...closed.map((s) => s._pl)) : 0;
    const worst = closed.length > 0 ? Math.min(...closed.map((s) => s._pl)) : 0;
    return { total: processed.length, closed: closed.length, totalPL, profitable, losing, winRate, avgPL, best, worst };
  }, [processed]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sortIcon = (key) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕';

  if (!user) return <div style={styles.loading}>Loading…</div>;

  return (
    <div style={styles.container}>
      <style>{`
        .sh-row:hover { background: ${theme.cardBgGradient} !important; }
        .sh-stat-card:hover { border-color: ${theme.cardBorderHover} !important; transform: translateY(-2px); }
        .sh-sort-btn:hover { background: ${theme.cardBorder} !important; }
        .sh-back:hover { opacity: 0.8; }
        * { box-sizing: border-box; }
        @media (max-width: 900px) {
          .sh-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .sh-table-wrap { overflow-x: auto; }
        }
        @media (max-width: 600px) {
          .sh-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .sh-header { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }
          .sh-filter-row { flex-direction: column !important; align-items: stretch !important; }
        }
      `}</style>

      {/* Header */}
      <div style={styles.header} className="sh-header">
        <div>
          <h1 style={styles.title}>📋 Strategy History</h1>
          <p style={styles.subtitle}>All strategies — start/end dates, duration, and realized P/L.</p>
        </div>
        <div style={styles.headerActions}>
          <button onClick={() => router.push('/nifty-strategies')} style={styles.secondaryBtn}>← Tracker</button>
          <button onClick={() => router.push('/dashboard')} style={styles.secondaryBtn}>Dashboard</button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={styles.statsGrid} className="sh-stats-grid">
        {[
          { label: 'Total Strategies', value: stats.total, color: theme.blue },
          { label: 'Closed', value: stats.closed, color: theme.textSecondary },
          { label: 'Win Rate', value: stats.closed > 0 ? `${stats.winRate}%` : '—', color: Number(stats.winRate) >= 50 ? theme.green : theme.red },
          { label: 'Total Realized P/L', value: stats.closed > 0 ? formatCurrency(stats.totalPL) : '—', color: stats.totalPL >= 0 ? theme.green : theme.red },
          { label: 'Avg P/L per Trade', value: stats.closed > 0 ? formatCurrency(stats.avgPL) : '—', color: stats.avgPL >= 0 ? theme.green : theme.red },
          { label: 'Best Trade', value: stats.closed > 0 ? formatCurrency(stats.best) : '—', color: theme.green },
          { label: 'Worst Trade', value: stats.closed > 0 ? formatCurrency(stats.worst) : '—', color: theme.red },
          { label: 'Profitable / Losing', value: stats.closed > 0 ? `${stats.profitable} / ${stats.losing}` : '—', color: theme.textSecondary },
        ].map((stat) => (
          <div key={stat.label} style={styles.statCard} className="sh-stat-card">
            <div style={styles.statLabel}>{stat.label}</div>
            <div style={{ ...styles.statValue, color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={styles.filterRow} className="sh-filter-row">
        <input
          type="text"
          placeholder="Search by name or lesson learned…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
        />
        <div style={styles.filterTabs}>
          {[['all', 'All'], ['closed', 'Closed'], ['active', 'Active'], ['watching', 'Watchlist']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilterStatus(val)}
              style={filterStatus === val ? styles.filterTabActive : styles.filterTab}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? <div style={styles.emptyState}>Loading strategies…</div>
        : error ? <div style={styles.errorText}>{error}</div>
        : sorted.length === 0 ? <div style={styles.emptyState}>No strategies match the current filter.</div>
        : (
          <div style={styles.tableWrap} className="sh-table-wrap">
            {/* Sort header */}
            <div style={styles.tableHeader}>
              {[
                ['name', 'Strategy Name', '1fr'],
                ['startDate', 'Started', '130px'],
                ['endDate', 'Ended', '130px'],
                ['duration', 'Duration', '90px'],
                ['', 'Status', '90px'],
                ['pl', 'Realized P/L', '120px'],
                ['', 'Legs', '55px'],
                ['', 'Lesson Learned', '200px'],
              ].map(([key, label, width]) => (
                <div
                  key={label}
                  onClick={key ? () => toggleSort(key) : undefined}
                  style={{ ...styles.thCell, width, minWidth: width, cursor: key ? 'pointer' : 'default' }}
                  className={key ? 'sh-sort-btn' : ''}
                >
                  {label}{key ? sortIcon(key) : ''}
                </div>
              ))}
            </div>

            {/* Rows */}
            {sorted.map((s) => {
              const isProfit = s._pl > 0;
              const isLoss = s._pl < 0;
              const statusColor = s.status === 'active' ? theme.green : s.status === 'closed' ? theme.textMuted : theme.blue;
              const statusLabel = s.status === 'active' ? 'Active' : s.status === 'closed' ? 'Closed' : 'Watching';
              const duration = formatDuration(s._startDate, s._endDate);

              return (
                <div key={s.id} style={styles.tableRow} className="sh-row">
                  {/* Name */}
                  <div style={{ ...styles.tdCell, minWidth: '1fr', flex: 1 }}>
                    <div style={styles.stratName}>{s.name || 'Unnamed Strategy'}</div>
                    {s._legs > 0 && <div style={styles.stratMeta}>{s._legs} leg{s._legs !== 1 ? 's' : ''}</div>}
                  </div>

                  {/* Started */}
                  <div style={{ ...styles.tdCell, minWidth: '130px', width: '130px' }}>
                    <div style={styles.dateMain}>{formatDate(s._startDate)}</div>
                    <div style={styles.dateSub}>{s._startDate ? new Date(s._startDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                  </div>

                  {/* Ended */}
                  <div style={{ ...styles.tdCell, minWidth: '130px', width: '130px' }}>
                    {s._endDate ? (
                      <>
                        <div style={styles.dateMain}>{formatDate(s._endDate)}</div>
                        <div style={styles.dateSub}>{new Date(s._endDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                      </>
                    ) : <span style={styles.dimText}>—</span>}
                  </div>

                  {/* Duration */}
                  <div style={{ ...styles.tdCell, minWidth: '90px', width: '90px', color: theme.textSecondary, fontSize: 12 }}>
                    {duration}
                  </div>

                  {/* Status */}
                  <div style={{ ...styles.tdCell, minWidth: '90px', width: '90px' }}>
                    <span style={{ ...styles.statusBadge, color: statusColor, borderColor: statusColor }}>{statusLabel}</span>
                  </div>

                  {/* P/L */}
                  <div style={{ ...styles.tdCell, minWidth: '120px', width: '120px' }}>
                    {s.status === 'closed' ? (
                      <div style={{ ...styles.plValue, color: isProfit ? theme.green : isLoss ? theme.red : theme.textMuted }}>
                        {formatCurrency(s._pl)}
                      </div>
                    ) : (
                      <span style={styles.dimText}>—</span>
                    )}
                  </div>

                  {/* Legs count */}
                  <div style={{ ...styles.tdCell, minWidth: '55px', width: '55px', color: theme.textSecondary, fontSize: 12, textAlign: 'center' }}>
                    {s._legs || '—'}
                  </div>

                  {/* Lesson */}
                  <div style={{ ...styles.tdCell, minWidth: '200px', width: '200px' }}>
                    {s.learning ? (
                      <div style={styles.learningCell} title={s.learning}>
                        <span style={styles.learningIcon}>💡</span>
                        <span style={styles.learningText}>{s.learning}</span>
                      </div>
                    ) : (
                      <span style={styles.dimText}>—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  title: {
    fontSize: '26px',
    fontWeight: '800',
    color: '#f8fafc',
    margin: 0,
    letterSpacing: '-0.5px',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: '14px',
    margin: '4px 0 0',
  },
  headerActions: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  secondaryBtn: {
    background: '#1e293b',
    border: '1px solid #334155',
    color: '#e2e8f0',
    borderRadius: '8px',
    padding: '10px 16px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    minHeight: '40px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px',
    marginBottom: '20px',
  },
  statCard: {
    background: 'linear-gradient(135deg, #0f172a, #1e293b40)',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    padding: '14px 16px',
    transition: 'transform 0.15s, border-color 0.15s',
  },
  statLabel: {
    fontSize: '11px',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '6px',
    fontWeight: '600',
  },
  statValue: {
    fontSize: '20px',
    fontWeight: '800',
    letterSpacing: '-0.5px',
    color: '#f8fafc',
  },
  filterRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
    flexWrap: 'wrap',
  },
  searchInput: {
    flex: 1,
    minWidth: '200px',
    background: '#020617',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: '#e2e8f0',
    padding: '10px 14px',
    fontSize: '13px',
    outline: 'none',
    minHeight: '40px',
  },
  filterTabs: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  filterTab: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    color: '#94a3b8',
    borderRadius: '8px',
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600',
    minHeight: '36px',
  },
  filterTabActive: {
    background: '#1e293b',
    border: '1px solid #334155',
    color: '#f8fafc',
    borderRadius: '8px',
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '700',
    minHeight: '36px',
  },
  tableWrap: {
    background: 'linear-gradient(135deg, #0f172a, #1e293b30)',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    overflow: 'hidden',
  },
  tableHeader: {
    display: 'flex',
    gap: 0,
    background: '#0f172a',
    borderBottom: '1px solid #1e293b',
    padding: '0 14px',
  },
  thCell: {
    padding: '11px 8px',
    fontSize: '11px',
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    userSelect: 'none',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  tableRow: {
    display: 'flex',
    gap: 0,
    padding: '12px 14px',
    borderBottom: '1px solid #1e293b',
    alignItems: 'center',
    transition: 'background 0.12s',
  },
  tdCell: {
    padding: '0 8px',
    flexShrink: 0,
    overflow: 'hidden',
  },
  stratName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#f8fafc',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  stratMeta: {
    fontSize: '11px',
    color: '#64748b',
    marginTop: '2px',
  },
  dateMain: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#e2e8f0',
    whiteSpace: 'nowrap',
  },
  dateSub: {
    fontSize: '11px',
    color: '#64748b',
    marginTop: '2px',
    whiteSpace: 'nowrap',
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 8px',
    borderRadius: '999px',
    border: '1px solid',
    fontSize: '10px',
    fontWeight: '700',
    whiteSpace: 'nowrap',
  },
  plValue: {
    fontSize: '14px',
    fontWeight: '700',
    whiteSpace: 'nowrap',
  },
  dimText: {
    color: '#334155',
    fontSize: '13px',
  },
  learningCell: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '5px',
  },
  learningIcon: {
    fontSize: '13px',
    flexShrink: 0,
    marginTop: '1px',
  },
  learningText: {
    fontSize: '11px',
    color: '#94a3b8',
    lineHeight: '1.5',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  emptyState: {
    textAlign: 'center',
    padding: '48px 24px',
    color: '#64748b',
    fontSize: '15px',
  },
  errorText: {
    textAlign: 'center',
    padding: '48px 24px',
    color: '#f87171',
    fontSize: '14px',
  },
};
