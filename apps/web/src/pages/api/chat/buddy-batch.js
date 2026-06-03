import { getAuthenticatedUser, resolveUsersByUsernames } from '../../../server/authStore';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) {
    return res.status(401).json({ error: 'Session expired.' });
  }

  try {
    const usernames = Array.isArray(req.body?.usernames) ? req.body.usernames : [];
    const results = await resolveUsersByUsernames(usernames, user.id);
    return res.status(200).json({ results });
  } catch (error) {
    console.error('buddy-batch failed:', error);
    return res.status(200).json({ results: [] });
  }
}
