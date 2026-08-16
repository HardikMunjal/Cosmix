function pickQuery(value) {
  return String(value || '').trim().slice(0, 80);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const q = pickQuery(req.query.q || req.query.place);
  if (q.length < 2) {
    return res.status(200).json({ results: [] });
  }

  try {
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`,
      { headers: { 'User-Agent': 'CosmixTripPlaces/1.0' } },
    );
    if (!response.ok) {
      throw new Error(`Maps lookup failed (${response.status})`);
    }
    const payload = await response.json();
    const results = (payload?.results || []).map((hit) => {
      const parts = [hit.name, hit.admin1, hit.country].filter(Boolean);
      return {
        name: hit.name,
        shortLabel: hit.name,
        label: parts.join(', '),
        lat: hit.latitude,
        lng: hit.longitude,
      };
    });
    return res.status(200).json({ results });
  } catch (error) {
    return res.status(200).json({ results: [], error: error.message || 'Could not search places.' });
  }
}
