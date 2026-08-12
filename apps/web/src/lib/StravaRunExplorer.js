import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RunRouteMap } from './RunRouteMap';
import { isWellnessApiReady, wellnessApiUrl } from './runningShoes';
import { hrZoneForBpm } from './hrZones';

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

function hrZoneGifSrc(zone) {
  const id = Math.max(1, Math.min(5, Number(zone?.id) || 1));
  return `/icons/hr-zones/z${id}.gif`;
}

function resolveAthleteMaxHr(activityMaxHr) {
  const peak = Number(activityMaxHr) || 0;
  // Easy-run peaks aren't true max HR — keep a capacity floor so Z2 isn't labeled Z3.
  if (peak >= 185) return peak;
  return Math.max(190, peak);
}

function fmtPartialDistance(km) {
  const m = Math.round(Number(km) * 1000);
  if (m > 0 && m < 1000) return `${m} m`;
  return `${Number(km).toFixed(2)} km`;
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
  const maxHrRef = resolveAthleteMaxHr(mapSummary?.maxHeartrate || mapDetail?.summary?.maxHeartrate || 0);

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

      <DashPanel title="Km splits" subtitle="time · pace · heart rate · zone" theme={theme} accent={theme.cyan || '#38bdf8'}>
        {mapLoading ? (
          <div style={{ fontSize: 12, color: theme.textMuted }}>Loading splits…</div>
        ) : mapSplits.length ? (
          <>
            <div style={{ display: 'grid', gap: 0, maxHeight: 260, overflowY: 'auto' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '28px 0.85fr 1.1fr 1fr 1.15fr',
                gap: 6,
                padding: '4px 2px 8px',
                fontSize: 10,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: theme.textMuted,
                position: 'sticky',
                top: 0,
                background: theme.cardBg,
              }}
              >
                <span />
                <span>Time</span>
                <span>Pace</span>
                <span>Heart Rate</span>
                <span>Zone</span>
              </div>
              {mapSplits.map((split) => {
                const zone = Number(split.avgHeartrate) > 0 ? hrZoneForBpm(split.avgHeartrate, maxHrRef) : null;
                return (
                  <div
                    key={split.km}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '28px 0.85fr 1.1fr 1fr 1.15fr',
                      gap: 6,
                      padding: '10px 2px',
                      borderTop: `1px solid ${theme.cardBorder}`,
                      fontSize: 13,
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontWeight: 700, color: '#94a3b8' }}>
                      {split.km}
                      {Number(split.distanceKm) > 0 && Number(split.distanceKm) < 0.95
                        ? <span style={{ fontWeight: 600, color: theme.textMuted, fontSize: 10 }}> · {fmtPartialDistance(split.distanceKm)}</span>
                        : null}
                    </span>
                    <span style={{ fontWeight: 700, color: '#d4b84a' }}>{fmtSplitClock(split.seconds)}</span>
                    <span style={{ fontWeight: 700, color: '#5ec8d4' }}>{fmtPace(split.paceMinPerKm)}</span>
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
