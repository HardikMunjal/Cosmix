const POST_SERVICE_URL = process.env.POST_SERVICE_URL || '';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export default async function handler(req, res) {
  const { path, ...queryParams } = req.query;
  const segments = Array.isArray(path) ? path.join('/') : String(path || '');
  const qs = new URLSearchParams(queryParams).toString();
  const host = String(req.headers.host || '').toLowerCase();
  const isLocalHost = host.startsWith('localhost:') || host.startsWith('127.0.0.1:');
  const serviceBase = isLocalHost ? 'http://127.0.0.1:3007' : (POST_SERVICE_URL || 'http://post-service:3007');
  const target = `${serviceBase}/posts/${segments}${qs ? `?${qs}` : ''}`;

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: { 'content-type': 'application/json' },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });

    const data = await upstream.json().catch(() => ({}));
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ message: 'Post service unreachable', error: String(err.message) });
  }
}
