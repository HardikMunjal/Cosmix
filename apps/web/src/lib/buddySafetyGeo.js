const EARTH_RADIUS_KM = 6371;

export function toRad(deg) {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

/** Haversine distance in km between two lat/lng points. */
export function haversineKm(a, b) {
  if (!a || !b) return 0;
  const lat1 = toRad(Number(a.lat));
  const lat2 = toRad(Number(b.lat));
  const dLat = toRad(Number(b.lat) - Number(a.lat));
  const dLng = toRad(Number(b.lng) - Number(a.lng));
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(x));
}

/** Sum of segment distances along a path of pings. */
export function pathDistanceKm(pings = []) {
  let total = 0;
  for (let i = 1; i < pings.length; i += 1) {
    total += haversineKm(pings[i - 1], pings[i]);
  }
  return total;
}

export function formatKm(km, digits = 1) {
  const n = Number(km);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(digits)} km`;
}

export function formatDuration(ms) {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Bearing from point A to B in degrees (0 = north). */
export function bearingDeg(a, b) {
  const lat1 = toRad(Number(a.lat));
  const lat2 = toRad(Number(b.lat));
  const dLng = toRad(Number(b.lng) - Number(a.lng));
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function boundingBox(points = [], paddingKm = 0.3) {
  const valid = points.filter((p) => Number.isFinite(Number(p?.lat)) && Number.isFinite(Number(p?.lng)));
  if (!valid.length) {
    return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
  }
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of valid) {
    minLat = Math.min(minLat, Number(p.lat));
    maxLat = Math.max(maxLat, Number(p.lat));
    minLng = Math.min(minLng, Number(p.lng));
    maxLng = Math.max(maxLng, Number(p.lng));
  }
  const pad = paddingKm / 111;
  return {
    minLat: minLat - pad,
    maxLat: maxLat + pad,
    minLng: minLng - pad,
    maxLng: maxLng + pad,
  };
}

/**
 * Project lat/lng into 0–100% SVG coordinates within a bounding box.
 */
export function projectToSvg(lat, lng, box, width = 100, height = 100) {
  const latSpan = box.maxLat - box.minLat || 0.001;
  const lngSpan = box.maxLng - box.minLng || 0.001;
  const x = ((Number(lng) - box.minLng) / lngSpan) * width;
  const y = height - ((Number(lat) - box.minLat) / latSpan) * height;
  return { x, y };
}

export function buildPolylinePoints(coords = [], box, width = 100, height = 100) {
  return coords
    .map((c) => {
      const { x, y } = projectToSvg(c.lat, c.lng, box, width, height);
      return `${x},${y}`;
    })
    .join(' ');
}

/**
 * Evaluate trip progress and detect milestones / stall alerts.
 */
export function evaluateTripProgress(trip, ping, options = {}) {
  const notifyEveryKm = Number(options.notifyEveryKm || trip.notifyEveryKm || 2);
  const notifyIntervalMinutes = Number(options.notifyIntervalMinutes || trip.notifyIntervalMinutes || 15);
  const stallMinutes = Number(options.stallMinutes || trip.stallMinutes || 8);
  const stallToleranceKm = Number(options.stallToleranceKm || 0.15);
  const arriveRadiusKm = Number(options.arriveRadiusKm || 0.2);

  const destination = trip.destination;
  const origin = trip.origin || ping;
  const distanceToDest = haversineKm(ping, destination);
  const distanceFromStart = haversineKm(origin, ping);
  const plannedKm = Number(trip.plannedDistanceKm) || haversineKm(origin, destination);

  const events = [];
  const now = Date.now();

  const bestDistance = Math.min(
    Number(trip.bestDistanceToDest ?? distanceToDest),
    distanceToDest,
  );

  const lastMilestone = Number(trip.lastMilestoneKm || 0);
  const crossedKm = Math.floor(distanceFromStart / notifyEveryKm) * notifyEveryKm;
  if (crossedKm > 0 && crossedKm > lastMilestone) {
    events.push({
      type: 'milestone',
      km: crossedKm,
      message: `Covered ${crossedKm} km — ${formatKm(Math.max(0, distanceToDest))} left to destination`,
      at: now,
    });
  }

  const lastIntervalAt = Number(trip.lastIntervalNotifyAt || trip.createdAt || 0);
  if (trip.status === 'active' && (now - lastIntervalAt) >= notifyIntervalMinutes * 60 * 1000) {
    events.push({
      type: 'update',
      message: `On the way — ${formatKm(Math.max(0, distanceToDest))} left to destination`,
      at: now,
    });
  }

  if (distanceToDest <= arriveRadiusKm) {
    events.push({
      type: 'arrived',
      message: 'Arrived near destination',
      at: now,
    });
  }

  const lastProgressAt = Number(trip.lastProgressAt || trip.createdAt || now);
  const stalled = distanceToDest > bestDistance + stallToleranceKm
    && (now - lastProgressAt) >= stallMinutes * 60 * 1000;

  if (stalled && trip.status === 'active') {
    const lastAlertAt = Number(trip.lastStallAlertAt || 0);
    if (now - lastAlertAt > 5 * 60 * 1000) {
      events.push({
        type: 'stall',
        severity: 'high',
        message: `NOT MOVING for ${stallMinutes}+ minutes — still ${formatKm(distanceToDest)} from destination. Please check on them.`,
        at: now,
      });
    }
  }

  const progressPct = plannedKm > 0
    ? Math.min(100, Math.max(0, ((plannedKm - distanceToDest) / plannedKm) * 100))
    : 0;

  const madeProgress = distanceToDest < bestDistance - 0.02;

  return {
    distanceToDest,
    distanceFromStart,
    plannedKm,
    progressPct,
    bestDistanceToDest: bestDistance,
    lastMilestoneKm: crossedKm > lastMilestone ? crossedKm : lastMilestone,
    lastProgressAt: madeProgress ? now : lastProgressAt,
    lastStallAlertAt: events.some((e) => e.type === 'stall') ? now : trip.lastStallAlertAt,
    lastIntervalNotifyAt: events.some((e) => e.type === 'update') ? now : trip.lastIntervalNotifyAt,
    events,
    status: events.some((e) => e.type === 'arrived') ? 'completed' : trip.status,
  };
}
