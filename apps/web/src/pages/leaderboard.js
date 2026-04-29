import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { restoreUserSession } from '../lib/auth-client';
import { useTheme } from '../lib/ThemePicker';

function sortDailyScoresByDate(dailyScores = []) {
  return [...(Array.isArray(dailyScores) ? dailyScores : [])].sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')));
}

function computeLatestCumulativeScore(dailyScores = []) {
  const ordered = sortDailyScoresByDate(dailyScores);
  const latest = ordered[ordered.length - 1];
  if (!latest) return 0;
  const direct = Number(latest.cumulativeTotalScore || 0);
  if (Number.isFinite(direct) && direct !== 0) return direct;
  return ordered.reduce((sum, score) => sum + Number(score.totalScore || 0), 0);
}

function formatMetric(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return '0';
  return Number(numeric.toFixed(1)).toLocaleString('en-IN');
}

export default function Leaderboard() {
  const router = useRouter();
  const { theme } = useTheme();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    restoreUserSession(router, setUser);
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    async function loadLeaderboard() {
      const selfUserId = String(user?.id || user?.email || user?.username || '').trim();
      const selfUsername = String(user?.username || '').trim();
      if (!selfUserId || !selfUsername) {
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
        const isLocalHost = host === 'localhost' || host === '127.0.0.1';
        const chatApiBase = isLocalHost ? `http://${host}:3002/chat` : '/chat-api/chat';

        const bootstrapResponse = await fetch(`${chatApiBase}/bootstrap?username=${encodeURIComponent(selfUsername)}`);
        const bootstrapData = await bootstrapResponse.json().catch(() => ({}));
        const friends = Array.isArray(bootstrapData?.friends) ? bootstrapData.friends : [];

        const buddyLookups = await Promise.all(friends.map(async (username) => {
          const normalized = String(username || '').trim();
          if (!normalized) return null;
          try {
            const searchResponse = await fetch(`/api/chat/buddy-search?q=${encodeURIComponent(normalized)}`);
            const searchData = await searchResponse.json();
            const match = (Array.isArray(searchData?.results) ? searchData.results : [])
              .find((entry) => String(entry?.username || '').toLowerCase() === normalized.toLowerCase());
            return {
              username: normalized,
              displayName: String(match?.name || match?.username || normalized).trim(),
              userId: String(match?.id || match?.email || match?.username || normalized).trim(),
              isSelf: false,
            };
          } catch (_) {
            return {
              username: normalized,
              displayName: normalized,
              userId: normalized,
              isSelf: false,
            };
          }
        }));

        const participants = [
          { username: selfUsername, displayName: 'You', userId: selfUserId, isSelf: true },
          ...buddyLookups.filter(Boolean),
        ];
        const uniqueParticipants = Array.from(new Map(participants.map((entry) => [String(entry.userId).toLowerCase(), entry])).values());
        const wellnessApiBase = isLocalHost ? `http://${host}:3004` : '';

        const leaderboardRows = await Promise.all(uniqueParticipants.map(async (participant) => {
          try {
            const response = await fetch(`${wellnessApiBase}/wellness/data/${encodeURIComponent(participant.userId)}`);
            const data = await response.json();
            if (!response.ok || !data?.plan || data.plan.status !== 'active') return null;
            const sortedScores = sortDailyScoresByDate(data.dailyScores || []);
            const latestScore = sortedScores[sortedScores.length - 1] || null;
            return {
              id: participant.userId,
              name: participant.displayName,
              username: participant.username,
              isSelf: participant.isSelf,
              planName: String(data.plan.name || 'Active plan'),
              days: sortedScores.length,
              cumulativeTotal: computeLatestCumulativeScore(sortedScores),
              lastDayScore: Number(latestScore?.totalScore || 0),
              series: sortedScores.map((score) => ({ date: score.date, cumulative: Number(score.cumulativeTotalScore || 0) })),
            };
          } catch (_) {
            return null;
          }
        }));

        if (!cancelled) {
          setRows(
            leaderboardRows
              .filter(Boolean)
              .sort((left, right) => Number(right.cumulativeTotal || 0) - Number(left.cumulativeTotal || 0)),
          );
        }
      } catch (_) {
        if (!cancelled) setRows([]);
      }
      if (!cancelled) setLoading(false);
    }
    loadLeaderboard();
    return () => { cancelled = true; };
  }, [user?.id, user?.email, user?.username]);

  const chartMax = useMemo(() => {
    const max = rows.reduce((best, row) => {
      const rowMax = (row.series || []).reduce((seriesBest, point) => Math.max(seriesBest, Number(point.cumulative || 0)), 0);
      return Math.max(best, rowMax, Number(row.cumulativeTotal || 0));
    }, 0);
    return Math.max(1, max);
  }, [rows]);

  if (!user) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: theme.pageBgSolid, color: theme.textPrimary, fontFamily: theme.font }}>Loading...</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: theme.pageBg, color: theme.textPrimary, padding: 24, fontFamily: theme.font }}>
      <style>{`
        * { box-sizing: border-box; }
        @media (max-width: 760px) {
          .lb-row { grid-template-columns: 40px 1fr 1fr !important; }
          .lb-hide-mobile { display: none !important; }
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: theme.textHeading }}>Buddy Leaderboard</h1>
          <p style={{ margin: '5px 0 0 0', color: theme.textSecondary, fontSize: 13 }}>Current active plan ranking by cumulative score (self + buddies)</p>
        </div>
        <button onClick={() => router.push('/dashboard')} style={{ background: theme.buttonSecondaryBg || theme.cardBgAlt, color: theme.buttonSecondaryText || theme.textPrimary, border: `1px solid ${theme.buttonSecondaryBorder || theme.cardBorder}`, borderRadius: 10, padding: '9px 14px', cursor: 'pointer' }}>Dashboard</button>
      </div>

      <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, overflow: 'hidden' }}>
        <div className="lb-row" style={{ display: 'grid', gridTemplateColumns: '40px 1fr 140px 180px', gap: 10, padding: '12px 14px', background: theme.cardBgAlt || theme.pageBgSolid, color: theme.textMuted, fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
          <span>#</span>
          <span>Buddy Name</span>
          <span style={{ textAlign: 'right' }}>Cumulative</span>
          <span className="lb-hide-mobile" style={{ textAlign: 'right' }}>Trend</span>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: theme.textSecondary }}>Loading buddies...</div>
        ) : !rows.length ? (
          <div style={{ padding: 24, textAlign: 'center', color: theme.textSecondary }}>No active running plans found yet for you and your buddies.</div>
        ) : (
          rows.slice(0, 10).map((entry, index) => {
            const rank = index + 1;
            const graphWidth = 160;
            const graphHeight = 38;
            const points = (entry.series || []).map((point, pointIndex) => {
              const x = (entry.series.length <= 1)
                ? graphWidth / 2
                : (pointIndex / (entry.series.length - 1)) * graphWidth;
              const y = graphHeight - ((Number(point.cumulative || 0) / chartMax) * (graphHeight - 6)) - 3;
              return `${x},${y}`;
            }).join(' ');
            return (
              <div key={entry.id} className="lb-row" style={{ display: 'grid', gridTemplateColumns: '40px 1fr 140px 180px', gap: 10, padding: '12px 14px', borderTop: `1px solid ${theme.cardBorder}`, alignItems: 'center' }}>
                <span style={{ fontWeight: 800, color: rank <= 3 ? (theme.orange || '#f59e0b') : theme.textHeading }}>{rank}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: theme.textHeading, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.name}</span>
                    {entry.isSelf && <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 8px', color: '#bbf7d0', background: 'rgba(34,197,94,0.18)', border: '1px solid rgba(34,197,94,0.34)' }}>You</span>}
                  </div>
                  <div style={{ fontSize: 11, color: theme.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.planName} · {entry.days}d · Last {formatMetric(entry.lastDayScore)}</div>
                </div>
                <span style={{ textAlign: 'right', fontWeight: 700, color: theme.green }}>{formatMetric(entry.cumulativeTotal)}</span>
                <span className="lb-hide-mobile" style={{ textAlign: 'right', color: theme.textSecondary }}>
                  {entry.series.length > 0 ? (
                    <svg viewBox={`0 0 ${graphWidth} ${graphHeight}`} style={{ width: graphWidth, height: graphHeight }}>
                      <polyline fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" points={`0,${graphHeight - 3} ${graphWidth},${graphHeight - 3}`} />
                      <polyline fill="none" stroke={entry.isSelf ? (theme.green || '#22c55e') : (theme.blue || '#3b82f6')} strokeWidth="2.2" points={points} />
                    </svg>
                  ) : (
                    <span>No score data</span>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
