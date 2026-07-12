import { getAuthenticatedUser, resolveUsersByUsernames } from '../../../server/authStore';
import {
  createTrip,
  linkWatcherToTrip,
  listTripsForUser,
} from '../../../server/buddySafetyStore';
import { resolveAppOrigin } from '../../../server/buddySafetyNotify';

/** Trip list + create — `/api/buddy-safety` (catch-all does not match empty path). */
export default async function handler(req, res) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) {
    return res.status(401).json({ error: 'Session expired.' });
  }

  try {
    if (req.method === 'GET') {
      const trips = await listTripsForUser(user);
      for (const trip of trips) {
        if (!trip.watcherId && trip.watcherUsernameKey === String(user.username || '').trim().toLowerCase()) {
          await linkWatcherToTrip(trip.id, user);
        }
      }
      const refreshed = await listTripsForUser(user);
      return res.status(200).json({ trips: refreshed });
    }

    if (req.method === 'POST') {
      const watcherUsername = String(req.body?.watcherUsername || '').trim();
      const resolved = watcherUsername
        ? await resolveUsersByUsernames([watcherUsername], user.id)
        : [];
      const watcher = resolved[0] || null;
      const trip = await createTrip(user, {
        ...req.body,
        watcherId: watcher?.id || null,
        watcherName: watcher?.name || watcher?.username || watcherUsername,
        appOrigin: resolveAppOrigin(req),
      });
      return res.status(201).json({ trip });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error('buddy-safety index api failed:', error);
    return res.status(400).json({ error: error.message || 'Request failed.' });
  }
}
