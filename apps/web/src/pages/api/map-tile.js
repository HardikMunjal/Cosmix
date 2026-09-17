const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';
const CARTO = 'https://a.basemaps.cartocdn.com/rastertiles/voyager';
const CARTO_DARK = 'https://a.basemaps.cartocdn.com/dark_all';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }

  const z = Number(req.query.z);
  const x = Number(req.query.x);
  const y = Number(req.query.y);
  const src = String(req.query.src || 'esri');
  const n = 2 ** z;

  if (!Number.isInteger(z) || z < 10 || z > 18 || !Number.isInteger(x) || !Number.isInteger(y)) {
    return res.status(400).json({ error: 'Invalid tile' });
  }
  if (x < 0 || y < 0 || x >= n || y >= n) {
    return res.status(400).json({ error: 'Tile out of range' });
  }

  const url = src === 'carto'
    ? `${CARTO}/${z}/${x}/${y}@2x.png`
    : src === 'dark'
      ? `${CARTO_DARK}/${z}/${x}/${y}@2x.png`
      : `${ESRI}/${z}/${y}/${x}`;

  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'CosmixRunShare/1.0' },
    });
    if (!upstream.ok) {
      return res.status(upstream.status).end();
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get('content-type') || (src === 'carto' ? 'image/png' : 'image/jpeg');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    return res.status(200).send(buffer);
  } catch (_) {
    return res.status(502).json({ error: 'Tile fetch failed' });
  }
}
