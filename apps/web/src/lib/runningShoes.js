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
      imageUrl: String(shoe?.imageUrl || shoe?.photoUrl || '').trim(),
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

/** Default shoe for untagged runs (user catalog). */
export function findDefaultUntaggedShoe(shoes = []) {
  return (shoes || []).find((shoe) => {
    if (!shoe?.id || shoe.retired) return false;
    const label = `${shoe.brand || ''} ${shoe.name || ''}`.toLowerCase();
    return /supernova\s*stride/.test(label);
  }) || null;
}

/** Medium-soft palette — clear on dark UI, not neon, not washed out. */
export const SHOE_COLOR_PALETTE = [
  '#e8a06a', // warm apricot
  '#6eb8c9', // soft teal-blue
  '#a894d4', // soft violet
  '#6fbf8a', // soft green
  '#d48a96', // soft rose
  '#7aa3d4', // medium sky
  '#d4b86a', // soft gold
  '#c48ec4', // soft orchid
  '#6fbdb0', // soft sea
  '#d49a7a', // soft clay
];

export function hashShoeId(shoeId) {
  const s = String(shoeId || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

/** Famous running brands — matched from shoe name/brand text. */
const RUNNING_SHOE_BRANDS = [
  { id: 'asics', match: /\basics\b|\bgel[-\s]?nimbus\b|\bgel[-\s]?kayano\b|\bnovablast\b|\bmagic\s?speed\b|\bmetaspeed\b/i },
  { id: 'nike', match: /\bnike\b|\bpegasus\b|\binvincible\b|\bvaporfly\b|\bzoomx\b|\breactx?\b|\bvomero\b|\bstreakfly\b/i },
  { id: 'adidas', match: /\badidas\b|\bultraboost\b|\badizero\b|\btakumi\b|\badios\b/i },
  { id: 'puma', match: /\bpuma\b|\bdeviate\b|\bvelocity\b|\bforeverrun\b|\bnitro\b/i },
  { id: 'hoka', match: /\bhoka\b|\bhoka\s?one\b|\bclifton\b|\bbondi\b|\bmach\s?\d?\b|\brocket\s?x\b|\barafhi\b/i },
  { id: 'brooks', match: /\bbrooks\b|\bghost\b|\bglycerin\b|\bhyperion\b|\badrenaline\b|\blaunch\b/i },
  { id: 'newbalance', match: /\bnew\s?balance\b|\bnb\s?\d{3,4}\b|\bfresh\s?foam\b|\bfuelcell\b|\brebel\b|\b1080\b|\bsc\s?elite\b|\bsupercomp\b/i },
  { id: 'saucony', match: /\bsaucony\b|\bendoorphin\b|\btriumph\b|\bkinvara\b/i },
  { id: 'altra', match: /\baltra\b|\btorin\b|\bescalante\b|\bparadigm\b|\bvanish\b|\blone\s?peak\b/i },
  { id: 'on', match: /\bon\s?running\b|\bcloudmonster\b|\bcloudsurfer\b|\bcloudflow\b|\bcloudboom\b|\bcloudeclipse\b|\bcloudstratus\b/i },
  { id: 'mizuno', match: /\bmizuno\b|\bwave\s?rider\b|\bwave\s?rebellion\b|\bwave\s?inspire\b|\bneo\s?vista\b/i },
  { id: 'salomon', match: /\bsalomon\b|\bspeedcross\b|\baero\s?glide\b|\bphantasm\b/i },
  { id: 'underarmour', match: /\bunder\s?armour\b|\bhovr\b|\bflow\s?velociti\b/i },
  { id: 'reebok', match: /\breebok\b|\bfloatride\b/i },
  { id: 'skechers', match: /\bskechers\b|\bgo\s?run\b/i },
  { id: 'topo', match: /\btopo\s?athletic\b|\btopo\b/i },
  { id: 'inov8', match: /\binov-?8\b|\btrailfly\b/i },
  { id: 'merrell', match: /\bmerrell\b/i },
  { id: 'decathlon', match: /\bdecathlon\b|\bkalenji\b|\bkiprun\b/i },
  { id: 'craft', match: /\bcraft\b/i },
  { id: 'lululemon', match: /\blululemon\b|\bblissfeel\b|\bchargefeel\b/i },
];

function shoePhoto(id) {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=240&h=160&fit=crop`;
}

/** Real product-style running shoe photos by brand (Pexels). */
const BRAND_SHOE_PHOTOS = {
  asics: shoePhoto(6748308),
  nike: shoePhoto(1124466),
  adidas: shoePhoto(1464625),
  puma: shoePhoto(2529148),
  hoka: shoePhoto(1456706),
  brooks: shoePhoto(2385477),
  newbalance: shoePhoto(1032110),
  saucony: shoePhoto(1598505),
  altra: shoePhoto(1858404),
  on: shoePhoto(2300334),
  mizuno: shoePhoto(4066291),
  salomon: shoePhoto(6056102),
  underarmour: shoePhoto(3613388),
  reebok: shoePhoto(2757549),
  skechers: shoePhoto(1670766),
  topo: shoePhoto(1456706),
  inov8: shoePhoto(1858404),
  merrell: shoePhoto(6056102),
  decathlon: shoePhoto(2385477),
  craft: shoePhoto(1598505),
  lululemon: shoePhoto(1464625),
  default: shoePhoto(1456706),
};

export function detectRunningShoeBrand(shoe) {
  const text = `${shoe?.brand || ''} ${shoe?.name || ''} ${shoe?.label || ''}`.trim();
  if (!text) return null;
  for (const brand of RUNNING_SHOE_BRANDS) {
    if (brand.match.test(text)) return brand.id;
  }
  return null;
}

/** Distinct brand colors — Asics ≠ Puma, stable across the app. */
export const SHOE_BRAND_COLORS = {
  asics: '#5b8fd4', // soft blue
  nike: '#e8a06a', // warm apricot
  adidas: '#6fbf8a', // soft green
  puma: '#d48a96', // soft rose / magenta
  hoka: '#d4b86a', // soft gold
  brooks: '#6eb8c9', // teal
  newbalance: '#c48ec4', // orchid
  saucony: '#e07a6a', // coral
  altra: '#a894d4', // violet
  on: '#7aa3d4', // sky
  mizuno: '#6fbdb0', // sea
  salomon: '#d49a7a', // clay
  underarmour: '#94a3b8',
  reebok: '#e07a8a',
  skechers: '#7a9fd4',
  topo: '#7abf8a',
  inov8: '#d4a06a',
  merrell: '#b8956a',
  decathlon: '#5aa8d4',
  craft: '#a894c4',
  lululemon: '#d48a9a',
};

/**
 * Stable shoe color for the whole app.
 * Prefer brand color when name is known (so Asics ≠ Puma), else hash by id.
 * Accepts shoe id string OR shoe object `{ id, name, brand, label }`.
 */
export function getShoeColor(shoeOrId, fallback = '#94a3b8') {
  const shoe = (shoeOrId && typeof shoeOrId === 'object')
    ? shoeOrId
    : { id: shoeOrId };
  const brandId = detectRunningShoeBrand(shoe);
  if (brandId && SHOE_BRAND_COLORS[brandId]) return SHOE_BRAND_COLORS[brandId];
  const id = String(shoe.id || shoe.shoeId || '').trim();
  if (!id) return fallback;
  return SHOE_COLOR_PALETTE[hashShoeId(id) % SHOE_COLOR_PALETTE.length];
}

function svgDataUri(svg) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Fallback tile only when photo fails / offline — still looks like a shoe silhouette. */
function buildDefaultShoeImageSrc(color) {
  const fill = color || '#64748b';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80">
  <rect width="120" height="80" rx="12" fill="#0f172a"/>
  <ellipse cx="58" cy="58" rx="42" ry="8" fill="#000" opacity="0.35"/>
  <path d="M18 48c3-14 16-24 38-24 14 0 24 4 32 10 6 5 12 7 18 7v6c-7 0-12 2-18 7-7 6-16 9-28 9H28c-8 0-13-4-10-15z" fill="${fill}"/>
  <path d="M28 50h48" stroke="#fff" stroke-opacity="0.25" stroke-width="3" stroke-linecap="round"/>
  <path d="M36 34c10-2 24-1 36 4" fill="none" stroke="#fff" stroke-opacity="0.2" stroke-width="2.5" stroke-linecap="round"/>
</svg>`;
  return svgDataUri(svg);
}

/** @deprecated kept for callers expecting a generated tile */
export function buildBrandShoeImageSrc(brandId) {
  return BRAND_SHOE_PHOTOS[brandId] || BRAND_SHOE_PHOTOS.default;
}

/** Default basic running shoe photo when brand is unknown. */
export function getShoePlaceholderSrc(shoeId, color) {
  return BRAND_SHOE_PHOTOS.default || buildDefaultShoeImageSrc(color || getShoeColor(shoeId) || '#64748b');
}

/**
 * Real shoe photo by brand name match → else default shoe photo.
 */
export function getShoeImageSrc(shoe) {
  const brandId = detectRunningShoeBrand(shoe);
  if (brandId && BRAND_SHOE_PHOTOS[brandId]) return BRAND_SHOE_PHOTOS[brandId];
  return BRAND_SHOE_PHOTOS.default;
}

export function findRunningShoe(shoes, shoeId) {
  if (!shoeId) return null;
  return (shoes || []).find((shoe) => shoe.id === shoeId) || null;
}

export function buildRunningRows(entries = [], shoes = []) {
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
          shoeId: String(run.shoeId || entry.runningShoeId || '').trim() || '',
          stravaId: Number(run.id || run.stravaId || 0) || null,
          name: run.name || 'Run',
          avgHeartrate: Number(run.avgHeartrate || 0) || null,
          maxHeartrate: Number(run.maxHeartrate || 0) || null,
          avgSpeedKmh: Number(run.avgSpeedKmh || 0) || null,
          maxSpeedKmh: Number(run.maxSpeedKmh || 0) || null,
          bestSplitPaceMinPerKm: Number(run.bestSplitPaceMinPerKm || 0) || null,
          bestSplitKm: Number(run.bestSplitKm || 0) || null,
          bestSplitSeconds: Number(run.bestSplitSeconds || 0) || null,
          bestSplitAvgHeartrate: Number(run.bestSplitAvgHeartrate || 0) || null,
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
        shoeId: String(entry.runningShoeId || '').trim() || '',
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
      imageUrl: getShoeImageSrc(shoe),
      runs: 0,
      totalKm: 0,
      totalMinutes: 0,
      longestRunKm: 0,
      fastestSpeed: 0,
      paces: [],
    });
  });

  buildRunningRows(entries, shoes)
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
          imageUrl: shoe ? getShoeImageSrc(shoe) : getShoePlaceholderSrc('', '#64748b'),
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

/** Assumed avg HR when a run has no heart-rate data — used only for leaderboard scoring. */
export const MISSING_HR_FALLBACK = 174;

function mapRunRow(row, shoeMap) {
  const shoeId = String(row.shoeId || '').trim();
  const shoe = shoeId ? shoeMap.get(shoeId) : null;
  const minutes = Number(row.minutes || 0) || null;
  const avgSpeed = Number(row.avgSpeedKmh || 0)
    || (minutes > 0 ? row.distance / (minutes / 60) : 0);
  const recordedHr = Number(row.avgHeartrate || 0) || null;
  const hrEstimated = !(recordedHr > 0);
  const hr = recordedHr > 0 ? recordedHr : MISSING_HR_FALLBACK;
  const speed = Number(Number(avgSpeed).toFixed(2));
  const distance = Number(row.distance);
  // Quality: speed/HR dominate. Distance only adds a tiny, saturating bonus
  // so long easy runs don't always beat shorter efficient efforts on 5 km+ boards.
  // Missing HR uses 174 so older runs still rank.
  let quality = null;
  if (hr > 0 && speed > 0 && distance > 0) {
    const efficiency = speed / hr;
    const distanceFactor = 1 + (0.1 * Math.log10(Math.max(distance, 5) / 5));
    quality = Number((efficiency * distanceFactor * 100).toFixed(2));
  }
  return {
    id: row.stravaId || `${row.date}-${row.distance}-${shoeId}`,
    date: row.date,
    distance,
    minutes,
    speed,
    avgHeartrate: hr,
    hrEstimated,
    quality,
    shoeId,
    shoeLabel: shoe ? getRunningShoeLabel(shoe) : (shoeId ? 'Unknown shoe' : 'Untagged'),
    shoeColor: getShoeColor(
      shoe || { id: shoeId, name: shoeId ? 'Unknown shoe' : '' },
      '#64748b',
    ),
    shoeImageUrl: shoe ? getShoeImageSrc(shoe) : getShoePlaceholderSrc('', '#64748b'),
  };
}

/**
 * Quality = (speed / HR) × (1 + 0.1·log10(km/5)) × 100
 * Speed and HR drive the rank; distance is a small soft bonus only.
 */
export function computeRunLeaderboards(entries = [], shoes = [], limit = 5) {
  const shoeMap = new Map((shoes || []).map((shoe) => [shoe.id, shoe]));
  const rows = buildRunningRows(entries, shoes)
    .filter((row) => row.distance > 0 && row.minutes > 0)
    .map((row) => mapRunRow(row, shoeMap));

  const rank = (items, key, desc = true) => [...items]
    .filter((item) => item[key] != null && Number(item[key]) > 0)
    .sort((a, b) => (desc ? Number(b[key]) - Number(a[key]) : Number(a[key]) - Number(b[key])))
    .slice(0, limit);

  const minDist = (km) => rows.filter((row) => row.distance >= km);
  const withQuality = (items) => items.filter((row) => Number(row.quality) > 0);

  return {
    topDistance: rank(rows, 'distance', true),
    bestQuality5: rank(withQuality(minDist(5)), 'quality', true),
    bestQuality10: rank(withQuality(minDist(10)), 'quality', true),
    bestSpeed5: rank(minDist(5), 'speed', true),
    bestSpeed10: rank(minDist(10), 'speed', true),
    // legacy aliases (deprecated)
    bestHr5: rank(withQuality(minDist(5)), 'quality', true),
    bestHr10: rank(withQuality(minDist(10)), 'quality', true),
  };
}

export function computeFastestKmSplits(entries = [], shoes = [], limit = 10, extraRuns = []) {
  const shoeMap = new Map((shoes || []).map((shoe) => [shoe.id, shoe]));
  const byKey = new Map();

  function ingest(row) {
    const pace = Number(
      row.bestSplitPaceMinPerKm
      || row.splitPace
      || row.best_split_pace_min_per_km
      || 0,
    );
    if (!(pace > 1.5 && pace < 20)) return;
    const mapped = mapRunRow({
      ...row,
      distance: Number(row.distance || row.distanceKm || 0),
      minutes: Number(row.minutes || 0),
      stravaId: Number(row.stravaId || row.id || 0) || null,
    }, shoeMap);
    const splitHr = Number(row.bestSplitAvgHeartrate || row.splitHr || 0) || null;
    const runHr = Number(row.avgHeartrate || 0) || null;
    const stravaId = Number(row.stravaId || row.id || mapped.stravaId || 0) || null;
    const key = stravaId ? `id:${stravaId}` : `d:${row.date || mapped.date}:${pace.toFixed(3)}`;
    const next = {
      ...mapped,
      id: stravaId || mapped.id || key,
      stravaId: stravaId || mapped.stravaId,
      splitPace: pace,
      splitKm: Number(row.bestSplitKm || row.splitKm || 0) || null,
      splitSeconds: Number(row.bestSplitSeconds || row.splitSeconds || 0) || null,
      splitHr: splitHr || runHr,
      splitHrEstimated: !splitHr && !runHr,
      splitSpeedKmh: Number((60 / pace).toFixed(2)),
    };
    const prev = byKey.get(key);
    if (!prev || next.splitPace < prev.splitPace) byKey.set(key, next);
  }

  buildRunningRows(entries, shoes).forEach(ingest);
  (extraRuns || []).forEach(ingest);

  return [...byKey.values()]
    .sort((a, b) => a.splitPace - b.splitPace)
    .slice(0, limit);
}

/** @deprecated use computeRunLeaderboards */
export function computeShoeLeaderboards(entries = [], shoes = []) {
  const boards = computeRunLeaderboards(entries, shoes, 8);
  return {
    topKm: boards.topDistance.map((r) => ({
      ...r,
      label: `${r.distance.toFixed(1)} km · ${r.shoeLabel}`,
      value: r.distance,
      sub: r.avgHeartrate ? `${r.avgHeartrate} bpm` : (r.date || ''),
    })),
    topSpeed: [],
    topSplit: [],
    avgHr5: (boards.bestQuality5 || boards.bestHr5 || []).map((r) => ({
      ...r,
      label: `${r.distance.toFixed(1)} km · ${r.shoeLabel}`,
      value: r.quality || r.avgHeartrate,
      sub: r.date,
    })),
    avgHr10: (boards.bestQuality10 || boards.bestHr10 || []).map((r) => ({
      ...r,
      label: `${r.distance.toFixed(1)} km · ${r.shoeLabel}`,
      value: r.quality || r.avgHeartrate,
      sub: r.date,
    })),
    avgHr20: [],
    avgSpeed5: boards.bestSpeed5.map((r) => ({
      ...r,
      label: `${r.distance.toFixed(1)} km · ${r.shoeLabel}`,
      value: r.speed,
      sub: r.date,
    })),
    avgSpeed10: boards.bestSpeed10.map((r) => ({
      ...r,
      label: `${r.distance.toFixed(1)} km · ${r.shoeLabel}`,
      value: r.speed,
      sub: r.date,
    })),
    avgSpeed20: [],
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
