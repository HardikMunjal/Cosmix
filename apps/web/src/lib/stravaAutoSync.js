const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_SYNC_FLAG_PREFIX = 'cosmix-strava-initial-sync-';

function syncStorageKey(userId) {
  return `cosmix-strava-last-sync-${userId}`;
}

function firstSyncFlagKey(userId) {
  return `${FIRST_SYNC_FLAG_PREFIX}${userId}`;
}

export function formatStravaSyncMessage(payload) {
  if (!payload) return '';
  if (payload.alreadyUpToDate) {
    return `Strava up to date · ${payload.skippedActivities || 0} activities already synced`;
  }
  const windowNote = payload.firstSync ? ` · first sync ${payload.windowDays || 730}d` : '';
  const maxSpeed = payload.insights?.maxSpeedKmh ? ` · max ${payload.insights.maxSpeedKmh} km/h` : '';
  const hrFromEntry = payload.entries?.find((entry) => Number(entry?.stravaAvgHeartRate || entry?.heartRateAvg || 0) > 0);
  const hrValue = Number(hrFromEntry?.stravaAvgHeartRate || hrFromEntry?.heartRateAvg || payload.insights?.avgHeartRate || 0);
  const hr = hrValue > 0 ? ` · avg HR ${hrValue} bpm` : '';
  const hrDays = payload.heartRateDays ? ` · HR on ${payload.heartRateDays} day(s)` : '';
  const hrRefresh = payload.heartRateUpdated ? ` · refreshed HR on ${payload.heartRateUpdated} day(s)` : '';
  return `Synced ${payload.newActivities || 0} new activities · ${payload.newDays || payload.imported || 0} day(s) updated${windowNote}${maxSpeed}${hr}${hrDays}${hrRefresh}`;
}

function withApiBase(apiBase, path) {
  const base = apiBase == null ? '' : String(apiBase);
  return `${base}${path}`;
}

export async function runStravaAutoSync({
  userId,
  apiBase,
  force = false,
  full = false,
  onMessage,
  onEntries,
}) {
  const uid = String(userId || '').trim();
  if (!uid || typeof window === 'undefined') return null;

  const lastSync = Number(localStorage.getItem(syncStorageKey(uid)) || 0);
  if (!force && lastSync && Date.now() - lastSync < SYNC_INTERVAL_MS) {
    return { skippedDueToInterval: true };
  }

  const status = await fetch(withApiBase(apiBase, `/wellness/strava/status/${encodeURIComponent(uid)}`))
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  if (!status?.connected) return null;

  const initialDone = localStorage.getItem(firstSyncFlagKey(uid)) === '1';
  const useFullHistory = Boolean(full) || !initialDone;
  // Incremental sync stays short so today's run imports quickly (avoids long HR enrichment timeouts).
  const days = useFullHistory ? 730 : 21;
  const query = `days=${days}&import=1${useFullHistory ? '&full=1' : ''}`;

  const payload = await fetch(withApiBase(apiBase, `/wellness/strava/activities/${encodeURIComponent(uid)}?${query}`))
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);

  // Only stamp last-sync after a successful response — failed/timeout syncs must be retryable.
  if (!payload) {
    if (onMessage) onMessage('Strava sync failed — try Sync again.');
    return null;
  }
  localStorage.setItem(syncStorageKey(uid), String(Date.now()));
  if (useFullHistory || payload.firstSync) {
    localStorage.setItem(firstSyncFlagKey(uid), '1');
  }

  if (onMessage) onMessage(formatStravaSyncMessage(payload));

  if (onEntries) {
    const data = await fetch(withApiBase(apiBase, `/wellness/data/${encodeURIComponent(uid)}`))
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
    if (Array.isArray(data?.entries)) onEntries(data.entries, data);
  }

  return payload;
}
