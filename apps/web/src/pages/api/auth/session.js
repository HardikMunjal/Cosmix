import { getAuthenticatedUser } from '../../../server/authStore';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) {
    return res.status(401).json({ error: 'Session expired.' });
  }

  return res.status(200).json({ ok: true, user });
}