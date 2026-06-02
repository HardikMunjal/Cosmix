const WELLNESS_SERVICE_URL = process.env.WELLNESS_SERVICE_URL || '';

// Allow self-signed cert when hitting EC2 directly by IP.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function emptyWellnessPayload(segments, method) {
  if (method !== 'GET') return null;
  if (segments.startsWith('plan-summary/')) {
    return { hasActivePlan: false, series: [], plan: null, cumulativeTotal: 0 };
  }
  if (segments.startsWith('data/')) {
    return { entries: [], dailyScores: [], plans: [], plan: null };
  }
  if (segments === 'defaults' || segments === 'scoring-rules') {
    return {};
  }
  return null;
}

export default async function handler(req, res) {
  const { path, ...queryParams } = req.query;
  const segments = Array.isArray(path) ? path.join('/') : String(path || '');
  const qs = new URLSearchParams(queryParams).toString();
  const host = String(req.headers.host || '').toLowerCase();
  const isLocalHost = host.startsWith('localhost:') || host.startsWith('127.0.0.1:');
  const configured = String(WELLNESS_SERVICE_URL || '').trim();
  const serviceBase = configured || (isLocalHost ? 'http://127.0.0.1:3004' : 'http://wellness-service:3004');
  const target = `${serviceBase}/wellness/${segments}${qs ? `?${qs}` : ''}`;

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: { 'content-type': 'application/json' },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const fallback = emptyWellnessPayload(segments, req.method);
      if (fallback) {
        return res.status(200).json(fallback);
      }
    }
    return res.status(upstream.status).json(data);
  } catch (err) {
    const fallback = emptyWellnessPayload(segments, req.method);
    if (fallback) {
      return res.status(200).json(fallback);
    }
    return res.status(502).json({ message: 'Wellness service unreachable', error: String(err.message) });
  }
}
