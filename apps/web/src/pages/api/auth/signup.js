import { createAuthenticatedSession, logoutAuthenticatedUser, signUpUser } from '../../../server/authStore';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Vary', 'Cookie');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const user = await signUpUser(body);
    await logoutAuthenticatedUser(req, res);
    await createAuthenticatedSession(user.id, res);
    return res.status(200).json({ ok: true, user });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Unable to sign up.' });
  }
}