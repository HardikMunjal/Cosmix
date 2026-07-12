/**
 * Server-side geocoding for Buddy Safety.
 * Primary: Photon (Komoot/OSM) — better POI & landmark search in India.
 * Fallback: Nominatim — reverse geocode + sparse-result backup.
 */

const PHOTON_BASE = 'https://photon.komoot.io/api/';
const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'CosmixBuddySafety/1.0 (buddy-safety; contact: support@cosmix.app)';

/** Bengaluru metro viewbox: left, top, right, bottom */
const BENGALURU_VIEWBOX = '77.42,13.15,77.82,12.82';

function normalizeQuery(query) {
  return String(query || '').trim().replace(/\s+/g, ' ');
}

function hasBengaluruHint(query) {
  return /\b(bangalore|bengaluru|blr|kadubisanahalli|marathahalli|whitefield|electronic\s*city)\b/i.test(query);
}

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
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

function rankForProximity(results, { lat, lng, city = '' } = {}) {
  const cityHint = city.toLowerCase();
  return [...results].sort((a, b) => {
    const aBlr = /bengaluru|bangalore|karnataka|kadubisanahalli|marathahalli|whitefield/i.test(a.label) ? 2 : 0;
    const bBlr = /bengaluru|bangalore|karnataka|kadubisanahalli|marathahalli|whitefield/i.test(b.label) ? 2 : 0;
    if (aBlr !== bBlr) return bBlr - aBlr;

    if (cityHint) {
      const aCity = a.label.toLowerCase().includes(cityHint) ? 1 : 0;
      const bCity = b.label.toLowerCase().includes(cityHint) ? 1 : 0;
      if (aCity !== bCity) return bCity - aCity;
    }

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const da = haversineKmApprox(lat, lng, a.lat, a.lng);
      const db = haversineKmApprox(lat, lng, b.lat, b.lng);
      return da - db;
    }
    return 0;
  });
}

function haversineKmApprox(lat1, lng1, lat2, lng2) {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildPhotonLabel(props) {
  const parts = [
    props.name,
    props.street,
    props.district || props.suburb || props.neighbourhood,
    props.city || props.county,
    props.state,
  ].filter(Boolean);
  return parts.join(', ') || props.name || 'Unknown place';
}

function mapPhotonFeature(feature) {
  const props = feature.properties || {};
  const [lng, lat] = feature.geometry?.coordinates || [];
  const label = buildPhotonLabel(props);
  return {
    lat: Number(lat),
    lng: Number(lng),
    label,
    shortLabel: props.name || label.split(',')[0] || label,
    type: props.type || props.osm_value || 'place',
    source: 'photon',
  };
}

function mapNominatimResult(row) {
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
    source: 'nominatim',
  };
}

async function photonSearch(query, { lat, lng, limit = 10 } = {}) {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    lang: 'en',
  });
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    params.set('lat', String(lat));
    params.set('lon', String(lng));
  }

  const response = await fetch(`${PHOTON_BASE}?${params}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Photon returned ${response.status}`);

  const data = await response.json().catch(() => ({}));
  const features = Array.isArray(data.features) ? data.features : [];
  return features
    .map(mapPhotonFeature)
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
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

  const response = await fetch(`${NOMINATIM_SEARCH}?${params}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);

  const data = await response.json().catch(() => []);
  return (Array.isArray(data) ? data : []).map(mapNominatimResult).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

function buildSearchQueries(q, { city = 'Bengaluru' } = {}) {
  const queries = [q];
  if (!hasBengaluruHint(q)) {
    queries.push(`${q}, ${city}`);
    queries.push(`${q}, ${city}, Karnataka`);
  }
  return [...new Set(queries)];
}

export async function searchPlaces(query, { city = 'Bengaluru', lat, lng } = {}) {
  const q = normalizeQuery(query);
  if (q.length < 2) return [];

  const proximity = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
    ? { lat: Number(lat), lng: Number(lng) }
    : null;

  let merged = [];

  try {
    for (const variant of buildSearchQueries(q, { city })) {
      const batch = await photonSearch(variant, { ...proximity, limit: 12 });
      merged = dedupeResults([...merged, ...batch]);
      if (merged.length >= 6) break;
      await sleep(120);
    }
  } catch (error) {
    console.warn('Photon search failed, falling back to Nominatim:', error.message);
  }

  if (merged.length < 4) {
    const primaryQuery = hasBengaluruHint(q) ? q : `${q}, ${city}, Karnataka, India`;
    try {
      const nominatim = await nominatimFetch(primaryQuery, { viewbox: BENGALURU_VIEWBOX, countrycodes: 'in' });
      merged = dedupeResults([...merged, ...nominatim]);
    } catch (error) {
      console.warn('Nominatim search failed:', error.message);
    }
  }

  if (!merged.length && proximity) {
    try {
      const global = await photonSearch(`${q}, India`, { ...proximity, limit: 8 });
      merged = dedupeResults(global);
    } catch (_) { /* ignore */ }
  }

  return rankForProximity(merged, { ...proximity, city }).slice(0, 10);
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

  const response = await fetch(`${NOMINATIM_REVERSE}?${params}`, {
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
  const city = address.city || address.town || address.state_district || address.county || '';
  const shortLabel = [
    data.name,
    address.road || address.neighbourhood || address.suburb,
    city,
  ].filter(Boolean).join(', ') || 'Current location';

  return {
    lat: latitude,
    lng: longitude,
    label: data.display_name || shortLabel,
    shortLabel,
    city: String(city || '').trim(),
    type: data.type || data.class || 'gps',
  };
}
