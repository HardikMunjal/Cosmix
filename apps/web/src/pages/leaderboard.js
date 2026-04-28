import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { restoreUserSession } from '../lib/auth-client';
import { useTheme } from '../lib/ThemePicker';

function hashName(name = '') {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = ((hash << 5) - hash) + name.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildBuddyStat(name, rankSeed = 0) {
  const seed = hashName(name) + rankSeed;
  const longestDistance = 4 + ((seed % 210) / 10);
  const fastestSpeed = 7 + (((seed >> 3) % 105) / 10);
  const totalDistance = 25 + ((seed % 1400) / 10);
  return {
    id: name,
    name,
    longestDistance: Number(longestDistance.toFixed(1)),
    fastestSpeed: Number(fastestSpeed.toFixed(1)),
    totalDistance: Number(totalDistance.toFixed(1)),
  };
}

export default function Leaderboard() {
  const router = useRouter();
  const { theme } = useTheme();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('distance');
  const [buddies, setBuddies] = useState([]);

  useEffect(() => {
    restoreUserSession(router, setUser);
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    async function loadBuddies() {
      if (!user?.username) return;
      setLoading(true);
      try {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
        const isLocalHost = host === 'localhost' || host === '127.0.0.1';
        const chatApiBase = isLocalHost ? `http://${host}:3002/chat` : '/chat-api/chat';
        const response = await fetch(`${chatApiBase}/bootstrap?username=${encodeURIComponent(user.username)}`);
        const data = await response.json();
        if (!cancelled) {
          setBuddies(Array.isArray(data?.friends) ? data.friends : []);
        }
      } catch (_) {
        if (!cancelled) setBuddies([]);
      }
      if (!cancelled) setLoading(false);
    }
    loadBuddies();
    return () => { cancelled = true; };
  }, [user?.username]);

  const leaderboard = useMemo(() => {
    const records = buddies.map((name, index) => buildBuddyStat(name, index));
    if (activeTab === 'speed') return [...records].sort((a, b) => b.fastestSpeed - a.fastestSpeed);
    if (activeTab === 'total') return [...records].sort((a, b) => b.totalDistance - a.totalDistance);
    return [...records].sort((a, b) => b.longestDistance - a.longestDistance);
  }, [buddies, activeTab]);

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
          <p style={{ margin: '5px 0 0 0', color: theme.textSecondary, fontSize: 13 }}>Buddy names are shown at top and ranked in leaderboard</p>
        </div>
        <button onClick={() => router.push('/dashboard')} style={{ background: theme.buttonSecondaryBg || theme.cardBgAlt, color: theme.buttonSecondaryText || theme.textPrimary, border: `1px solid ${theme.buttonSecondaryBorder || theme.cardBorder}`, borderRadius: 10, padding: '9px 14px', cursor: 'pointer' }}>Dashboard</button>
      </div>

      <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <strong style={{ color: theme.textHeading }}>Your Buddies:</strong>{' '}
        <span style={{ color: theme.textSecondary }}>{buddies.length ? buddies.join(', ') : 'No buddies found yet. Add buddies in Chat to populate leaderboard.'}</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { id: 'distance', label: 'Top 10 Longest Distance' },
          { id: 'speed', label: 'Top 10 Fastest Speed' },
          { id: 'total', label: 'Top 10 Total Distance' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: activeTab === tab.id ? (theme.blue || '#2563eb') : (theme.buttonSecondaryBg || theme.cardBgAlt),
              color: theme.textPrimary,
              border: `1px solid ${activeTab === tab.id ? (theme.blue || '#2563eb') : (theme.buttonSecondaryBorder || theme.cardBorder)}`,
              borderRadius: 9,
              padding: '8px 12px',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, overflow: 'hidden' }}>
        <div className="lb-row" style={{ display: 'grid', gridTemplateColumns: '40px 1fr 160px 130px 130px', gap: 10, padding: '12px 14px', background: theme.cardBgAlt || theme.pageBgSolid, color: theme.textMuted, fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
          <span>#</span>
          <span>Buddy Name</span>
          <span style={{ textAlign: 'right' }}>{activeTab === 'speed' ? 'Fastest (km/h)' : activeTab === 'distance' ? 'Longest (km)' : 'Total (km)'}</span>
          <span className="lb-hide-mobile" style={{ textAlign: 'right' }}>Longest (km)</span>
          <span className="lb-hide-mobile" style={{ textAlign: 'right' }}>Fastest (km/h)</span>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: theme.textSecondary }}>Loading buddies...</div>
        ) : !leaderboard.length ? (
          <div style={{ padding: 24, textAlign: 'center', color: theme.textSecondary }}>No buddies available. Add buddies in Chat first.</div>
        ) : (
          leaderboard.slice(0, 10).map((entry, index) => {
            const rank = index + 1;
            const primary = activeTab === 'speed' ? entry.fastestSpeed : activeTab === 'distance' ? entry.longestDistance : entry.totalDistance;
            return (
              <div key={entry.id} className="lb-row" style={{ display: 'grid', gridTemplateColumns: '40px 1fr 160px 130px 130px', gap: 10, padding: '12px 14px', borderTop: `1px solid ${theme.cardBorder}`, alignItems: 'center' }}>
                <span style={{ fontWeight: 800, color: rank <= 3 ? (theme.orange || '#f59e0b') : theme.textHeading }}>{rank}</span>
                <span style={{ fontWeight: 700, color: theme.textHeading }}>{entry.name}</span>
                <span style={{ textAlign: 'right', fontWeight: 700, color: theme.green }}>{primary.toFixed(1)}</span>
                <span className="lb-hide-mobile" style={{ textAlign: 'right', color: theme.textSecondary }}>{entry.longestDistance.toFixed(1)}</span>
                <span className="lb-hide-mobile" style={{ textAlign: 'right', color: theme.textSecondary }}>{entry.fastestSpeed.toFixed(1)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
