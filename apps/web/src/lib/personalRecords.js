/**
 * Detect personal records vs a local snapshot so we can celebrate instantly.
 */

function fmtPace(minPerKm) {
  if (!minPerKm || !Number.isFinite(minPerKm) || minPerKm <= 0) return '--';
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')} /km`;
}

function snapshotKey(userId) {
  return `cosmix-pr-snapshot-v1-${userId}`;
}

function seenKey(userId) {
  return `cosmix-pr-seen-v1-${userId}`;
}

export function loadPrSnapshot(userId) {
  if (!userId || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(snapshotKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function savePrSnapshot(userId, snapshot) {
  if (!userId || typeof window === 'undefined' || !snapshot) return;
  try {
    localStorage.setItem(snapshotKey(userId), JSON.stringify(snapshot));
  } catch (_) { /* ignore */ }
}

function loadSeenIds(userId) {
  if (!userId || typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(seenKey(userId));
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (_) {
    return new Set();
  }
}

export function markRecordsSeen(userId, recordIds = []) {
  if (!userId || typeof window === 'undefined') return;
  const seen = loadSeenIds(userId);
  recordIds.forEach((id) => seen.add(String(id)));
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify([...seen].slice(-80)));
  } catch (_) { /* ignore */ }
}

const BANDS = [
  { id: '5k', label: '5K', minKm: 4.5, maxKm: 5.8 },
  { id: '10k', label: '10K', minKm: 9.0, maxKm: 11.5 },
  { id: 'half', label: 'Half', minKm: 20.0, maxKm: 23.0 },
];

function paceOf(row) {
  const d = Number(row.distance || row.distanceKm || 0);
  const m = Number(row.minutes || 0);
  if (d <= 0 || m <= 0) return null;
  return m / d;
}

/** Build current bests from run rows + optional Strava insights. */
export function buildPrSnapshotFromData({ runRows = [], stravaInsights = null } = {}) {
  const rows = (runRows || []).filter((r) => Number(r.distance || 0) >= 2 && Number(r.minutes || 0) > 0);
  const distances = rows.map((r) => Number(r.distance));
  const paces = rows.map(paceOf).filter((p) => p != null);
  const splits = rows
    .map((r) => Number(r.bestSplitPaceMinPerKm || 0))
    .filter((p) => p > 0);

  const insightSplit = Number(stravaInsights?.bestSplitPaceMinPerKm || 0) || null;
  const bestSplit = insightSplit || (splits.length ? Math.min(...splits) : null);
  const bestSplitRun = stravaInsights?.bestSplitRun || null;

  const bandBests = {};
  BANDS.forEach((band) => {
    const bandRows = rows.filter((r) => {
      const d = Number(r.distance);
      return d >= band.minKm && d <= band.maxKm;
    });
    const bandPaces = bandRows.map(paceOf).filter((p) => p != null);
    bandBests[band.id] = bandPaces.length ? Math.min(...bandPaces) : null;
  });

  const longest = distances.length ? Math.max(...distances) : null;
  const bestPace = paces.length ? Math.min(...paces) : null;
  const topSpeed = bestSplit ? Number((60 / bestSplit).toFixed(2)) : null;
  const longestRow = rows.find((r) => Number(r.distance) === longest) || null;

  return {
    updatedAt: new Date().toISOString(),
    longestKm: longest,
    bestPaceMinPerKm: bestPace,
    bestSplitPaceMinPerKm: bestSplit,
    topSpeedKmh: topSpeed,
    bandBests,
    bestSplitActivityId: bestSplitRun?.id || bestSplitRun?.stravaId || null,
    longestActivityId: longestRow?.stravaId || longestRow?.id || null,
  };
}

/**
 * Compare current data to saved snapshot.
 * First visit seeds silently (no popup).
 * Returns { records, snapshot, seeded }.
 */
export function detectNewPersonalRecords({
  userId,
  runRows = [],
  stravaInsights = null,
} = {}) {
  const next = buildPrSnapshotFromData({ runRows, stravaInsights });
  const prev = loadPrSnapshot(userId);
  if (!prev) {
    savePrSnapshot(userId, next);
    return { records: [], snapshot: next, seeded: true };
  }

  const seen = loadSeenIds(userId);
  const records = [];
  const stamp = String(stravaInsights?.bestSplitRun?.date || new Date().toISOString().slice(0, 10));

  if (
    next.longestKm != null
    && (prev.longestKm == null || next.longestKm > prev.longestKm + 0.05)
    && next.longestKm >= 3
  ) {
    const id = `pr-longest-${stamp}-${next.longestKm.toFixed(2)}`;
    if (!seen.has(id)) {
      records.push({
        id,
        kind: 'record',
        emoji: '🏅',
        title: 'New longest run',
        body: prev.longestKm != null
          ? `${next.longestKm.toFixed(1)} km — beat your previous ${prev.longestKm.toFixed(1)} km.`
          : `${next.longestKm.toFixed(1)} km — a new distance mark.`,
        metricLabel: 'Distance',
        metricValue: `${next.longestKm.toFixed(1)} km`,
        previousValue: prev.longestKm != null ? `${prev.longestKm.toFixed(1)} km` : null,
        activityId: next.longestActivityId || null,
        shareHint: 'longest',
      });
    }
  }

  if (
    next.bestPaceMinPerKm != null
    && (prev.bestPaceMinPerKm == null || next.bestPaceMinPerKm < prev.bestPaceMinPerKm - 0.01)
  ) {
    const id = `pr-pace-${stamp}-${next.bestPaceMinPerKm.toFixed(3)}`;
    if (!seen.has(id)) {
      records.push({
        id,
        kind: 'pace',
        emoji: '⚡',
        title: 'New best pace',
        body: prev.bestPaceMinPerKm != null
          ? `${fmtPace(next.bestPaceMinPerKm)} — faster than ${fmtPace(prev.bestPaceMinPerKm)}.`
          : `${fmtPace(next.bestPaceMinPerKm)} — new speed mark.`,
        metricLabel: 'Pace',
        metricValue: fmtPace(next.bestPaceMinPerKm),
        previousValue: prev.bestPaceMinPerKm != null ? fmtPace(prev.bestPaceMinPerKm) : null,
        activityId: null,
        shareHint: 'pace',
      });
    }
  }

  if (
    next.bestSplitPaceMinPerKm != null
    && (prev.bestSplitPaceMinPerKm == null || next.bestSplitPaceMinPerKm < prev.bestSplitPaceMinPerKm - 0.01)
  ) {
    const id = `pr-split-${stamp}-${next.bestSplitPaceMinPerKm.toFixed(3)}`;
    if (!seen.has(id)) {
      records.push({
        id,
        kind: 'split',
        emoji: '🎯',
        title: 'New best 1 km split',
        body: prev.bestSplitPaceMinPerKm != null
          ? `${fmtPace(next.bestSplitPaceMinPerKm)} — crushed ${fmtPace(prev.bestSplitPaceMinPerKm)}.`
          : `${fmtPace(next.bestSplitPaceMinPerKm)} — first clean 1 km PR.`,
        metricLabel: '1 km split',
        metricValue: fmtPace(next.bestSplitPaceMinPerKm),
        previousValue: prev.bestSplitPaceMinPerKm != null ? fmtPace(prev.bestSplitPaceMinPerKm) : null,
        activityId: next.bestSplitActivityId || null,
        shareHint: 'split',
      });
    }
  }

  if (
    next.topSpeedKmh != null
    && (prev.topSpeedKmh == null || next.topSpeedKmh > prev.topSpeedKmh + 0.05)
  ) {
    const id = `pr-speed-${stamp}-${next.topSpeedKmh.toFixed(2)}`;
    if (!seen.has(id)) {
      records.push({
        id,
        kind: 'pace',
        emoji: '🚀',
        title: 'New top speed',
        body: `${next.topSpeedKmh.toFixed(1)} km/h from your best 1 km split.`,
        metricLabel: 'Top speed',
        metricValue: `${next.topSpeedKmh.toFixed(1)} km/h`,
        previousValue: prev.topSpeedKmh != null ? `${prev.topSpeedKmh.toFixed(1)} km/h` : null,
        activityId: next.bestSplitActivityId || null,
        shareHint: 'speed',
      });
    }
  }

  BANDS.forEach((band) => {
    const nextPace = next.bandBests?.[band.id];
    const prevPace = prev.bandBests?.[band.id];
    if (nextPace == null) return;
    if (prevPace != null && !(nextPace < prevPace - 0.01)) return;
    const id = `pr-band-${band.id}-${stamp}-${nextPace.toFixed(3)}`;
    if (seen.has(id)) return;
    records.push({
      id,
      kind: 'split',
      emoji: '🏁',
      title: `New best ${band.label}`,
      body: prevPace != null
        ? `${fmtPace(nextPace)} — beat ${fmtPace(prevPace)} in the ${band.label} band.`
        : `${fmtPace(nextPace)} — first ${band.label} benchmark.`,
      metricLabel: band.label,
      metricValue: fmtPace(nextPace),
      previousValue: prevPace != null ? fmtPace(prevPace) : null,
      activityId: null,
      shareHint: band.id,
    });
  });

  savePrSnapshot(userId, next);
  return { records, snapshot: next, seeded: false };
}
