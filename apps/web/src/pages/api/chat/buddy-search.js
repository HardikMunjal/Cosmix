import { getAuthenticatedUser, searchUsers } from '../../../server/authStore';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) {
    return res.status(401).json({ error: 'Session expired.' });
  }

  try {
    const query = String(req.query.q || '').trim();
    if (!query) {
      return res.status(200).json({ results: [] });
    }

    const results = await searchUsers(query, user.id);
    return res.status(200).json({ results });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Unable to search users.' });
  }
}