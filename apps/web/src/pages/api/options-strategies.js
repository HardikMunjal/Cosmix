import { deleteStrategyById, getStrategyById, listStrategies, upsertStrategy } from '../../server/strategyStore';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const strategies = await listStrategies();
      const id = req.query?.id;
      if (id) {
        const strategy = await getStrategyById(id);
        if (!strategy) {
          return res.status(404).json({ error: 'Strategy not found.' });
        }
        return res.status(200).json({ strategy });
      }
      return res.status(200).json({ strategies });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

      const hasLegs = body.legs && Array.isArray(body.legs) && body.legs.length > 0;
      const hasClosedLegs = body.closedLegs && Array.isArray(body.closedLegs) && body.closedLegs.length > 0;
      if (!hasLegs && !hasClosedLegs && body.status !== 'closed') {
        return res.status(400).json({ error: 'A strategy needs at least one leg.' });
      }

      const strategy = await upsertStrategy(body);
      const strategies = await listStrategies();
      return res.status(200).json({ ok: true, strategy, strategies });
    }

    if (req.method === 'DELETE') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const id = body.id;
      if (!id) {
        return res.status(400).json({ error: 'Strategy id is required.' });
      }

      await deleteStrategyById(id);
      const strategies = await listStrategies();
      return res.status(200).json({ ok: true, strategies });
    }

    res.setHeader('Allow', 'GET,POST,PUT,DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error('options-strategies api error', error);
    return res.status(500).json({ error: 'Unable to persist strategies right now.' });
  }
}
