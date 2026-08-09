const WELLNESS_PREFIX = 'cosmix-wellness-';

export function runningShoesStorageKey(userId) {
  return `${WELLNESS_PREFIX}${userId}-runningShoes`;
}

/**
 * Base URL for wellness API calls.
 * - Local: http://localhost:3004
 * - Production: '' (same-origin /wellness/... via nginx → wellness-service)
 */
export function resolveWellnessApiBase() {
  const configured = String(process.env.NEXT_PUBLIC_WELLNESS_API_BASE || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  if (typeof window === 'undefined') return '';
  const { hostname, protocol } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:3004`;
  }
  return '';
}

export function isWellnessApiReady() {
  return typeof window !== 'undefined';
}

export function wellnessApiUrl(path = '') {
  const base = resolveWellnessApiBase();
  const normalized = String(path || '').startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

function parseStoredJson(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

export function createRunningShoeId() {
  return `shoe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function normalizeRunningShoes(shoes = []) {
  if (!Array.isArray(shoes)) return [];
  return shoes
    .map((shoe) => ({
      id: String(shoe?.id || '').trim(),
      name: String(shoe?.name || '').trim(),
      brand: String(shoe?.brand || '').trim(),
      notes: String(shoe?.notes || '').trim(),
      createdAt: shoe?.createdAt || new Date().toISOString(),
      retired: Boolean(shoe?.retired),
    }))
    .filter((shoe) => shoe.id && shoe.name);
}

/** Prefer later lists for the same id. Keeps the union of both catalogs. */
export function mergeRunningShoes(...lists) {
  const map = new Map();
  lists.flat().forEach((shoe) => {
    const id = String(shoe?.id || '').trim();
    if (!id) return;
    map.set(id, {
      ...(map.get(id) || {}),
      ...shoe,
      id,
    });
  });
  return normalizeRunningShoes([...map.values()]);
}

export function readRunningShoes(userId) {
  if (!userId) return [];
  return normalizeRunningShoes(parseStoredJson(runningShoesStorageKey(userId), []));
}

export function saveRunningShoesLocal(userId, shoes) {
  if (!userId || typeof window === 'undefined') return [];
  const normalized = normalizeRunningShoes(shoes);
  localStorage.setItem(runningShoesStorageKey(userId), JSON.stringify(normalized));
  return normalized;
}

export function getRunningShoeLabel(shoe) {
  if (!shoe) return '';
  const brand = String(shoe.brand || '').trim();
  const name = String(shoe.name || '').trim();
  return brand ? `${brand} ${name}` : name;
}

export function findRunningShoe(shoes, shoeId) {
  if (!shoeId) return null;
  return (shoes || []).find((shoe) => shoe.id === shoeId) || null;
}

export function buildRunningRows(entries = []) {
  const rows = [];

  [...entries].forEach((entry) => {
    const stravaRuns = Array.isArray(entry?.stravaRuns) ? entry.stravaRuns : [];
    if (stravaRuns.length) {
      stravaRuns.forEach((run) => {
        const minutes = Number(run.minutes || 0);
        const distance = Number(run.distanceKm || 0);
        if (minutes <= 0 && distance <= 0) return;
        rows.push({
          date: run.date || entry.date,
          minutes,
          distance,
          shoeId: String(run.shoeId || entry.runningShoeId || '').trim(),
          stravaId: Number(run.id || run.stravaId || 0) || null,
          name: run.name || 'Run',
          avgHeartrate: Number(run.avgHeartrate || 0) || null,
          maxHeartrate: Number(run.maxHeartrate || 0) || null,
          avgSpeedKmh: Number(run.avgSpeedKmh || 0) || null,
          maxSpeedKmh: Number(run.maxSpeedKmh || 0) || null,
          bestSplitPaceMinPerKm: Number(run.bestSplitPaceMinPerKm || 0) || null,
          source: 'strava',
        });
      });
      return;
    }

    if (Number(entry.runningMinutes || 0) > 0 || Number(entry.runningDistanceKm || 0) > 0) {
      rows.push({
        date: entry.date,
        minutes: Number(entry.runningMinutes || 0),
        distance: Number(entry.runningDistanceKm || 0),
        shoeId: String(entry.runningShoeId || '').trim(),
        stravaId: null,
        name: 'Run',
        avgHeartrate: Number(entry.stravaAvgHeartRate || entry.heartRateAvg || 0) || null,
        maxHeartrate: Number(entry.stravaMaxHeartRate || entry.heartRateMax || 0) || null,
        avgSpeedKmh: null,
        source: entry.source || 'manual',
      });
    }
  });

  return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function computeShoeStats(entries = [], shoes = []) {
  const shoeMap = new Map((shoes || []).map((shoe) => [shoe.id, shoe]));
  const buckets = new Map();

  // Always show every shoe in the catalog, even before any run is tagged.
  (shoes || []).filter((shoe) => shoe?.id && !shoe.retired).forEach((shoe) => {
    buckets.set(shoe.id, {
      shoeId: shoe.id,
      label: getRunningShoeLabel(shoe),
      brand: shoe.brand || '',
      name: shoe.name || 'Shoe',
      runs: 0,
      totalKm: 0,
      totalMinutes: 0,
      longestRunKm: 0,
      fastestSpeed: 0,
      paces: [],
    });
  });

  buildRunningRows(entries)
    .filter((row) => row.distance > 0 && row.minutes > 0)
    .forEach((row) => {
      const key = row.shoeId || '__unassigned__';
      if (!buckets.has(key)) {
        const shoe = shoeMap.get(row.shoeId) || null;
        buckets.set(key, {
          shoeId: row.shoeId || '',
          label: shoe ? getRunningShoeLabel(shoe) : 'Untagged runs',
          brand: shoe?.brand || '',
          name: shoe?.name || (row.shoeId ? 'Unknown shoe' : 'Untagged'),
          runs: 0,
          totalKm: 0,
          totalMinutes: 0,
          longestRunKm: 0,
          fastestSpeed: 0,
          paces: [],
        });
      }
      const bucket = buckets.get(key);
      const pace = row.minutes / row.distance;
      const speed = row.avgSpeedKmh || (row.distance / (row.minutes / 60));
      bucket.runs += 1;
      bucket.totalKm += row.distance;
      bucket.totalMinutes += row.minutes;
      bucket.longestRunKm = Math.max(bucket.longestRunKm, row.distance);
      bucket.fastestSpeed = Math.max(bucket.fastestSpeed, speed);
      bucket.paces.push(pace);
    });

  return Array.from(buckets.values())
    .map((bucket) => ({
      ...bucket,
      totalKm: Number(bucket.totalKm.toFixed(1)),
      avgDistance: bucket.runs ? Number((bucket.totalKm / bucket.runs).toFixed(2)) : 0,
      avgPace: bucket.paces.length
        ? Number((bucket.paces.reduce((sum, pace) => sum + pace, 0) / bucket.paces.length).toFixed(2))
        : null,
      avgSpeed: bucket.totalMinutes > 0
        ? Number(((bucket.totalKm / bucket.totalMinutes) * 60).toFixed(2))
        : 0,
      fastestSpeed: Number(bucket.fastestSpeed.toFixed(2)),
      longestRunKm: Number(bucket.longestRunKm.toFixed(1)),
    }))
    .sort((a, b) => {
      if (a.shoeId && !b.shoeId) return -1;
      if (!a.shoeId && b.shoeId) return 1;
      return b.totalKm - a.totalKm;
    });
}

function raceBand(distanceKm) {
  const d = Number(distanceKm || 0);
  if (d >= 4.5 && d < 7.5) return '5km';
  if (d >= 8.5 && d < 12.5) return '10km';
  if (d >= 18 && d < 23) return '20km';
  return null;
}

/** Top individual runs for shoe charts (same shoe can appear many times). Untagged excluded. */
export function computeShoeLeaderboards(entries = [], shoes = []) {
  const shoeMap = new Map((shoes || []).map((shoe) => [shoe.id, shoe]));
  const rows = buildRunningRows(entries)
    .filter((row) => row.shoeId && shoeMap.has(row.shoeId) && Number(row.distance || 0) > 0)
    .map((row) => {
      const shoe = shoeMap.get(row.shoeId);
      const label = getRunningShoeLabel(shoe);
      const speed = Number(row.maxSpeedKmh || row.avgSpeedKmh || 0)
        || (row.minutes > 0 ? (row.distance / (row.minutes / 60)) : 0);
      const avgSpeed = Number(row.avgSpeedKmh || 0) || (row.minutes > 0 ? (row.distance / (row.minutes / 60)) : 0);
      return {
        id: row.stravaId || `${row.date}-${row.distance}-${row.shoeId}`,
        date: row.date,
        shoeId: row.shoeId,
        shoeLabel: label,
        label: `${Number(row.distance).toFixed(1)} km · ${label}`,
        distance: Number(row.distance),
        speed: Number(speed.toFixed(2)),
        avgSpeed: Number(avgSpeed.toFixed(2)),
        avgHeartrate: row.avgHeartrate || null,
        bestSplitPace: row.bestSplitPaceMinPerKm || null,
        band: raceBand(row.distance),
      };
    });

  const rank = (items, key, desc = true, limit = 8) => [...items]
    .filter((item) => item[key] != null && Number(item[key]) > 0)
    .sort((a, b) => (desc ? Number(b[key]) - Number(a[key]) : Number(a[key]) - Number(b[key])))
    .slice(0, limit);

  const bandRows = (band) => rows.filter((row) => row.band === band);

  return {
    topSpeed: rank(rows, 'speed', true).map((r) => ({
      ...r,
      label: `${r.speed} km/h · ${r.shoeLabel}`,
      value: r.speed,
      sub: `${r.distance.toFixed(1)} km`,
    })),
    topKm: rank(rows, 'distance', true).map((r) => ({
      ...r,
      label: `${r.distance.toFixed(1)} km · ${r.shoeLabel}`,
      value: r.distance,
      sub: r.avgHeartrate ? `${r.avgHeartrate} bpm` : (r.date || ''),
    })),
    topSplit: rank(rows, 'bestSplitPace', false).map((r) => ({
      ...r,
      label: `${r.shoeLabel}`,
      value: r.bestSplitPace,
      sub: `${r.distance.toFixed(1)} km`,
    })),
    avgHr5: rank(bandRows('5km'), 'avgHeartrate', true).map((r) => ({
      ...r,
      label: `${r.distance.toFixed(1)} km · ${r.shoeLabel}`,
      value: r.avgHeartrate,
      sub: r.date,
    })),
    avgHr10: rank(bandRows('10km'), 'avgHeartrate', true).map((r) => ({
      ...r,
      label: `${r.distance.toFixed(1)} km · ${r.shoeLabel}`,
      value: r.avgHeartrate,
      sub: r.date,
    })),
    avgHr20: rank(bandRows('20km'), 'avgHeartrate', true).map((r) => ({
      ...r,
      label: `${r.distance.toFixed(1)} km · ${r.shoeLabel}`,
      value: r.avgHeartrate,
      sub: r.date,
    })),
    avgSpeed5: rank(bandRows('5km'), 'avgSpeed', true).map((r) => ({
      ...r,
      label: `${r.distance.toFixed(1)} km · ${r.shoeLabel}`,
      value: r.avgSpeed,
      sub: r.date,
    })),
    avgSpeed10: rank(bandRows('10km'), 'avgSpeed', true).map((r) => ({
      ...r,
      label: `${r.distance.toFixed(1)} km · ${r.shoeLabel}`,
      value: r.avgSpeed,
      sub: r.date,
    })),
    avgSpeed20: rank(bandRows('20km'), 'avgSpeed', true).map((r) => ({
      ...r,
      label: `${r.distance.toFixed(1)} km · ${r.shoeLabel}`,
      value: r.avgSpeed,
      sub: r.date,
    })),
  };
}

function avg(values = []) {
  if (!values.length) return null;
  return Number((values.reduce((sum, v) => sum + Number(v), 0) / values.length).toFixed(1));
}

let syncTimer = null;

export function syncRunningShoesToServer(userId, shoes, options = {}) {
  const { entries = null, form = null, immediate = false } = options;
  if (!userId || !isWellnessApiReady()) return Promise.resolve(null);

  if (syncTimer) clearTimeout(syncTimer);

  const runSync = () => {
    const payload = { runningShoes: normalizeRunningShoes(shoes) };
    if (Array.isArray(entries)) payload.entries = entries;
    if (form) payload.form = form;

    return fetch(wellnessApiUrl(`/wellness/data/${encodeURIComponent(userId)}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
  };

  if (immediate) return runSync();

  return new Promise((resolve) => {
    syncTimer = setTimeout(() => {
      runSync().then(resolve);
    }, 250);
  });
}

export async function loadRunningShoesFromServer(userId) {
  if (!userId) return [];
  const localShoes = readRunningShoes(userId);
  if (!isWellnessApiReady()) return localShoes;

  try {
    const response = await fetch(wellnessApiUrl(`/wellness/data/${encodeURIComponent(userId)}`));
    if (!response.ok) return localShoes;
    const data = await response.json();
    const serverShoes = normalizeRunningShoes(data?.runningShoes || []);
    const merged = mergeRunningShoes(serverShoes, localShoes);
    saveRunningShoesLocal(userId, merged);
    // If browser has shoes the server lost/never got, push the merge up.
    if (merged.length > serverShoes.length) {
      void syncRunningShoesToServer(userId, merged, { immediate: true });
    }
    return merged;
  } catch (_) {
    return localShoes;
  }
}
