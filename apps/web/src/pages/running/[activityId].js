import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { restoreUserSession } from '../../lib/auth-client';
import { MobileBottomNav } from '../../lib/MobileNav';
import { useTheme } from '../../lib/ThemePicker';
import { RunRouteMap } from '../../lib/RunRouteMap';
import { isWellnessApiReady, wellnessApiUrl } from '../../lib/runningShoes';

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
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function fmtMins(mins) {
  if (!mins || mins <= 0) return '--';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

function downsample(values = [], maxPoints = 120) {
  if (!Array.isArray(values) || values.length <= maxPoints) return values || [];
  const step = Math.ceil(values.length / maxPoints);
  const out = [];
  for (let i = 0; i < values.length; i += step) out.push(values[i]);
  return out;
}

function LineChart({ values = [], theme, color = '#f43f5e', height = 160, yLabel = 'bpm', unit = '' }) {
  const series = downsample(values.map((v) => Number(v) || 0).filter((v) => v > 0), 160);
  if (series.length < 2) {
    return (
      <div style={{ height, display: 'grid', placeItems: 'center', color: theme.textMuted, fontSize: 12 }}>
        No {yLabel} samples for this run
      </div>
    );
  }
  const w = 320;
  const h = height;
  const pad = 12;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = Math.max(1, max - min);
  const pts = series.map((v, i) => {
    const x = pad + (i / (series.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height, display: 'block' }}>
        <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" points={pts} />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
        <span>min {Math.round(min)}{unit}</span>
        <span>avg {Math.round(series.reduce((a, b) => a + b, 0) / series.length)}{unit}</span>
        <span>max {Math.round(max)}{unit}</span>
      </div>
    </div>
  );
}

function ZoneBars({ zones = [], theme, accent = '#f43f5e' }) {
  const total = zones.reduce((sum, z) => sum + Number(z.seconds || 0), 0) || 1;
  if (!zones.length) {
    return <div style={{ color: theme.textMuted, fontSize: 12 }}>No zone data for this run</div>;
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {zones.map((zone) => {
        const pct = Math.round((Number(zone.seconds || 0) / total) * 100);
        return (
          <div key={zone.zone || zone.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: theme.textSecondary, fontWeight: 700 }}>{zone.label || `Z${zone.zone}`}</span>
              <span style={{ color: theme.textMuted }}>{zone.minutes ?? (Number(zone.seconds || 0) / 60).toFixed(1)} min · {pct}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: theme.cardBorder, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: accent, borderRadius: 99 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatPill({ label, value, theme, accent }) {
  return (
    <div style={{ padding: '12px 14px', borderRadius: 14, border: `1px solid ${theme.cardBorder}`, background: theme.cardBg }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: theme.textMuted }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent || theme.textHeading, marginTop: 4 }}>{value}</div>
    </div>
  );
}

export default function RunDetailPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const activityId = router.query.activityId;
  const [user, setUser] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    restoreUserSession(router, (next) => {
      if (!cancelled) setUser(next);
    }).then((session) => {
      if (cancelled) return;
      if (!session?.id && !session?.username) return;
      setUser(session);
    });
    return () => { cancelled = true; };
  }, [router]);

  const loadDetail = async (uid, id, { force = false } = {}) => {
    if (!uid || !id || !isWellnessApiReady()) return;
    setLoading(true);
    setError('');
    try {
      const qs = force ? '?force=1' : '';
      const res = await fetch(wellnessApiUrl(`/wellness/strava/runs/${encodeURIComponent(uid)}/${encodeURIComponent(id)}${qs}`));
      const payload = await res.json().catch(() => null);
      if (!res.ok || payload?.ok === false) {
        setError(payload?.error === 'not_connected'
          ? 'Connect Strava once to import this run’s map & streams. After that it’s saved in Cosmix.'
          : 'Could not load run detail.');
        setDetail(payload);
      } else {
        setDetail(payload);
      }
    } catch (_) {
      setError('Network error loading run.');
    } finally {
      setLoading(false);
    }
  };

  const userId = user?.id || (user?.username ? `usr-${user.username}` : null);

  useEffect(() => {
    if (!userId || !activityId) return;
    void loadDetail(userId, activityId);
  }, [userId, activityId]);

  const summary = detail?.summary || {};
  const streams = detail?.streams || {};
  const splits = detail?.splits || [];
  const zones = detail?.heartrateZones || summary.heartrateZones || [];

  const needsEnrich = useMemo(() => {
    if (!detail) return false;
    return Boolean(detail.needsEnrich)
      || (!(detail.polyline || []).length && !(streams.latlng || []).length && !(streams.heartrate || []).length);
  }, [detail, streams]);

  async function handleEnrich() {
    if (!userId || !activityId) return;
    setEnriching(true);
    try {
      await fetch(wellnessApiUrl(`/wellness/strava/runs/${encodeURIComponent(userId)}/enrich-details`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityIds: [Number(activityId)], limit: 1 }),
      });
      await loadDetail(userId, activityId, { force: true });
    } finally {
      setEnriching(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: theme.pageBg || theme.pageBgSolid || '#0b0f14', paddingBottom: 88 }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 14px 24px', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => router.push('/running-analytics')}
            style={{
              border: `1px solid ${theme.cardBorder}`,
              background: theme.cardBg,
              color: theme.textHeading,
              borderRadius: 12,
              padding: '8px 12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ← Back
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: theme.textHeading, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {summary.name || 'Run detail'}
            </div>
            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
              {fmtDate(summary.date)} · saved in Cosmix{detail?.cached ? ' · offline-ready' : ''}
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: theme.textMuted }}>Loading run maps & streams…</div>
        ) : (
          <>
            {error ? (
              <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${theme.cardBorder}`, color: theme.textMuted, fontSize: 13 }}>
                {error}
              </div>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
              <StatPill label="Distance" value={`${summary.distanceKm ?? '--'} km`} theme={theme} accent={theme.blue} />
              <StatPill label="Time" value={fmtMins(summary.minutes)} theme={theme} accent={theme.orange} />
              <StatPill label="Pace" value={summary.paceMinPerKm ? `${fmtPace(summary.paceMinPerKm)} /km` : '--'} theme={theme} accent={theme.cyan} />
              <StatPill label="Avg HR" value={summary.avgHeartrate ? `${summary.avgHeartrate} bpm` : '--'} theme={theme} accent="#f43f5e" />
              <StatPill label="Max HR" value={summary.maxHeartrate ? `${summary.maxHeartrate} bpm` : '--'} theme={theme} accent="#fb7185" />
              <StatPill label="Elevation" value={summary.elevationGainM != null ? `↑${summary.elevationGainM} m` : '--'} theme={theme} accent={theme.purple} />
            </div>

            {needsEnrich ? (
              <div style={{
                padding: 14,
                borderRadius: 14,
                border: `1px solid ${theme.cardBorder}`,
                background: theme.cardBg,
                display: 'grid',
                gap: 10,
              }}
              >
                <div style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.45 }}>
                  Map, speed playback, km splits and HR graphs aren’t cached for this run yet.
                  One sync pulls them from Strava (free API — no Premium) and stores them here permanently.
                </div>
                <button
                  type="button"
                  disabled={enriching}
                  onClick={handleEnrich}
                  style={{
                    border: 'none',
                    borderRadius: 12,
                    padding: '12px 14px',
                    background: theme.orange,
                    color: '#fff',
                    fontWeight: 800,
                    cursor: enriching ? 'default' : 'pointer',
                    opacity: enriching ? 0.7 : 1,
                  }}
                >
                  {enriching ? 'Importing map & streams…' : 'Import map, splits & HR'}
                </button>
              </div>
            ) : null}

            <section style={{ display: 'grid', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: theme.textHeading }}>Route & speed playback</h2>
              <RunRouteMap
                polyline={detail?.polyline || streams.latlng || []}
                streams={streams}
                theme={theme}
                height={300}
              />
            </section>

            <section style={{
              padding: 14,
              borderRadius: 16,
              border: `1px solid ${theme.cardBorder}`,
              background: theme.cardBg,
              display: 'grid',
              gap: 10,
            }}
            >
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: theme.textHeading }}>Heart rate</h2>
              <LineChart values={streams.heartrate || []} theme={theme} color="#f43f5e" yLabel="heart rate" unit=" bpm" />
            </section>

            <section style={{
              padding: 14,
              borderRadius: 16,
              border: `1px solid ${theme.cardBorder}`,
              background: theme.cardBg,
              display: 'grid',
              gap: 10,
            }}
            >
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: theme.textHeading }}>Heart rate zones</h2>
              <ZoneBars zones={zones} theme={theme} />
              {detail?.zoneSource === 'stream' ? (
                <div style={{ fontSize: 11, color: theme.textMuted }}>
                  Zones built from your HR stream (works without Strava Premium).
                </div>
              ) : null}
            </section>

            {(streams.velocityKmh || []).some((v) => Number(v) > 0) ? (
              <section style={{
                padding: 14,
                borderRadius: 16,
                border: `1px solid ${theme.cardBorder}`,
                background: theme.cardBg,
                display: 'grid',
                gap: 10,
              }}
              >
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: theme.textHeading }}>Speed</h2>
                <LineChart values={streams.velocityKmh || []} theme={theme} color={theme.green} yLabel="speed" unit=" km/h" />
              </section>
            ) : null}

            <section style={{
              borderRadius: 16,
              border: `1px solid ${theme.cardBorder}`,
              background: theme.cardBg,
              overflow: 'hidden',
            }}
            >
              <div style={{ padding: '14px 16px', fontWeight: 800, fontSize: 14, color: theme.textHeading, borderBottom: `1px solid ${theme.cardBorder}` }}>
                Km splits
              </div>
              {splits.length ? (
                <div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '40px 1fr 1fr 1fr',
                    gap: 8,
                    padding: '8px 16px',
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: theme.textMuted,
                  }}
                  >
                    <span>Km</span>
                    <span>Pace</span>
                    <span>Avg HR</span>
                    <span>Speed</span>
                  </div>
                  {splits.map((split) => (
                    <div
                      key={split.km}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '40px 1fr 1fr 1fr',
                        gap: 8,
                        padding: '11px 16px',
                        borderTop: `1px solid ${theme.cardBorder}`,
                        fontSize: 13,
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontWeight: 800, color: theme.orange }}>{split.km}</span>
                      <span style={{ fontWeight: 700, color: theme.cyan }}>{fmtPace(split.paceMinPerKm)}</span>
                      <span style={{ fontWeight: 700, color: '#f43f5e' }}>{split.avgHeartrate ? `${split.avgHeartrate}` : '--'}</span>
                      <span style={{ color: theme.textSecondary }}>{split.speedKmh ? `${split.speedKmh}` : '--'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 16, color: theme.textMuted, fontSize: 13 }}>
                  Splits appear after GPS/distance streams are imported for this run.
                </div>
              )}
            </section>
          </>
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
