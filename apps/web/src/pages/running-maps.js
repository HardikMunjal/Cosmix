import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { restoreUserSession } from '../lib/auth-client';
import { MobileBottomNav } from '../lib/MobileNav';
import { useTheme } from '../lib/ThemePicker';
import { isWellnessApiReady, wellnessApiUrl } from '../lib/runningShoes';
import { loadRunningSurfaceId, saveRunningSurfaceId, mergeRunningSurface, runningSurfaces } from '../lib/runningThemes';
import { RunRouteMap } from '../lib/RunRouteMap';

function fmtDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtPace(minPerKm) {
  if (!minPerKm || !isFinite(minPerKm) || minPerKm <= 0) return '--';
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')} /km`;
}

export default function RunningMapsArchive() {
  const router = useRouter();
  const { theme: baseTheme } = useTheme();
  const [user, setUser] = useState(null);
  const [surfaceId, setSurfaceId] = useState('night');
  const [cards, setCards] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  const theme = useMemo(() => mergeRunningSurface(baseTheme, surfaceId), [baseTheme, surfaceId]);

  useEffect(() => {
    restoreUserSession(router, setUser);
    setSurfaceId(loadRunningSurfaceId());
  }, [router]);

  useEffect(() => {
    if (!user?.id || !isWellnessApiReady()) return undefined;
    let cancelled = false;
    setLoading(true);
    fetch(wellnessApiUrl(`/wellness/strava/maps/${encodeURIComponent(user.id)}?limit=80`))
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (cancelled) return;
        const list = (payload?.cards || []).filter((c) => (
          c?.hasMap && Array.isArray(c.polyline) && c.polyline.length > 1
        ));
        setCards(list);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !expandedId || !isWellnessApiReady()) {
      setDetail(null);
      return undefined;
    }
    let cancelled = false;
    fetch(wellnessApiUrl(`/wellness/strava/runs/${encodeURIComponent(user.id)}/${encodeURIComponent(expandedId)}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (!cancelled) setDetail(payload);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });
    return () => { cancelled = true; };
  }, [user?.id, expandedId]);

  const toggleSurface = () => {
    const next = surfaceId === 'night' ? 'trail' : 'night';
    setSurfaceId(next);
    saveRunningSurfaceId(next);
  };

  return (
    <div
      className="running-maps-page"
      style={{
        minHeight: '100vh',
        background: theme.pageBg,
        color: theme.textPrimary,
        fontFamily: theme.font,
        padding: '16px 16px 96px',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <Link href="/running-analytics" style={{ fontSize: 12, fontWeight: 800, color: theme.orange, textDecoration: 'none' }}>
              ← Running analytics
            </Link>
            <h1 style={{ margin: '8px 0 0', fontSize: 26, fontWeight: 900, color: theme.textHeading }}>Map archive</h1>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: theme.textSecondary }}>
              Scroll past routes · open one for playback
            </p>
          </div>
          <button
            type="button"
            onClick={toggleSurface}
            style={{
              border: `1px solid ${theme.cardBorder}`,
              background: theme.cardBg,
              color: theme.textHeading,
              borderRadius: 12,
              padding: '10px 12px',
              fontWeight: 800,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {runningSurfaces[surfaceId]?.label || 'Theme'}
          </button>
        </div>

        {loading ? (
          <div style={{ color: theme.textMuted, fontSize: 13 }}>Loading maps…</div>
        ) : !cards.length ? (
          <div style={{ padding: 16, borderRadius: 16, border: `1px dashed ${theme.cardBorder}`, color: theme.textMuted }}>
            No cached GPS maps yet.
          </div>
        ) : (
          cards.map((card) => {
            const id = Number(card.activityId);
            const open = Number(expandedId) === id;
            const summary = card.summary || {};
            return (
              <div
                key={id}
                style={{
                  borderRadius: 20,
                  border: `1px solid ${theme.cardBorder}`,
                  background: theme.cardBg,
                  boxShadow: theme.chartDepth,
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(open ? null : id)}
                  style={{
                    width: '100%',
                    border: 'none',
                    background: 'transparent',
                    padding: '14px 16px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    color: 'inherit',
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 800, color: theme.textHeading }}>{summary.name || 'Run'}</div>
                  <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
                    {fmtDate(summary.date)} · {summary.distanceKm ?? '--'} km · {fmtPace(summary.paceMinPerKm)}
                    {open ? ' · close' : ' · play →'}
                  </div>
                </button>
                {open ? (
                  <div style={{ padding: '0 12px 14px', display: 'grid', gap: 10 }}>
                    <RunRouteMap
                      polyline={detail?.polyline?.length ? detail.polyline : (card.polyline || [])}
                      streams={detail?.streams || {}}
                      theme={theme}
                      height={200}
                    />
                    <button
                      type="button"
                      onClick={() => router.push(`/running/${id}`)}
                      style={{
                        border: 'none',
                        borderRadius: 12,
                        padding: '12px',
                        background: theme.orange,
                        color: '#fff',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      Full run analytics →
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <MobileBottomNav
        theme={theme}
        activeId="stats"
        items={[
          { id: 'home', label: 'Home', icon: '🏠', href: '/dashboard' },
          { id: 'wellness', label: 'Henna', icon: '🌿', href: '/wellness' },
          { id: 'stats', label: 'Running', icon: '🏃', href: '/running-analytics' },
          { id: 'board', label: 'Ranks', icon: '🏆', href: '/leaderboard' },
        ]}
      />
    </div>
  );
}
