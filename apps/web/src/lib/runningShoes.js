const WELLNESS_PREFIX = 'cosmix-wellness-';

export function runningShoesStorageKey(userId) {
  return `${WELLNESS_PREFIX}${userId}-runningShoes`;
}

export function resolveWellnessApiBase() {
  const configured = process.env.NEXT_PUBLIC_WELLNESS_API_BASE || '';
  if (configured) return configured;
  if (typeof window === 'undefined') return '';
  const { hostname, protocol } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:3004`;
  }
  return '';
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
  return [...entries]
    .filter((entry) => Number(entry.runningMinutes || 0) > 0 || Number(entry.runningDistanceKm || 0) > 0)
    .map((entry) => ({
      date: entry.date,
      minutes: Number(entry.runningMinutes || 0),
      distance: Number(entry.runningDistanceKm || 0),
      shoeId: String(entry.runningShoeId || '').trim(),
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function computeShoeStats(entries = [], shoes = []) {
  const shoeMap = new Map((shoes || []).map((shoe) => [shoe.id, shoe]));
  const buckets = new Map();

  buildRunningRows(entries)
    .filter((row) => row.distance > 0 && row.minutes > 0)
    .forEach((row) => {
      const key = row.shoeId || '__unassigned__';
      if (!buckets.has(key)) {
        const shoe = shoeMap.get(row.shoeId) || null;
        buckets.set(key, {
          shoeId: row.shoeId || '',
          label: shoe ? getRunningShoeLabel(shoe) : 'No shoe selected',
          brand: shoe?.brand || '',
          name: shoe?.name || (row.shoeId ? 'Unknown shoe' : 'Unassigned'),
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
      const speed = row.distance / (row.minutes / 60);
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
      avgDistance: Number((bucket.totalKm / bucket.runs).toFixed(2)),
      avgPace: bucket.paces.length
        ? Number((bucket.paces.reduce((sum, pace) => sum + pace, 0) / bucket.paces.length).toFixed(2))
        : null,
      avgSpeed: bucket.totalMinutes > 0
        ? Number(((bucket.totalKm / bucket.totalMinutes) * 60).toFixed(2))
        : 0,
      fastestSpeed: Number(bucket.fastestSpeed.toFixed(2)),
      longestRunKm: Number(bucket.longestRunKm.toFixed(1)),
    }))
    .sort((a, b) => b.totalKm - a.totalKm);
}

let syncTimer = null;

export function syncRunningShoesToServer(userId, shoes, options = {}) {
  const { entries = null, form = null } = options;
  if (!userId) return Promise.resolve(null);
  const apiBase = resolveWellnessApiBase();
  if (!apiBase) return Promise.resolve(null);

  if (syncTimer) clearTimeout(syncTimer);

  return new Promise((resolve) => {
    syncTimer = setTimeout(() => {
      const payload = { runningShoes: normalizeRunningShoes(shoes) };
      if (Array.isArray(entries)) payload.entries = entries;
      if (form) payload.form = form;

      fetch(`${apiBase}/wellness/data/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then(resolve)
        .catch(() => resolve(null));
    }, 800);
  });
}

export async function loadRunningShoesFromServer(userId) {
  if (!userId) return [];
  const apiBase = resolveWellnessApiBase();
  if (!apiBase) return readRunningShoes(userId);

  try {
    const response = await fetch(`${apiBase}/wellness/data/${encodeURIComponent(userId)}`);
    if (!response.ok) return readRunningShoes(userId);
    const data = await response.json();
    const shoes = normalizeRunningShoes(data?.runningShoes || []);
    if (shoes.length) saveRunningShoesLocal(userId, shoes);
    return shoes.length ? shoes : readRunningShoes(userId);
  } catch (_) {
    return readRunningShoes(userId);
  }
}
