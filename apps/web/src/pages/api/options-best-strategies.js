import { runOptimizer } from '../../server/optionsOptimizerEngine';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  try {
    const result = await runOptimizer(req.body || {});
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Optimizer failed' });
  }
}
