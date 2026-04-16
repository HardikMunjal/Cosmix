import { logoutAuthenticatedUser } from '../../../server/authStore';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  await logoutAuthenticatedUser(req, res);
  return res.status(200).json({ ok: true });
}