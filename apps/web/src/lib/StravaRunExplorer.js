import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RunRouteMap } from './RunRouteMap';
import { isWellnessApiReady, wellnessApiUrl } from './runningShoes';

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

function ZonePercentBars({ zones = [], theme, colors = [] }) {
  if (!zones?.length) {
    return <div style={{ fontSize: 12, color: theme.textMuted }}>No zone data for this run</div>;
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {zones.map((zone, i) => (
        <div key={zone.zone || zone.label || i} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 48px', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: theme.textMuted, fontWeight: 700 }}>{zone.label || `Z${zone.zone}`}</span>
          <div style={{ height: 9, borderRadius: 999, background: theme.cardBorder, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(100, Number(zone.percent || 0))}%`,
              height: '100%',
              background: colors[i % colors.length] || theme.orange,
            }}
            />
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, color: theme.textHeading, textAlign: 'right' }}>
            {zone.percent != null ? `${zone.percent}%` : (zone.count ?? '--')}
          </span>
        </div>
      ))}
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
export function StravaRunExplorer({ userId, theme, onOpenRun }) {
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
  }, [userId]);

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
  const paceZones = mapDetail?.paceZones || mapDetail?.summary?.paceZones || [];
  const hrZones = mapDetail?.heartrateZones || mapDetail?.summary?.heartrateZones || [];

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
        subtitle="Pick a date · compact map · zones for that run only"
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
                border: `1px solid ${theme.cardBorder}`,
                background: theme.panelBg || theme.cardBg,
                color: theme.textHeading,
                borderRadius: 12,
                padding: '8px 12px',
                fontWeight: 700,
                fontSize: 13,
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} className="run-dash-charts-2">
        <DashPanel title="Pace zones" subtitle="selected run" theme={theme} accent="#38bdf8">
          <ZonePercentBars zones={paceZones} theme={theme} colors={['#94a3b8', '#38bdf8', '#22c55e', '#f59e0b', '#ef4444']} />
        </DashPanel>
        <DashPanel title="HR zones" subtitle="selected run" theme={theme} accent="#f43f5e">
          {hrZones.length ? (
            <ZonePercentBars zones={hrZones} theme={theme} colors={['#94a3b8', '#38bdf8', '#22c55e', '#f59e0b', '#ef4444', '#a855f7']} />
          ) : (
            <div style={{ fontSize: 12, color: theme.textMuted }}>No HR zones on this run.</div>
          )}
        </DashPanel>
      </div>
    </div>
  );
}
