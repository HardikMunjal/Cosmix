import { useEffect, useRef } from 'react';
import { boundingBox } from './buddySafetyGeo';

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

function pickMapPoints(trip) {
  const points = [];
  if (trip?.origin) points.push(trip.origin);
  if (trip?.destination) points.push(trip.destination);
  (trip?.pings || []).forEach((p) => points.push(p));
  (trip?.routePolyline || []).forEach((p) => points.push(p));
  return points;
}

export function BuddySafetyMap({ trip, theme, height, className = '' }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef({});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = await loadLeaflet();
      if (cancelled || !L || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: true,
        });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap &copy; CARTO',
        }).addTo(mapRef.current);
      }

      const map = mapRef.current;
      Object.values(layersRef.current).forEach((layer) => {
        try { map.removeLayer(layer); } catch (_) { /* ignore */ }
      });
      layersRef.current = {};

      const points = pickMapPoints(trip);
      const lastPing = trip?.pings?.length ? trip.pings[trip.pings.length - 1] : null;

      if (trip?.routePolyline?.length > 1) {
        const planned = L.polyline(
          trip.routePolyline.map((p) => [p.lat, p.lng]),
          { color: theme?.cyan || '#38bdf8', weight: 4, opacity: 0.55, dashArray: '8 8' },
        ).addTo(map);
        layersRef.current.planned = planned;
      } else if (trip?.origin && trip?.destination) {
        const planned = L.polyline(
          [[trip.origin.lat, trip.origin.lng], [trip.destination.lat, trip.destination.lng]],
          { color: theme?.cyan || '#38bdf8', weight: 3, opacity: 0.45, dashArray: '6 6' },
        ).addTo(map);
        layersRef.current.planned = planned;
      }

      if (trip?.pings?.length > 1) {
        const trail = L.polyline(
          trip.pings.map((p) => [p.lat, p.lng]),
          { color: theme?.green || '#22c55e', weight: 5, opacity: 0.9 },
        ).addTo(map);
        layersRef.current.trail = trail;
      }

      if (trip?.origin) {
        const startIcon = L.divIcon({
          className: '',
          html: `<div style="width:14px;height:14px;border-radius:50%;background:${theme?.blue || '#3b82f6'};border:2px solid #fff;box-shadow:0 0 0 2px ${theme?.blue || '#3b82f6'}55"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        layersRef.current.start = L.marker([trip.origin.lat, trip.origin.lng], { icon: startIcon })
          .bindPopup(`Start: ${trip.origin.label || 'Origin'}`)
          .addTo(map);
      }

      if (trip?.destination) {
        const destIcon = L.divIcon({
          className: '',
          html: `<div style="width:16px;height:16px;border-radius:4px;background:${theme?.yellow || '#eab308'};border:2px solid #fff;box-shadow:0 0 0 2px ${theme?.yellow || '#eab308'}55"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        layersRef.current.dest = L.marker([trip.destination.lat, trip.destination.lng], { icon: destIcon })
          .bindPopup(`Destination: ${trip.destination.label || 'Home'}`)
          .addTo(map);
      }

      if (lastPing) {
        const liveIcon = L.divIcon({
          className: '',
          html: `<div style="position:relative;width:28px;height:28px">
            <div style="position:absolute;inset:0;border-radius:50%;background:${theme?.red || '#ef4444'}33;animation:bs-pulse-ring 1.8s ease infinite"></div>
            <div style="position:absolute;inset:6px;border-radius:50%;background:linear-gradient(135deg,${theme?.red || '#ef4444'},#fb7185);border:3px solid #fff;box-shadow:0 0 16px ${theme?.red || '#ef4444'}cc"></div>
          </div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        layersRef.current.live = L.marker([lastPing.lat, lastPing.lng], { icon: liveIcon, zIndexOffset: 1000 })
          .bindPopup(`Live · ${Number(lastPing.distanceToDest || 0).toFixed(1)} km left`)
          .addTo(map);
      }

      const box = boundingBox(points, 0.4);
      if (points.length) {
        map.fitBounds([
          [box.minLat, box.minLng],
          [box.maxLat, box.maxLng],
        ], { padding: [28, 28], maxZoom: 16 });
      } else {
        map.setView([28.6139, 77.209], 11);
      }

      setTimeout(() => {
        try { map.invalidateSize(); } catch (_) { /* ignore */ }
      }, 120);
    })();

    return () => {
      cancelled = true;
    };
  }, [trip, theme]);

  useEffect(() => () => {
    if (mapRef.current) {
      try { mapRef.current.remove(); } catch (_) { /* ignore */ }
      mapRef.current = null;
    }
  }, []);

  return (
  <>
    <style>{`
      @keyframes bs-pulse-ring {
        0% { transform: scale(0.7); opacity: 0.85; }
        70% { transform: scale(1.6); opacity: 0; }
        100% { transform: scale(1.6); opacity: 0; }
      }
      .buddy-safety-map .leaflet-container {
        background: #060a14;
        font-family: inherit;
      }
      .buddy-safety-map .leaflet-control-zoom a {
        background: rgba(15,23,42,0.9) !important;
        color: #e2e8f0 !important;
        border-color: rgba(255,255,255,0.12) !important;
      }
    `}</style>
    <div
      ref={containerRef}
      className={`buddy-safety-map ${className}`.trim()}
      style={{
        width: '100%',
        height: height || undefined,
        overflow: 'hidden',
      }}
    />
  </>
  );
}
