/**
 * Server-side geocoding for Buddy Safety (Nominatim proxy).
 * Biases results toward Bengaluru / India.
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'CosmixBuddySafety/1.0 (buddy-safety; contact: support@cosmix.app)';

/** Bengaluru metro viewbox: left, top, right, bottom */
const BENGALURU_VIEWBOX = '77.42,13.15,77.82,12.82';

function normalizeQuery(query) {
  return String(query || '').trim().replace(/\s+/g, ' ');
}

function hasBengaluruHint(query) {
  return /\b(bangalore|bengaluru|blr)\b/i.test(query);
}

function mapResult(row) {
  return {
    lat: Number(row.lat),
    lng: Number(row.lon),
    label: row.display_name,
    shortLabel: [
      row.name,
      row.address?.suburb || row.address?.neighbourhood,
      row.address?.city || row.address?.town || row.address?.state,
    ].filter(Boolean).join(', ') || row.display_name,
    type: row.type || row.class || '',
  };
}

async function nominatimFetch(query, { viewbox, countrycodes = 'in' } = {}) {
  const params = new URLSearchParams({
    format: 'json',
    limit: '10',
    q: query,
    addressdetails: '1',
    countrycodes,
  });
  if (viewbox) {
    params.set('viewbox', viewbox);
    params.set('bounded', '0');
  }

  const response = await fetch(`${NOMINATIM_BASE}?${params}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(`Geocoder returned ${response.status}`);
  }

  const data = await response.json().catch(() => []);
  return (Array.isArray(data) ? data : []).map(mapResult).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

function dedupeResults(results) {
  const seen = new Set();
  return results.filter((row) => {
    const key = `${row.lat.toFixed(5)}:${row.lng.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rankForBengaluru(results) {
  return [...results].sort((a, b) => {
    const aBlr = /bengaluru|bangalore|karnataka/i.test(a.label) ? 1 : 0;
    const bBlr = /bengaluru|bangalore|karnataka/i.test(b.label) ? 1 : 0;
    return bBlr - aBlr;
  });
}

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

export async function searchPlaces(query, { city = 'Bengaluru' } = {}) {
  const q = normalizeQuery(query);
  if (q.length < 2) return [];

  const primaryQuery = hasBengaluruHint(q) ? q : `${q}, ${city}, Karnataka, India`;
  let merged = await nominatimFetch(primaryQuery, { viewbox: BENGALURU_VIEWBOX, countrycodes: 'in' });
  merged = dedupeResults(merged);

  if (merged.length < 3 && primaryQuery !== q) {
    await sleep(400);
    const local = await nominatimFetch(q, { viewbox: BENGALURU_VIEWBOX, countrycodes: 'in' });
    merged = dedupeResults([...merged, ...local]);
  }

  if (!merged.length) {
    await sleep(400);
    const global = await nominatimFetch(q, { countrycodes: 'in' });
    merged = dedupeResults(global);
  }

  return rankForBengaluru(merged).slice(0, 8);
}

export async function reverseGeocode(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Invalid coordinates.');
  }

  const params = new URLSearchParams({
    format: 'json',
    lat: String(latitude),
    lon: String(longitude),
    addressdetails: '1',
    zoom: '18',
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(`Reverse geocoder returned ${response.status}`);
  }

  const data = await response.json().catch(() => ({}));
  const address = data.address || {};
  const shortLabel = [
    data.name,
    address.road || address.neighbourhood || address.suburb,
    address.city || address.town || address.state_district,
  ].filter(Boolean).join(', ') || 'Current location';

  return {
    lat: latitude,
    lng: longitude,
    label: data.display_name || shortLabel,
    shortLabel,
    type: data.type || data.class || 'gps',
  };
}
