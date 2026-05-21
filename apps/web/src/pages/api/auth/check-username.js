import { checkUsernameAvailability } from '../../../server/authStore';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const username = String(req.query.username || '').trim();
    const result = await checkUsernameAvailability({ username });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Unable to validate username.' });
  }
}
