import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { restoreUserSession } from '../lib/auth-client';
import { useTheme } from '../lib/ThemePicker';
import { computeRunningStats, computeWellnessStats } from '../lib/userInsights';

function Kpi({ label, value, theme, accent }) {
  return (
    <div style={{ background: theme.cardBgAlt || theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 11, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800, color: accent || theme.textHeading }}>{value}</div>
    </div>
  );
}

export default function RunningAnalytics() {
  const router = useRouter();
  const { theme } = useTheme();
  const [user, setUser] = useState(null);

  useEffect(() => {
    restoreUserSession(router, setUser);
  }, [router]);

  const runningStats = useMemo(() => (user ? computeRunningStats(user.id) : null), [user?.id]);
  const wellnessStats = useMemo(() => (user ? computeWellnessStats(user.id) : null), [user?.id]);

  if (!user) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: theme.pageBgSolid, color: theme.textPrimary, fontFamily: theme.font }}>Loading...</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: theme.pageBg, color: theme.textPrimary, padding: 24, fontFamily: theme.font }}>
      <style>{`
        * { box-sizing: border-box; }
        @media (max-width: 900px) {
          .run-kpi-grid { grid-template-columns: 1fr 1fr !important; }
          .run-table { grid-template-columns: 30px 1fr 1fr !important; }
          .run-hide-mobile { display: none !important; }
          .run-lists { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: theme.textHeading }}>Running Dashboard</h1>
          <p style={{ margin: '5px 0 0 0', color: theme.textSecondary, fontSize: 13 }}>Running and wellness metrics separated from Nifty strategy analytics</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => router.push('/leaderboard')} style={{ background: theme.buttonSecondaryBg || theme.cardBgAlt, color: theme.buttonSecondaryText || theme.textPrimary, border: `1px solid ${theme.buttonSecondaryBorder || theme.cardBorder}`, borderRadius: 10, padding: '9px 14px', cursor: 'pointer' }}>Buddy Leaderboard</button>
          <button onClick={() => router.push('/dashboard')} style={{ background: theme.buttonSecondaryBg || theme.cardBgAlt, color: theme.buttonSecondaryText || theme.textPrimary, border: `1px solid ${theme.buttonSecondaryBorder || theme.cardBorder}`, borderRadius: 10, padding: '9px 14px', cursor: 'pointer' }}>Dashboard</button>
        </div>
      </div>

      {!runningStats ? (
        <div style={{ textAlign: 'center', color: theme.textSecondary, padding: 24 }}>No running data yet.</div>
      ) : (
        <>
          <div className="run-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
            <Kpi label="Fastest Distance (min 2km)" value={runningStats.fastestDistanceRun ? `${runningStats.fastestDistanceRun.distance} km · ${runningStats.fastestDistanceRun.time} · ${runningStats.fastestDistanceRun.date}` : 'N/A'} accent={theme.green} theme={theme} />
            <Kpi label="Longest Distance" value={runningStats.longestDistanceRun ? `${runningStats.longestDistanceRun.distance} km · ${runningStats.longestDistanceRun.time} · ${runningStats.longestDistanceRun.date}` : 'N/A'} accent={theme.cyan || '#06b6d4'} theme={theme} />
            <Kpi label="Average Speed" value={`${runningStats.averageSpeed || 0} km/h`} accent={theme.blue || '#3b82f6'} theme={theme} />
            <Kpi label="Fastest Speed (min 2km)" value={runningStats.fastestSpeedRun ? `${runningStats.fastestSpeedRun.speed} km/h · ${runningStats.fastestSpeedRun.distance} km · ${runningStats.fastestSpeedRun.date}` : 'N/A'} accent={theme.green} theme={theme} />
            <Kpi label="Slowest Speed (min 2km)" value={runningStats.slowestSpeedRun ? `${runningStats.slowestSpeedRun.speed} km/h · ${runningStats.slowestSpeedRun.distance} km · ${runningStats.slowestSpeedRun.date}` : 'N/A'} accent={theme.red} theme={theme} />
          </div>

          <div className="run-lists" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', fontWeight: 700, color: theme.textHeading, borderBottom: `1px solid ${theme.cardBorder}` }}>Top 5 Fastest Speed (with km and time)</div>
              {(runningStats.topSpeeds || []).slice(0, 5).map((entry, index) => (
                <div key={`${entry.date}-${entry.speed}-${index}`} className="run-table" style={{ display: 'grid', gridTemplateColumns: '30px 1fr 1fr 1fr', gap: 8, padding: '10px 14px', borderTop: `1px solid ${theme.cardBorder}`, alignItems: 'center' }}>
                  <span style={{ color: theme.orange || '#f59e0b', fontWeight: 800 }}>#{index + 1}</span>
                  <span style={{ color: theme.textSecondary }}>{entry.date}</span>
                  <span style={{ color: theme.green, fontWeight: 700 }}>{entry.speed} km/h</span>
                  <span className="run-hide-mobile" style={{ color: theme.textSecondary }}>{entry.distance} km · {entry.time}</span>
                </div>
              ))}
            </div>

            <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', fontWeight: 700, color: theme.textHeading, borderBottom: `1px solid ${theme.cardBorder}` }}>Top 5 Max Distance</div>
              {(runningStats.topDistances || []).slice(0, 5).map((entry, index) => (
                <div key={`${entry.date}-${entry.distance}-${index}`} className="run-table" style={{ display: 'grid', gridTemplateColumns: '30px 1fr 1fr 1fr', gap: 8, padding: '10px 14px', borderTop: `1px solid ${theme.cardBorder}`, alignItems: 'center' }}>
                  <span style={{ color: theme.orange || '#f59e0b', fontWeight: 800 }}>#{index + 1}</span>
                  <span style={{ color: theme.textSecondary }}>{entry.date}</span>
                  <span style={{ color: theme.blue || '#3b82f6', fontWeight: 700 }}>{entry.distance} km</span>
                  <span className="run-hide-mobile" style={{ color: theme.textSecondary }}>{entry.speed} km/h · {entry.time}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 12, background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: theme.textHeading, marginBottom: 6 }}>Highest Wellness Score</div>
            <div style={{ color: theme.green, fontWeight: 800 }}>
              {wellnessStats?.highestScore ? `${wellnessStats.highestScore.score.toFixed(1)} on ${wellnessStats.highestScore.date}` : 'N/A'}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
