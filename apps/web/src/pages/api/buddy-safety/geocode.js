import { reverseGeocode, searchPlaces } from '../../../server/buddySafetyGeocode';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const lat = req.query.lat;
  const lng = req.query.lng;
  if (lat != null && lng != null) {
    try {
      const place = await reverseGeocode(lat, lng);
      return res.status(200).json({ place });
    } catch (error) {
      console.error('buddy-safety reverse geocode failed:', error);
      return res.status(502).json({ error: 'Could not resolve address for this location.' });
    }
  }

  const q = String(req.query.q || '').trim();
  if (q.length < 2) {
    return res.status(200).json({ results: [] });
  }

  try {
    const results = await searchPlaces(q);
    return res.status(200).json({ results });
  } catch (error) {
    console.error('buddy-safety geocode failed:', error);
    return res.status(502).json({ error: 'Location search temporarily unavailable. Try again in a moment.' });
  }
}
