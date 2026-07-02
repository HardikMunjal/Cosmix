import { getTripByShareToken } from '../../../../server/buddySafetyStore';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const token = String(req.query.token || '').trim();
  if (!token) {
    return res.status(400).json({ error: 'Share token required.' });
  }

  try {
    const trip = await getTripByShareToken(token);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found or link expired.' });
    }
    return res.status(200).json({ trip });
  } catch (error) {
    console.error('buddy-safety public failed:', error);
    return res.status(500).json({ error: 'Could not load trip.' });
  }
}
