import { useEffect, useRef, useState } from 'react';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

let leafletPromise = null;

function loadLeaflet() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }

    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.L));
      existing.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.body.appendChild(script);
  });

  return leafletPromise;
}

function fmtPaceFromKmh(kmh) {
  if (!kmh || kmh <= 0) return '--';
  const minPerKm = 60 / kmh;
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')}/km`;
}

function fmtClock(seconds = 0) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Route map with playhead — shows speed along the GPS track (Strava-style).
 * Expects polyline as [[lat,lng],...] and optional streams.time / velocityKmh / distance / heartrate.
 */
export function RunRouteMap({
  polyline = [],
  streams = {},
  theme,
  height = 220,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const routeLayerRef = useRef(null);
  const markerRef = useRef(null);
  const playedLayerRef = useRef(null);
  const rafRef = useRef(null);

  const points = (Array.isArray(polyline) && polyline.length
    ? polyline
    : (streams.latlng || [])
  ).filter((p) => Array.isArray(p) && p.length >= 2);

  const times = streams.time || [];
  const speeds = streams.velocityKmh || [];
  const distances = streams.distance || [];
  const hrs = streams.heartrate || [];

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedMul, setSpeedMul] = useState(8);

  const maxIndex = Math.max(0, points.length - 1);
  const sampleIndex = Math.min(Math.max(0, Math.floor(index)), maxIndex);
  const elapsed = times.length
    ? (times[Math.min(sampleIndex, times.length - 1)] ?? sampleIndex)
    : sampleIndex;
  const speedKmh = speeds.length
    ? (speeds[Math.min(sampleIndex, speeds.length - 1)] ?? null)
    : null;
  const distKm = distances.length
    ? Number(((distances[Math.min(sampleIndex, distances.length - 1)] || 0) / 1000).toFixed(2))
    : null;
  const hr = hrs.length
    ? (hrs[Math.min(sampleIndex, hrs.length - 1)] || null)
    : null;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = await loadLeaflet();
      if (cancelled || !L || !containerRef.current || points.length < 2) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: true,
        });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap &copy; CARTO',
        }).addTo(mapRef.current);
      }

      const map = mapRef.current;
      if (routeLayerRef.current) {
        try { map.removeLayer(routeLayerRef.current); } catch (_) { /* ignore */ }
      }
      if (playedLayerRef.current) {
        try { map.removeLayer(playedLayerRef.current); } catch (_) { /* ignore */ }
      }
      if (markerRef.current) {
        try { map.removeLayer(markerRef.current); } catch (_) { /* ignore */ }
      }

      routeLayerRef.current = L.polyline(points, {
        color: theme?.blue || '#2563eb',
        weight: 4,
        opacity: 0.45,
      }).addTo(map);

      playedLayerRef.current = L.polyline([points[0]], {
        color: theme?.orange || '#fc5200',
        weight: 5,
        opacity: 0.95,
      }).addTo(map);

      markerRef.current = L.circleMarker(points[0], {
        radius: 7,
        color: '#fff',
        weight: 2,
        fillColor: theme?.orange || '#fc5200',
        fillOpacity: 1,
      }).addTo(map);

      map.fitBounds(routeLayerRef.current.getBounds(), { padding: [18, 18], maxZoom: 15 });
      setTimeout(() => {
        try { map.invalidateSize(); } catch (_) { /* ignore */ }
      }, 80);      setIndex(0);
      setPlaying(false);
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [JSON.stringify(points.slice(0, 3)), points.length, theme?.blue, theme?.orange]);

  useEffect(() => {
    const L = typeof window !== 'undefined' ? window.L : null;
    if (!L || !mapRef.current || !points.length) return;
    const i = Math.min(Math.max(0, Math.floor(index)), maxIndex);
    const slice = points.slice(0, i + 1);
    if (playedLayerRef.current) {
      playedLayerRef.current.setLatLngs(slice.length ? slice : [points[0]]);
    }
    if (markerRef.current && points[i]) {
      markerRef.current.setLatLng(points[i]);
    }
  }, [index, maxIndex, points]);

  useEffect(() => {
    if (!playing || maxIndex <= 0) return undefined;

    let lastTs = 0;
    const tick = (ts) => {
      if (!lastTs) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;
      setIndex((prev) => {
        const next = prev + dt * speedMul * Math.max(1, maxIndex / 90);
        if (next >= maxIndex) {
          setPlaying(false);
          return maxIndex;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speedMul, maxIndex]);

  if (points.length < 2) {
    return (
      <div style={{
        height,
        borderRadius: 16,
        border: `1px dashed ${theme?.cardBorder || '#ddd'}`,
        display: 'grid',
        placeItems: 'center',
        color: theme?.textMuted || '#888',
        fontSize: 13,
        padding: 16,
        textAlign: 'center',
      }}
      >
        No GPS route for this run yet. Sync Strava once to save the map — it stays in Cosmix after that.
      </div>
    );
  }

  const displayIndex = Math.min(Math.round(index), maxIndex);

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div
        ref={containerRef}
        style={{ height, borderRadius: 16, overflow: 'hidden', border: `1px solid ${theme?.cardBorder || '#ddd'}` }}
      />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 8,
      }}
      >
        {[
          { label: 'Time', value: fmtClock(elapsed), color: theme?.textHeading || '#111' },
          { label: 'Distance', value: distKm != null ? `${distKm} km` : '--', color: theme?.blue || '#2563eb' },
          { label: 'Speed', value: speedKmh != null ? `${Number(speedKmh).toFixed(1)}` : '--', sub: speedKmh ? fmtPaceFromKmh(speedKmh) : 'km/h', color: theme?.green || '#16a34a' },
          { label: 'Heart rate', value: hr ? `${Math.round(hr)}` : '--', sub: 'bpm', color: '#f43f5e' },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              padding: '10px 8px',
              borderRadius: 12,
              border: `1px solid ${theme?.cardBorder || '#ddd'}`,
              background: theme?.cardBg || '#fff',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: theme?.textMuted || '#888' }}>{stat.label}</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: stat.color, marginTop: 4 }}>{stat.value}</div>
            {stat.sub ? <div style={{ fontSize: 10, color: theme?.textMuted || '#888', marginTop: 2 }}>{stat.sub}</div> : null}
          </div>
        ))}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 10,
        alignItems: 'center',
        padding: '10px 12px',
        borderRadius: 14,
        border: `1px solid ${theme?.cardBorder || '#ddd'}`,
        background: theme?.cardBg || '#fff',
      }}
      >
        <button
          type="button"
          onClick={() => {
            if (displayIndex >= maxIndex) setIndex(0);
            setPlaying((v) => !v);
          }}
          style={{
            border: 'none',
            borderRadius: 12,
            width: 48,
            height: 48,
            background: theme?.orange || '#fc5200',
            color: '#fff',
            fontWeight: 800,
            fontSize: 18,
            cursor: 'pointer',
            boxShadow: '0 8px 18px rgba(252,82,0,0.35)',
          }}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <div>
          <input
            type="range"
            min={0}
            max={maxIndex}
            value={displayIndex}
            onChange={(e) => {
              setPlaying(false);
              setIndex(Number(e.target.value));
            }}
            style={{ width: '100%' }}
          />
        </div>
        <select
          value={speedMul}
          onChange={(e) => setSpeedMul(Number(e.target.value))}
          style={{
            borderRadius: 10,
            border: `1px solid ${theme?.cardBorder || '#ddd'}`,
            background: theme?.pageBgSolid || theme?.cardBg || '#fff',
            color: theme?.textPrimary || '#111',
            padding: '8px 10px',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          <option value={4}>4×</option>
          <option value={8}>8×</option>
          <option value={16}>16×</option>
          <option value={32}>32×</option>
        </select>
      </div>
    </div>
  );
}
