const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

function syncStorageKey(userId) {
  return `cosmix-strava-last-sync-${userId}`;
}

export function formatStravaSyncMessage(payload) {
  if (!payload) return '';
  if (payload.alreadyUpToDate) {
    return `Strava up to date · ${payload.skippedActivities || 0} activities already synced`;
  }
  const maxSpeed = payload.insights?.maxSpeedKmh ? ` · max ${payload.insights.maxSpeedKmh} km/h` : '';
  const hr = payload.entries?.[0]?.stravaAvgHeartRate ? ` · avg HR ${payload.entries[0].stravaAvgHeartRate} bpm` : '';
  return `Synced ${payload.newActivities || 0} new activities · ${payload.newDays || payload.imported || 0} day(s) updated${maxSpeed}${hr}`;
}

export async function runStravaAutoSync({
  userId,
  apiBase,
  force = false,
  onMessage,
  onEntries,
}) {
  const uid = String(userId || '').trim();
  if (!uid || typeof window === 'undefined') return null;

  const lastSync = Number(localStorage.getItem(syncStorageKey(uid)) || 0);
  if (!force && lastSync && Date.now() - lastSync < SYNC_INTERVAL_MS) {
    return { skippedDueToInterval: true };
  }

  const status = await fetch(`${apiBase}/wellness/strava/status/${encodeURIComponent(uid)}`)
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  if (!status?.connected) return null;

  const payload = await fetch(`${apiBase}/wellness/strava/activities/${encodeURIComponent(uid)}?days=90&import=1`)
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);

  localStorage.setItem(syncStorageKey(uid), String(Date.now()));
  if (!payload) return null;

  if (onMessage) onMessage(formatStravaSyncMessage(payload));

  if (onEntries) {
    const data = await fetch(`${apiBase}/wellness/data/${encodeURIComponent(uid)}`)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
    if (Array.isArray(data?.entries)) onEntries(data.entries, data);
  }

  return payload;
}
