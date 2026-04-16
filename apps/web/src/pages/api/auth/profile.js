import { getAuthenticatedUser, updateAuthenticatedProfile } from '../../../server/authStore';

export default async function handler(req, res) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) {
    return res.status(401).json({ error: 'Session expired.' });
  }

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, user });
  }

  if (req.method === 'PUT') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const nextUser = await updateAuthenticatedProfile(user.id, body);
      return res.status(200).json({ ok: true, user: nextUser });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Unable to update profile.' });
    }
  }

  res.setHeader('Allow', 'GET,PUT');
  return res.status(405).json({ error: 'Method not allowed.' });
}