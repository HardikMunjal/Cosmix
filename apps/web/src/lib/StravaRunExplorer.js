import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RunRouteMap } from './RunRouteMap';
import { isWellnessApiReady, wellnessApiUrl } from './runningShoes';
import { hrEffortColor, hrZoneForBpm, hrZoneLegend, buildSmoothColorSegments, smoothAreaPath } from './hrZones';
import { HrEffortLegend } from './RunningModernCharts';

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

function fmtSplitClock(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function SplitPaceHrChart({ splits = [], theme, maxHr }) {
  const rows = (splits || [])
    .map((split) => ({
      km: Number(split.km) || 0,
      pace: Number(split.paceMinPerKm) || 0,
      hr: Number(split.avgHeartrate) || 0,
    }))
    .filter((row) => row.pace > 0);

  if (rows.length < 2) return null;

  const ceiling = Number(maxHr) || Math.max(...rows.map((r) => r.hr), 190);
  const legend = hrZoneLegend(ceiling);
  const w = 360;
  const h = 148;
  const pad = { t: 18, r: 14, b: 28, l: 14 };
  const paces = rows.map((r) => r.pace);
  const min = Math.min(...paces);
  const max = Math.max(...paces);
  const span = Math.max(0.2, max - min);
  const baseY = h - pad.b;
  const fallback = theme.cyan || '#38bdf8';
  const coords = rows.map((row, i) => {
    const x = pad.l + (i / (rows.length - 1)) * (w - pad.l - pad.r);
    const y = pad.t + ((row.pace - min) / span) * (h - pad.t - pad.b);
    const color = row.hr > 0 ? hrEffortColor(row.hr, ceiling, fallback) : fallback;
    const zone = row.hr > 0 ? hrZoneForBpm(row.hr, ceiling) : null;
    return { ...row, x, y, color, zone };
  });

  const areaPath = smoothAreaPath(coords, baseY, 16);
  const smoothSegs = buildSmoothColorSegments(coords, 16);
  const midColor = coords[Math.floor(coords.length / 2)]?.color || fallback;
  const gid = `split-area-${coords.length}-${String(midColor).replace('#', '')}`;

  const zoneCounts = rows.reduce((acc, row) => {
    if (!row.hr) return acc;
    const zone = hrZoneForBpm(row.hr, ceiling);
    acc[zone.key] = (acc[zone.key] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ display: 'grid', gap: 10, paddingTop: 4 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading }}>This run · pace by km</div>
        <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 3, lineHeight: 1.45 }}>
          Km pace area · line color follows heart rate (easy → hard).
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 148, display: 'block' }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={midColor} stopOpacity="0.38" />
            <stop offset="70%" stopColor={midColor} stopOpacity="0.12" />
            <stop offset="100%" stopColor={midColor} stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id={`${gid}-h`} x1="0" y1="0" x2="1" y2="0">
            {coords.map((c, i) => (
              <stop
                key={`stop-${i}`}
                offset={`${(i / Math.max(1, coords.length - 1)) * 100}%`}
                stopColor={c.color}
                stopOpacity="0.22"
              />
            ))}
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gid})`} />
        <path d={areaPath} fill={`url(#${gid}-h)`} />
        {smoothSegs.map((seg, i) => (
          <path
            key={`seg-${i}`}
            d={seg.d}
            fill="none"
            stroke={seg.color}
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {coords.map((c) => (
          <text key={`km-${c.km}`} x={c.x} y={h - 8} textAnchor="middle" fill={theme.textMuted} fontSize="9" fontWeight="700">
            {c.km}
          </text>
        ))}
      </svg>
      <HrEffortLegend theme={theme} legend={legend} counts={zoneCounts} unit="km" />
    </div>
  );
}

function DashPanel({ title, subtitle, theme, children, accent }) {
  return (
    <div style={{
      padding: 14,
      borderRadius: 20,
      background: theme.cardBg,
      border: `1px solid ${theme.cardBorder}`,
      boxShadow: theme.chartDepth || `0 12px 28px ${accent}18`,
      display: 'grid',
      gap: 12,
    }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 900, color: theme.textHeading }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{subtitle}</div> : null}
      </div>
      {children}
    </div>
  );
}

/** Compact map + calendar date picker (no crowded run chips). */
export function StravaRunExplorer({ userId, theme, onOpenRun, refreshKey = 0 }) {
  const [mapCards, setMapCards] = useState([]);
  const [mapRunId, setMapRunId] = useState(null);
  const [mapDetail, setMapDetail] = useState(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');

  useEffect(() => {
    if (!userId || !isWellnessApiReady()) return undefined;
    let cancelled = false;
    fetch(wellnessApiUrl(`/wellness/strava/maps/${encodeURIComponent(userId)}?limit=60`))
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (cancelled || !payload?.cards) return;
        setMapCards(payload.cards);
        const usable = (payload.cards || []).filter((card) => (
          card?.hasMap
          && Array.isArray(card.polyline)
          && card.polyline.length > 1
          && Number(card.summary?.distanceKm || 0) >= 0.3
        ));
        if (usable[0]?.activityId) {
          setMapRunId(Number(usable[0].activityId));
          const d = String(usable[0].summary?.date || '').slice(0, 10);
          if (d) setSelectedDate(d);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId, refreshKey]);

  const usableMaps = useMemo(() => (mapCards || []).filter((card) => (
    card?.hasMap
    && Array.isArray(card.polyline)
    && card.polyline.length > 1
    && Number(card.summary?.distanceKm || 0) >= 0.3
  )), [mapCards]);

  const dateOptions = useMemo(() => {
    const map = new Map();
    usableMaps.forEach((card) => {
      const d = String(card.summary?.date || '').slice(0, 10);
      if (d && !map.has(d)) map.set(d, card);
    });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [usableMaps]);

  const dateSet = useMemo(() => new Set(dateOptions.map(([d]) => d)), [dateOptions]);
  const minDate = dateOptions.length ? dateOptions[dateOptions.length - 1][0] : '';
  const maxDate = dateOptions.length ? dateOptions[0][0] : '';

  useEffect(() => {
    if (!userId || !mapRunId || !isWellnessApiReady()) {
      setMapDetail(null);
      return undefined;
    }
    let cancelled = false;
    setMapLoading(true);
    fetch(wellnessApiUrl(`/wellness/strava/runs/${encodeURIComponent(userId)}/${encodeURIComponent(mapRunId)}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (!cancelled) setMapDetail(payload);
      })
      .catch(() => {
        if (!cancelled) setMapDetail(null);
      })
      .finally(() => {
        if (!cancelled) setMapLoading(false);
      });
    return () => { cancelled = true; };
  }, [userId, mapRunId]);

  const selectDate = (iso) => {
    setSelectedDate(iso);
    const card = dateOptions.find(([d]) => d === iso)?.[1];
    if (card?.activityId) setMapRunId(Number(card.activityId));
  };

  const stepDate = (dir) => {
    const idx = dateOptions.findIndex(([d]) => d === selectedDate);
    if (idx < 0) return;
    const next = dateOptions[idx - dir];
    if (next) selectDate(next[0]);
  };

  const activeCard = usableMaps.find((card) => Number(card.activityId) === Number(mapRunId)) || usableMaps[0] || null;
  const mapSummary = mapDetail?.summary || activeCard?.summary || null;
  const playPolyline = mapDetail?.polyline?.length
    ? mapDetail.polyline
    : (mapDetail?.streams?.latlng || activeCard?.polyline || []);
  const playStreams = mapDetail?.streams || {};
  const mapSplits = Array.isArray(mapDetail?.splits) ? mapDetail.splits : [];
  const maxHrRef = Number(mapSummary?.maxHeartrate || mapDetail?.summary?.maxHeartrate || 0) || 190;

  if (!usableMaps.length && !mapRunId) {
    return (
      <div style={{
        padding: 14,
        borderRadius: 14,
        border: `1px dashed ${theme.cardBorder}`,
        color: theme.textMuted,
        fontSize: 12,
        lineHeight: 1.45,
      }}
      >
        No GPS maps cached yet. After Strava sync, routes appear here.
        {' '}
        <Link href="/running-maps" style={{ color: theme.orange, fontWeight: 800 }}>Browse map archive →</Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <DashPanel
        title="Route playback"
        subtitle="Pick a date · compact map · km splits for that run"
        theme={theme}
        accent="#fc5200"
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => stepDate(-1)}
              disabled={!dateOptions.length}
              style={{
                border: `1px solid ${theme.cardBorder}`,
                background: theme.panelBg || theme.cardBg,
                color: theme.textHeading,
                borderRadius: 10,
                width: 36,
                height: 36,
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              ‹
            </button>
            <input
              type="date"
              value={selectedDate || maxDate}
              min={minDate || undefined}
              max={maxDate || undefined}
              onChange={(e) => {
                const v = e.target.value;
                if (dateSet.has(v)) selectDate(v);
                else {
                  // snap to nearest available date on or before selection
                  const nearest = dateOptions.find(([d]) => d <= v) || dateOptions[dateOptions.length - 1];
                  if (nearest) selectDate(nearest[0]);
                }
              }}
              style={{
                border: `1px solid ${theme.inputBorder || theme.cardBorder}`,
                background: theme.inputBg || theme.panelBg || theme.cardBg,
                color: theme.textHeading,
                borderRadius: 12,
                padding: '8px 12px',
                fontWeight: 700,
                fontSize: 13,
                colorScheme: theme.pageBgSolid?.startsWith('#0') || theme.pageBgSolid?.startsWith('#1') ? 'dark' : 'light',
              }}
            />
            <button
              type="button"
              onClick={() => stepDate(1)}
              disabled={!dateOptions.length}
              style={{
                border: `1px solid ${theme.cardBorder}`,
                background: theme.panelBg || theme.cardBg,
                color: theme.textHeading,
                borderRadius: 10,
                width: 36,
                height: 36,
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              ›
            </button>
            <span style={{ fontSize: 11, color: theme.textMuted }}>{dateOptions.length} mapped runs</span>
          </div>
          <Link
            href="/running-maps"
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: theme.orange,
              textDecoration: 'none',
            }}
          >
            All maps →
          </Link>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: theme.textHeading }}>
              {mapSummary?.name || 'Run'}
              {mapLoading ? <span style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted }}> · loading…</span> : null}
            </div>
            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
              {fmtDate(mapSummary?.date)}
              {' · '}
              {mapSummary?.distanceKm ?? '--'} km
              {' · '}
              {fmtPace(mapSummary?.paceMinPerKm)}
              {mapSummary?.avgHeartrate ? ` · avg HR ${mapSummary.avgHeartrate}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={() => mapRunId && onOpenRun?.(mapRunId)}
            style={{
              border: 'none',
              borderRadius: 12,
              padding: '10px 14px',
              background: 'linear-gradient(135deg,#fc5200,#f97316)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 12,
              cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(252,82,0,0.35)',
            }}
          >
            Open full run →
          </button>
        </div>

        <RunRouteMap
          polyline={playPolyline}
          streams={playStreams}
          theme={theme}
          height={190}
        />
      </DashPanel>

      <DashPanel title="Km splits" subtitle="pace · time · HR" theme={theme} accent={theme.cyan || '#38bdf8'}>
        {mapLoading ? (
          <div style={{ fontSize: 12, color: theme.textMuted }}>Loading splits…</div>
        ) : mapSplits.length ? (
          <>
            <div style={{ display: 'grid', gap: 0, maxHeight: 220, overflowY: 'auto' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '36px 1fr 1fr 1fr',
                gap: 8,
                padding: '4px 2px 8px',
                fontSize: 10,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: theme.textMuted,
                position: 'sticky',
                top: 0,
                background: theme.cardBg,
              }}
              >
                <span>Km</span>
                <span>Pace</span>
                <span>Time</span>
                <span>HR</span>
              </div>
              {mapSplits.map((split) => {
                const zone = Number(split.avgHeartrate) > 0 ? hrZoneForBpm(split.avgHeartrate, maxHrRef) : null;
                return (
                  <div
                    key={split.km}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '36px 1fr 1fr 1fr',
                      gap: 8,
                      padding: '8px 2px',
                      borderTop: `1px solid ${theme.cardBorder}`,
                      fontSize: 13,
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontWeight: 800, color: theme.orange }}>{split.km}</span>
                    <span style={{ fontWeight: 700, color: zone?.color || theme.cyan || '#38bdf8' }}>{fmtPace(split.paceMinPerKm)}</span>
                    <span style={{ fontWeight: 700, color: theme.textHeading }}>{fmtSplitClock(split.seconds)}</span>
                    <span style={{ fontWeight: 700, color: zone?.color || '#f43f5e' }}>
                      {split.avgHeartrate ? `${split.avgHeartrate}` : '--'}
                      {zone ? <span style={{ display: 'block', fontSize: 9, fontWeight: 700, opacity: 0.85 }}>{zone.short} {zone.label}</span> : null}
                    </span>
                  </div>
                );
              })}
            </div>
            <SplitPaceHrChart splits={mapSplits} theme={theme} maxHr={maxHrRef} />
          </>
        ) : (
          <div style={{ fontSize: 12, color: theme.textMuted }}>
            Splits appear after GPS streams are imported for this run.
          </div>
        )}
      </DashPanel>
    </div>
  );
}
