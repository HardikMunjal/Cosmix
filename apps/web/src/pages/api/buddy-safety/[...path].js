import { getAuthenticatedUser, resolveUsersByUsernames } from '../../../server/authStore';
import {
  acknowledgeAlert,
  addTripPing,
  createTrip,
  endTrip,
  getTripById,
  linkWatcherToTrip,
  listTripsForUser,
} from '../../../server/buddySafetyStore';
import { getSafetyProfile, saveSafetyProfile } from '../../../server/buddySafetyProfileStore';
import { resolveAppOrigin } from '../../../server/buddySafetyNotify';

export default async function handler(req, res) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) {
    return res.status(401).json({ error: 'Session expired.' });
  }

  const segments = Array.isArray(req.query.path) ? req.query.path.filter(Boolean) : (req.query.path ? [req.query.path] : []);
  const [head, action] = segments;

  try {
    if (head === 'profile') {
      if (req.method === 'GET') {
        const profile = await getSafetyProfile(user.id);
        return res.status(200).json({ profile });
      }
      if (req.method === 'PUT') {
        const profile = await saveSafetyProfile(user.id, req.body || {});
        return res.status(200).json({ profile });
      }
      res.setHeader('Allow', 'GET, PUT');
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    if (req.method === 'GET' && !head) {
      const trips = await listTripsForUser(user);
      for (const trip of trips) {
        if (!trip.watcherId && trip.watcherUsernameKey === String(user.username || '').trim().toLowerCase()) {
          await linkWatcherToTrip(trip.id, user);
        }
      }
      const refreshed = await listTripsForUser(user);
      return res.status(200).json({ trips: refreshed });
    }

    if (req.method === 'POST' && !head) {
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

    if (req.method === 'GET' && head && !action) {
      let trip = await getTripById(head, user);
      if (!trip) {
        return res.status(404).json({ error: 'Trip not found.' });
      }
      if (!trip.watcherId && trip.watcherUsernameKey === String(user.username || '').trim().toLowerCase()) {
        trip = await linkWatcherToTrip(trip.id, user);
      }
      return res.status(200).json({ trip });
    }

    if (req.method === 'POST' && head && action === 'ping') {
      const result = await addTripPing(head, user, req.body || {}, {
        appOrigin: resolveAppOrigin(req),
      });
      return res.status(200).json(result);
    }

    if (req.method === 'POST' && head && action === 'end') {
      const trip = await endTrip(head, user);
      return res.status(200).json({ trip });
    }

    if (req.method === 'POST' && head && action === 'ack-alert') {
      const alertId = String(req.body?.alertId || '').trim();
      const trip = await acknowledgeAlert(head, alertId, user);
      return res.status(200).json({ trip });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error('buddy-safety api failed:', error);
    return res.status(400).json({ error: error.message || 'Request failed.' });
  }
}
