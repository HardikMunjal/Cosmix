import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { restoreUserSession } from '../../lib/auth-client';
import { MobileBottomNav } from '../../lib/MobileNav';
import { useTheme } from '../../lib/ThemePicker';
import { RunRouteMap } from '../../lib/RunRouteMap';
import { isWellnessApiReady, wellnessApiUrl } from '../../lib/runningShoes';
import { ShareRunButton } from '../../lib/PersonalRecordModal';
import { hrEffortColor, hrZoneForBpm } from '../../lib/hrZones';

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

function resolveAthleteMaxHr(activityMaxHr) {
  const peak = Number(activityMaxHr) || 0;
  if (peak >= 185) return peak;
  return Math.max(190, peak);
}

function hrZoneGifSrc(zone) {
  const id = Math.max(1, Math.min(5, Number(zone?.id) || 1));
  return `/icons/hr-zones/z${id}.gif`;
}

function hrColor(bpm, maxHr = 190) {
  return hrEffortColor(bpm, resolveAthleteMaxHr(maxHr));
}

function weatherTheme(code) {
  const c = Number(code);
  if ([61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(c)) {
    return {
      key: 'rain',
      label: 'Rainy',
      gradient: 'linear-gradient(160deg, #0f172a 0%, #1e293b 40%, #334155 100%)',
      accent: '#7dd3fc',
      emoji: '🌧',
    };
  }
  if ([71, 73, 75, 77, 85, 86].includes(c)) {
    return {
      key: 'snow',
      label: 'Snow',
      gradient: 'linear-gradient(160deg, #0f172a 0%, #1e3a5f 55%, #64748b 100%)',
      accent: '#e2e8f0',
      emoji: '❄',
    };
  }
  if ([45, 48, 51, 53, 55, 56, 57].includes(c)) {
    return {
      key: 'fog',
      label: 'Foggy',
      gradient: 'linear-gradient(160deg, #111827 0%, #374151 60%, #6b7280 100%)',
      accent: '#d1d5db',
      emoji: '🌫',
    };
  }
  if ([1, 2, 3].includes(c)) {
    return {
      key: 'cloud',
      label: 'Cloudy',
      gradient: 'linear-gradient(160deg, #0b1220 0%, #1e293b 45%, #475569 100%)',
      accent: '#94a3b8',
      emoji: '☁',
    };
  }
  if (c === 0) {
    return {
      key: 'sun',
      label: 'Sunny',
      gradient: 'linear-gradient(160deg, #0c4a6e 0%, #0369a1 40%, #f59e0b 120%)',
      accent: '#fde68a',
      emoji: '☀',
    };
  }
  return {
    key: 'mixed',
    label: 'Mixed',
    gradient: 'linear-gradient(160deg, #020617 0%, #1e1b4b 50%, #0f766e 120%)',
    accent: '#a5b4fc',
    emoji: '🌤',
  };
}

async function fetchRunWeather({ lat, lng, date }) {
  if (lat == null || lng == null || !date) return null;
  const day = String(date).slice(0, 10);
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&start_date=${day}&end_date=${day}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const code = data?.daily?.weathercode?.[0];
  const tmax = data?.daily?.temperature_2m_max?.[0];
  const tmin = data?.daily?.temperature_2m_min?.[0];
  const precip = data?.daily?.precipitation_sum?.[0];
  if (code == null && tmax == null) return null;
  return {
    code,
    tempMax: tmax != null ? Math.round(tmax) : null,
    tempMin: tmin != null ? Math.round(tmin) : null,
    precip: precip != null ? Number(precip) : null,
    ...weatherTheme(code),
  };
}

function downsample(values = [], maxPoints = 120) {
  if (!Array.isArray(values) || values.length <= maxPoints) return values || [];
  const step = Math.ceil(values.length / maxPoints);
  const out = [];
  for (let i = 0; i < values.length; i += step) out.push(values[i]);
  return out;
}

function LineChart({ values = [], theme, color = '#f43f5e', height = 160, yLabel = 'bpm', unit = '', decimals = 0 }) {
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
  const span = Math.max(0.01, max - min);
  const pts = series.map((v, i) => {
    const x = pad + (i / (series.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${x},${y}`;
  }).join(' ');
  const avg = series.reduce((a, b) => a + b, 0) / series.length;
  const fmt = (n) => (decimals > 0 ? Number(n).toFixed(decimals) : Math.round(n));

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height, display: 'block' }}>
        <defs>
          <linearGradient id={`lc-${yLabel.replace(/\s/g, '')}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="55%" stopColor={color} />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
        <polyline fill="none" stroke={`url(#lc-${yLabel.replace(/\s/g, '')})`} strokeWidth="2.5" strokeLinejoin="round" points={pts} />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
        <span>min {fmt(min)}{unit}</span>
        <span>avg {fmt(avg)}{unit}</span>
        <span>max {fmt(max)}{unit}</span>
      </div>
    </div>
  );
}

const ZONE_COLORS = ['#94a3b8', '#22c55e', '#38bdf8', '#f59e0b', '#ef4444'];

function ZoneBars({ zones = [], theme }) {
  const total = zones.reduce((sum, z) => sum + Number(z.seconds || 0), 0) || 1;
  if (!zones.length) {
    return <div style={{ color: theme.textMuted, fontSize: 12 }}>No zone data for this run</div>;
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {zones.map((zone, index) => {
        const pct = zone.percent != null
          ? Math.round(Number(zone.percent))
          : Math.round((Number(zone.seconds || 0) / total) * 100);
        const color = ZONE_COLORS[Math.min(ZONE_COLORS.length - 1, Math.max(0, Number(zone.zone || index + 1) - 1))];
        return (
          <div key={zone.zone || zone.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: theme.textSecondary, fontWeight: 700 }}>{zone.label || `Z${zone.zone}`}</span>
              <span style={{ color: theme.textMuted, textAlign: 'right' }}>
                {zone.minutes ?? (Number(zone.seconds || 0) / 60).toFixed(1)} min · {pct}%
                {zone.avgSpeedKmh ? ` · ${zone.avgSpeedKmh} km/h` : ''}
              </span>
            </div>
            <div style={{ height: 10, borderRadius: 99, background: theme.cardBorder, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 99 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FuelBurnPanel({ fuel, theme }) {
  if (!fuel || (fuel.fatPercent == null && !fuel.calories)) {
    return <div style={{ color: theme.textMuted, fontSize: 12 }}>Import HR zones to estimate fat vs carb burn.</div>;
  }
  const rows = [
    { key: 'fat', label: 'Fat burn', pct: fuel.fatPercent, kcal: fuel.fatKcal, color: '#22c55e' },
    { key: 'carb', label: 'Carb burn', pct: fuel.carbPercent, kcal: fuel.carbKcal, color: '#f59e0b' },
    { key: 'other', label: 'Other', pct: fuel.otherPercent, kcal: fuel.otherKcal, color: '#94a3b8' },
  ];
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {fuel.calories ? (
        <div style={{ fontSize: 12, color: theme.textMuted }}>
          Total energy · <strong style={{ color: theme.textHeading }}>{fuel.calories} kcal</strong>
        </div>
      ) : null}
      {rows.map((row) => (
        <div key={row.key}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ fontWeight: 700, color: theme.textSecondary }}>{row.label}</span>
            <span style={{ color: theme.textMuted }}>
              {row.pct != null ? `${row.pct}%` : '--'}
              {row.kcal != null ? ` · ${row.kcal} kcal` : ''}
            </span>
          </div>
          <div style={{ height: 10, borderRadius: 99, background: theme.cardBorder, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, Number(row.pct || 0))}%`, height: '100%', background: row.color, borderRadius: 99 }} />
          </div>
        </div>
      ))}
      {fuel.note ? <div style={{ fontSize: 11, color: theme.textMuted }}>{fuel.note}</div> : null}
    </div>
  );
}

function StatPill({ label, value, theme, accent }) {
  return (
    <div style={{
      padding: '12px 14px',
      borderRadius: 14,
      border: '1px solid rgba(148,163,184,0.22)',
      background: 'rgba(15,23,42,0.72)',
      backdropFilter: 'blur(8px)',
    }}
    >
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent || '#f8fafc', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function CardSection({ title, theme, children, hint }) {
  return (
    <section style={{
      padding: 14,
      borderRadius: 16,
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      display: 'grid',
      gap: 10,
    }}
    >
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: theme.textHeading }}>{title}</h2>
      {hint ? <div style={{ fontSize: 11, color: theme.textMuted, lineHeight: 1.45 }}>{hint}</div> : null}
      {children}
    </section>
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
  const [weather, setWeather] = useState(null);

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
  const fuelBurn = detail?.fuelBurn || summary.fuelBurn || null;
  const maxHrRef = resolveAthleteMaxHr(summary.maxHeartrate || 0);

  useEffect(() => {
    let cancelled = false;
    const lat = summary.startLat ?? detail?.polyline?.[0]?.[0] ?? streams.latlng?.[0]?.[0];
    const lng = summary.startLng ?? detail?.polyline?.[0]?.[1] ?? streams.latlng?.[0]?.[1];
    const date = summary.date;
    if (lat == null || lng == null || !date) {
      setWeather(null);
      return undefined;
    }
    fetchRunWeather({ lat, lng, date }).then((result) => {
      if (!cancelled) setWeather(result);
    }).catch(() => {
      if (!cancelled) setWeather(null);
    });
    return () => { cancelled = true; };
  }, [summary.startLat, summary.startLng, summary.date, detail?.polyline, streams.latlng]);

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
    <div style={{ minHeight: '100vh', background: '#020617', paddingBottom: 88, color: '#e2e8f0' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 14px 24px', display: 'grid', gap: 14 }}>
        <div style={{
          borderRadius: 24,
          overflow: 'hidden',
          border: '1px solid rgba(148,163,184,0.22)',
          background: weather?.gradient || 'linear-gradient(160deg, #020617 0%, #1e1b4b 50%, #0f766e 120%)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
        }}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '14px 14px 0' }}>
            <button
              type="button"
              onClick={() => router.push('/running-analytics')}
              style={{
                border: '1px solid rgba(148,163,184,0.28)',
                background: 'rgba(15,23,42,0.55)',
                color: '#f8fafc',
                borderRadius: 12,
                padding: '8px 12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ← Back
            </button>
            <div style={{ flex: 1 }} />
            {weather ? (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                borderRadius: 999,
                background: 'rgba(15,23,42,0.45)',
                border: '1px solid rgba(255,255,255,0.12)',
                fontSize: 12,
                fontWeight: 800,
                color: weather.accent,
              }}
              >
                <span>{weather.emoji}</span>
                <span>{weather.label}</span>
                {weather.tempMax != null ? <span>· {weather.tempMin}–{weather.tempMax}°C</span> : null}
              </div>
            ) : null}
          </div>

          <div style={{ padding: '18px 16px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(226,232,240,0.7)' }}>
              {fmtDate(summary.date)}
              {summary.locationCity ? ` · ${summary.locationCity}` : ''}
              {detail?.cached ? ' · offline-ready' : ''}
            </div>
            <div style={{
              marginTop: 8,
              fontSize: 'clamp(26px, 7vw, 36px)',
              fontWeight: 900,
              letterSpacing: '-0.03em',
              color: '#f8fafc',
              lineHeight: 1.15,
            }}
            >
              {summary.name || 'Run'}
            </div>
            {userId && (detail?.polyline?.length || streams.latlng?.length) ? (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <ShareRunButton
                  userId={userId}
                  activityId={activityId}
                  athleteName={user?.name || user?.username || ''}
                  theme={{ textMuted: '#94a3b8' }}
                  compact
                  summary={summary}
                  polyline={detail?.polyline?.length ? detail.polyline : streams.latlng}
                />
              </div>
            ) : null}
            <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(226,232,240,0.78)', fontWeight: 600 }}>
              {summary.distanceKm ?? '--'} km · {fmtMins(summary.minutes)} · {summary.paceMinPerKm ? `${fmtPace(summary.paceMinPerKm)} /km` : '--'}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, padding: '0 14px 14px' }}>
            <StatPill label="Avg HR" value={summary.avgHeartrate ? `${summary.avgHeartrate} bpm` : '--'} theme={theme} accent={hrColor(summary.avgHeartrate, maxHrRef)} />
            <StatPill label="Max HR" value={summary.maxHeartrate ? `${summary.maxHeartrate} bpm` : '--'} theme={theme} accent={hrColor(summary.maxHeartrate, maxHrRef)} />
            <StatPill label="VO2 max" value={summary.vo2Max ? `${summary.vo2Max}${summary.vo2Estimated ? ' est.' : ''}` : '--'} theme={theme} accent="#34d399" />
            <StatPill
              label="Fastest 1 km"
              value={summary.bestSplitPaceMinPerKm ? `${fmtPace(summary.bestSplitPaceMinPerKm)} /km` : '--'}
              theme={theme}
              accent="#67e8f9"
            />
            <StatPill label="Avg cadence" value={summary.avgCadence ? `${summary.avgCadence} spm` : '--'} theme={theme} accent="#a78bfa" />
            <StatPill label="Avg stride" value={summary.avgStrideM ? `${summary.avgStrideM} m` : '--'} theme={theme} accent="#34d399" />
            <StatPill label="Elevation" value={summary.elevationGainM != null ? `↑${summary.elevationGainM} m` : '--'} theme={theme} accent="#c4b5fd" />
            {summary.calories ? (
              <StatPill label="Calories" value={`${summary.calories} kcal`} theme={theme} accent="#fb923c" />
            ) : (
              <StatPill label="Best pace" value={summary.paceMinPerKm ? `${fmtPace(summary.paceMinPerKm)} /km` : '--'} theme={theme} accent="#38bdf8" />
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>Loading run maps & streams…</div>
        ) : (
          <>
            {error ? (
              <div style={{ padding: 12, borderRadius: 12, border: '1px solid rgba(148,163,184,0.25)', color: '#94a3b8', fontSize: 13 }}>
                {error}
              </div>
            ) : null}

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

            <CardSection title="Heart rate" theme={theme}>
              <LineChart values={streams.heartrate || []} theme={theme} color="#f43f5e" yLabel="heart rate" unit=" bpm" />
            </CardSection>

            <CardSection
              title="Heart rate zones"
              theme={theme}
              hint="Fat Burning is typically ~60–70% of max HR. Bars show % of run time and average speed while you were in that zone."
            >
              <ZoneBars zones={zones} theme={theme} />
              {detail?.zoneSource === 'stream' ? (
                <div style={{ fontSize: 11, color: theme.textMuted }}>
                  Zones built from your HR stream (works without Strava Premium).
                </div>
              ) : null}
            </CardSection>

            <CardSection
              title="Fuel burn estimate"
              theme={theme}
              hint="Share of energy from fat vs carbohydrate, estimated from time spent in each HR zone."
            >
              <FuelBurnPanel fuel={fuelBurn} theme={theme} />
            </CardSection>

            {(streams.velocityKmh || []).some((v) => Number(v) > 0) ? (
              <CardSection title="Speed" theme={theme}>
                <LineChart values={streams.velocityKmh || []} theme={theme} color={theme.green} yLabel="speed" unit=" km/h" decimals={1} />
              </CardSection>
            ) : null}

            <CardSection
              title="Cadence"
              theme={theme}
              hint="Cadence is steps per minute (spm). Most runners settle near 160–180 spm; higher cadence often means shorter, quicker steps."
            >
              <LineChart values={streams.cadence || []} theme={theme} color="#a78bfa" yLabel="cadence" unit=" spm" />
            </CardSection>

            <CardSection
              title="Stride length"
              theme={theme}
              hint="Stride length is the distance covered per step (meters). Cosmix estimates it from GPS distance ÷ steps when cadence is available."
            >
              <LineChart values={streams.strideLengthM || []} theme={theme} color="#34d399" yLabel="stride" unit=" m" decimals={2} />
            </CardSection>

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
                    gridTemplateColumns: '28px 0.85fr 1.1fr 1fr 1.15fr',
                    gap: 6,
                    padding: '8px 16px',
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: theme.textMuted,
                  }}
                  >
                    <span />
                    <span>Time</span>
                    <span>Pace</span>
                    <span>Heart Rate</span>
                    <span>Zone</span>
                  </div>
                  {splits.map((split) => {
                    const zone = Number(split.avgHeartrate) > 0
                      ? hrZoneForBpm(split.avgHeartrate, maxHrRef)
                      : null;
                    return (
                      <div
                        key={split.km}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '28px 0.85fr 1.1fr 1fr 1.15fr',
                          gap: 6,
                          padding: '11px 16px',
                          borderTop: `1px solid ${theme.cardBorder}`,
                          fontSize: 13,
                          alignItems: 'center',
                          background: summary?.bestSplitKm === split.km && summary?.bestSplitPaceMinPerKm === split.paceMinPerKm
                            ? `${theme.cyan}14`
                            : 'transparent',
                        }}
                      >
                        <span style={{ fontWeight: 700, color: '#94a3b8' }}>{split.km}</span>
                        <span style={{ fontWeight: 700, color: '#d4b84a' }}>
                          {`${Math.floor((Number(split.seconds) || 0) / 60)}:${String(Math.round((Number(split.seconds) || 0) % 60)).padStart(2, '0')}`}
                        </span>
                        <span style={{ fontWeight: 700, color: '#5ec8d4' }}>{fmtPace(split.paceMinPerKm)} /km</span>
                        <span style={{
                          fontWeight: 800,
                          color: '#e07a5a',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                        >
                          {zone ? (
                            <img
                              src={hrZoneGifSrc(zone)}
                              alt={zone.label}
                              title={`${zone.short} · ${zone.label}`}
                              width={18}
                              height={18}
                              style={{ display: 'block', flexShrink: 0 }}
                            />
                          ) : null}
                          {split.avgHeartrate ? `${split.avgHeartrate} bpm` : '--'}
                        </span>
                        <span style={{ fontWeight: 700, color: '#86efac', fontSize: 12, lineHeight: 1.25 }}>
                          {zone ? `${zone.short} · ${zone.label}` : '--'}
                        </span>
                      </div>
                    );
                  })}
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
          { id: 'home', label: 'Home', href: '/dashboard', icon: '⌂' },
          { id: 'stats', label: 'Running', href: '/running-analytics', icon: '📈' },
          { id: 'wellness', label: 'Wellness', href: '/wellness', icon: '♥' },
          { id: 'maps', label: 'Maps', href: '/running-maps', icon: '🗺' },
        ]}
      />
    </div>
  );
}
