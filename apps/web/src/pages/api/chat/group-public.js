function resolveChatUrl(req, token) {
  const host = String(req.headers.host || 'localhost:3005');
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || (host.includes('localhost') ? 'http' : 'https');
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  if (isLocal) {
    return `http://localhost:3002/chat/groups/public/${encodeURIComponent(token)}`;
  }
  return `${protocol}://${host}/chat-api/chat/groups/public/${encodeURIComponent(token)}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const token = String(req.query.token || '').trim();
    if (!token) {
      return res.status(400).json({ error: 'Group token is required.' });
    }
    const url = resolveChatUrl(req, token);
    const response = await fetch(url);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({ error: payload.error || payload.message || 'Unable to fetch group.' });
    }
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Unable to fetch group.' });
  }
}
