function pickPlaceName(query) {
  return String(query || '').trim().slice(0, 80);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'CosmixTripBriefing/1.0' },
  });
  if (!response.ok) throw new Error(`Lookup failed (${response.status})`);
  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const place = pickPlaceName(req.query.place);
  const startDate = String(req.query.start || '').slice(0, 10);
  if (!place) {
    return res.status(400).json({ error: 'Place is required.' });
  }

  try {
    const geo = await fetchJson(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`,
    );
    const hit = geo?.results?.[0];
    let weather = null;
    let forecastDays = [];
    if (hit?.latitude != null && hit?.longitude != null) {
      const forecast = await fetchJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,uv_index_max&timezone=auto&forecast_days=7`,
      );
      const days = forecast?.daily?.time || [];
      weather = {
        label: [hit.name, hit.admin1, hit.country].filter(Boolean).join(', '),
        temperature: forecast?.current?.temperature_2m,
        wind: forecast?.current?.wind_speed_10m,
        humidity: forecast?.current?.relative_humidity_2m,
        code: forecast?.current?.weather_code,
        unit: forecast?.current_units?.temperature_2m || '°C',
        high: forecast?.daily?.temperature_2m_max?.[0],
        low: forecast?.daily?.temperature_2m_min?.[0],
        rainChance: forecast?.daily?.precipitation_probability_max?.[0],
        uv: forecast?.daily?.uv_index_max?.[0],
      };
      forecastDays = days.map((date, index) => ({
        date,
        label: new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' }),
        high: forecast?.daily?.temperature_2m_max?.[index],
        low: forecast?.daily?.temperature_2m_min?.[index],
        rainChance: forecast?.daily?.precipitation_probability_max?.[index],
        code: forecast?.daily?.weather_code?.[index],
      }));
    }

    let news = [];
    try {
      const wikiTitle = encodeURIComponent(place.replace(/\s+/g, '_'));
      const wiki = await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`);
      if (wiki?.extract) {
        news = [{
          title: wiki.title || place,
          summary: String(wiki.extract).slice(0, 280),
          url: wiki.content_urls?.desktop?.page || wiki.content_urls?.mobile?.page || '',
        }];
      }
    } catch (_) {
      news = [];
    }

    return res.status(200).json({
      place,
      startDate: startDate || null,
      weather,
      forecast: forecastDays || [],
      news,
    });
  } catch (error) {
    return res.status(200).json({
      place,
      startDate: startDate || null,
      weather: null,
      news: [],
      error: error.message || 'Could not load briefing.',
    });
  }
}
