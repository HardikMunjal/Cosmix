/** Personalized HR training: auto-categorize runs, zone time, and zone-speed progress. */

import { isWellnessApiReady, wellnessApiUrl } from './runningShoes';

export const TRAINING_CATEGORIES = [
  { id: 'recovery', label: 'Recovery', color: '#94a3b8', hint: 'Very easy, short shakeout' },
  { id: 'easy', label: 'Easy', color: '#4ade80', hint: 'Aerobic base' },
  { id: 'long', label: 'Long run', color: '#38bdf8', hint: 'Easy effort, longer distance' },
  { id: 'tempo', label: 'Tempo', color: '#f59e0b', hint: 'Sustained comfortably hard' },
  { id: 'threshold', label: 'Threshold', color: '#fb923c', hint: 'Near race effort' },
  { id: 'interval', label: 'Interval', color: '#fb7185', hint: 'Repeats with recoveries' },
  { id: 'race', label: 'Race', color: '#c084fc', hint: 'Competition or time trial' },
];

export const ZONE_META = [
  { zone: 1, short: 'Z1', label: 'Recovery', color: '#94a3b8' },
  { zone: 2, short: 'Z2', label: 'Fat burn', color: '#4ade80' },
  { zone: 3, short: 'Z3', label: 'Aerobic', color: '#38bdf8' },
  { zone: 4, short: 'Z4', label: 'Threshold', color: '#f59e0b' },
  { zone: 5, short: 'Z5', label: 'Max', color: '#fb7185' },
];

const CATEGORY_IDS = new Set(TRAINING_CATEGORIES.map((item) => item.id));

export function trainingCategoryMeta(id) {
  return TRAINING_CATEGORIES.find((item) => item.id === id) || TRAINING_CATEGORIES[1];
}

export function fmtTrainingPace(minPerKm) {
  const n = Number(minPerKm);
  if (!Number.isFinite(n) || n <= 0) return '--';
  const mins = Math.floor(n);
  const secs = Math.round((n - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function fmtFiveKmClock(paceMinPerKm) {
  const total = Number(paceMinPerKm) * 5;
  if (!Number.isFinite(total) || total <= 0) return '--';
  const mins = Math.floor(total);
  const secs = Math.round((total - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function runSpeedKmh(run) {
  const direct = Number(run?.avgSpeedKmh || 0);
  if (direct > 1.5) return direct;
  const minutes = Number(run?.minutes || 0);
  const distance = Number(run?.distance || run?.distanceKm || 0);
  if (distance > 0 && minutes > 0) return distance / (minutes / 60);
  const pace = runPaceMinPerKm(run);
  if (pace > 2.4) return 60 / pace;
  return null;
}

export function fmtTrainingSpeed(kmh) {
  const n = Number(kmh);
  if (!Number.isFinite(n) || n <= 0) return '--';
  return `${n.toFixed(1)} km/h`;
}

export function buildPersonalZoneBands(runs = []) {
  const buckets = {};
  (runs || []).forEach((run) => {
    (run.heartrateZones || []).forEach((zone) => {
      const id = Number(zone.zone || 0);
      if (!(id >= 1 && id <= 5)) return;
      const min = Number(zone.min || zone.minHr || 0);
      const max = Number(zone.max || zone.maxHr || 0);
      if (!(min > 40 || max > 40)) return;
      const row = buckets[id] || { mins: [], maxs: [] };
      if (min > 40) row.mins.push(min);
      if (max > 40) row.maxs.push(max);
      buckets[id] = row;
    });
  });
  const observedMax = (runs || []).reduce(
    (best, run) => Math.max(best, Number(run.maxHeartrate || run.avgHeartrate || 0)),
    0,
  );
  const fromActivity = Object.keys(buckets).length >= 3;
  const ceiling = fromActivity
    ? Math.max(
      observedMax,
      ...Object.values(buckets).flatMap((row) => row.maxs),
    )
    : observedMax;
  const source = fromActivity
    ? 'from your Strava zone bounds'
    : (ceiling >= 140 ? `from your peak HR ${Math.round(ceiling)} bpm` : null);

  return {
    ceiling: ceiling >= 140 ? Math.round(ceiling) : null,
    source,
    bands: ZONE_META.map((meta) => {
      const row = buckets[meta.zone];
      if (row && (row.mins.length || row.maxs.length)) {
        const min = row.mins.length ? Math.round(row.mins.reduce((s, n) => s + n, 0) / row.mins.length) : null;
        const max = row.maxs.length ? Math.round(row.maxs.reduce((s, n) => s + n, 0) / row.maxs.length) : null;
        return {
          ...meta,
          min,
          max,
          range: min && max ? `${min}–${max}` : (min ? `${min}+` : '--'),
        };
      }
      if (ceiling >= 140) {
        const pct = [
          { min: 0, max: 0.6 },
          { min: 0.6, max: 0.7 },
          { min: 0.7, max: 0.8 },
          { min: 0.8, max: 0.9 },
          { min: 0.9, max: 1.05 },
        ][meta.zone - 1];
        const min = Math.round(ceiling * pct.min);
        const max = Math.round(ceiling * pct.max);
        return { ...meta, min, max, range: `${min}–${max}` };
      }
      return { ...meta, min: null, max: null, range: '--' };
    }),
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

function zoneShare(zones = [], ids = []) {
  const rows = Array.isArray(zones) ? zones : [];
  const total = rows.reduce((sum, zone) => sum + Math.max(0, Number(zone.seconds || 0)), 0);
  if (!(total > 0)) {
    const perc = rows.reduce((sum, zone) => {
      const n = Number(zone.zone || 0);
      return ids.includes(n) ? sum + Number(zone.percent || 0) : sum;
    }, 0);
    return perc;
  }
  const part = rows.reduce((sum, zone) => {
    const n = Number(zone.zone || 0);
    return ids.includes(n) ? sum + Math.max(0, Number(zone.seconds || 0)) : sum;
  }, 0);
  return (part / total) * 100;
}

function nameHint(name = '') {
  const text = String(name || '').toLowerCase();
  if (/\b(race|marathon|half|10k|10 k|21k|21\.1|42k|42\.2|hm\b|fm\b|time trial|\bpb\b)\b/.test(text)) return 'race';
  if (/\b(interval|repeat|track|fartlek|yasso|strides|pyramid)\b/.test(text)) return 'interval';
  if (/\b(tempo|threshold|cruise)\b/.test(text)) return 'tempo';
  if (/\b(long run|longrun|lsd|easy long)\b/.test(text)) return 'long';
  if (/\b(recovery|shakeout|easy jog)\b/.test(text)) return 'recovery';
  if (/\b(easy)\b/.test(text)) return 'easy';
  return null;
}

export function runPaceMinPerKm(run) {
  const fromClock = Number(run?.paceMinPerKm || 0);
  if (fromClock > 2.4 && fromClock < 20) return fromClock;
  const minutes = Number(run?.minutes || 0);
  const distance = Number(run?.distance || run?.distanceKm || 0);
  if (distance > 0 && minutes > 0) {
    const pace = minutes / distance;
    if (pace > 2.4 && pace < 20) return pace;
  }
  const speed = Number(run?.avgSpeedKmh || 0);
  if (speed > 2) return 60 / speed;
  return null;
}

export function collectTrainingRuns(runRows = [], insights = null) {
  const byKey = new Map();
  const push = (row) => {
    const distance = Number(row.distance || row.distanceKm || 0);
    const minutes = Number(row.minutes || 0);
    if (!(distance > 0) && !(minutes > 0)) return;
    const stravaId = Number(row.stravaId || row.id || 0) || null;
    const key = stravaId || `d:${row.date}:${distance}:${minutes}`;
    const current = byKey.get(key) || {};
    byKey.set(key, {
      ...current,
      ...row,
      stravaId,
      date: row.date || current.date,
      name: row.name || current.name || 'Run',
      distance: distance || Number(current.distance || 0),
      minutes: minutes || Number(current.minutes || 0),
      avgHeartrate: Number(row.avgHeartrate || row.avgHeartRate || current.avgHeartrate || 0) || null,
      maxHeartrate: Number(row.maxHeartrate || row.maxHeartRate || current.maxHeartrate || 0) || null,
      avgSpeedKmh: Number(row.avgSpeedKmh || current.avgSpeedKmh || 0) || null,
      heartrateZones: Array.isArray(row.heartrateZones) && row.heartrateZones.length
        ? row.heartrateZones
        : (current.heartrateZones || []),
    });
  };
  (runRows || []).forEach(push);
  (insights?.recentRuns || []).forEach((run) => push({
    ...run,
    distance: run.distanceKm,
    stravaId: run.stravaId || run.id,
  }));
  (insights?.fastestRuns || []).forEach((run) => push({
    ...run,
    distance: run.distanceKm,
    stravaId: run.stravaId || run.id,
  }));
  return [...byKey.values()]
    .map((run) => {
      const pace = runPaceMinPerKm(run);
      const zEasy = zoneShare(run.heartrateZones, [1, 2]);
      const zHard = zoneShare(run.heartrateZones, [4, 5]);
      const zMid = zoneShare(run.heartrateZones, [3, 4]);
      return { ...run, paceMinPerKm: pace, zEasy, zHard, zMid };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function buildPersonalBaselines(runs = []) {
  const hr = runs.map((run) => Number(run.avgHeartrate || 0)).filter((n) => n > 80).sort((a, b) => a - b);
  const dist = runs.map((run) => Number(run.distance || 0)).filter((n) => n > 0).sort((a, b) => a - b);
  const pace = runs.map(runPaceMinPerKm).filter((n) => n > 2.4 && n < 18).sort((a, b) => a - b);
  const meanPace = pace.length ? pace.reduce((sum, n) => sum + n, 0) / pace.length : null;
  return {
    hrP25: percentile(hr, 25),
    hrP45: percentile(hr, 45),
    hrP60: percentile(hr, 60),
    distP20: percentile(dist, 20),
    distP80: percentile(dist, 80),
    paceP40: percentile(pace, 40),
    paceP55: percentile(pace, 55),
    paceP70: percentile(pace, 70),
    paceP85: percentile(pace, 85),
    meanPace,
    sampleCount: runs.length,
    maxHrSeen: runs.reduce((best, run) => Math.max(best, Number(run.maxHeartrate || run.avgHeartrate || 0)), 0) || null,
  };
}

function slowVsSelf(run, baselines = {}) {
  const pace = runPaceMinPerKm(run);
  if (!(pace > 0)) return { slow: false, verySlow: false, pace: null };
  const p70 = Number(baselines.paceP70 || 0);
  const p85 = Number(baselines.paceP85 || 0);
  const mean = Number(baselines.meanPace || 0);
  const samples = Number(baselines.sampleCount || 0);
  const verySlow = (p85 > 0 && pace >= p85) || (mean > 0 && pace >= mean * 1.18);
  const slow = verySlow
    || (p70 > 0 && pace >= p70)
    || (mean > 0 && pace >= mean * 1.1)
    || (samples < 5 && mean > 0 && pace >= mean * 1.06);
  return { slow, verySlow, pace };
}

function looksLikeInterval(run) {
  const zHard = Number(run.zHard || 0);
  const zEasy = Number(run.zEasy || 0);
  const distance = Number(run.distance || 0);
  return zHard >= 28 && (zEasy >= 12 || (distance > 0 && distance < 12));
}

function looksLikeHardRaceEffort(run, baselines = {}) {
  const pace = runPaceMinPerKm(run);
  const fast = pace && baselines.paceP40 && pace <= Number(baselines.paceP40);
  // High average HR alone is not race effort — heat and hills raise HR on easy jogs.
  return Number(run.zHard || 0) >= 22 || Boolean(fast);
}

function easyFamily(run, baselines, reason) {
  const distance = Number(run.distance || 0);
  const distLong = Math.max(14, Number(baselines.distP80 || 14));
  const distShort = Math.max(5.2, Number(baselines.distP20 || 5.2));
  const hr = Number(run.avgHeartrate || 0);
  const recoveryHr = Number(baselines.hrP25 || 132);
  if (distance >= distLong) {
    return { category: 'long', source: 'auto', reason };
  }
  if (distance > 0 && distance <= distShort && (hr > 0 ? hr <= recoveryHr : Number(run.zEasy || 0) >= 70)) {
    return { category: 'recovery', source: 'auto', reason };
  }
  return { category: 'easy', source: 'auto', reason };
}

export function classifyTrainingRun(run, baselines = {}, override = null) {
  if (override && CATEGORY_IDS.has(override)) {
    return { category: override, source: 'user', reason: 'You set this category' };
  }
  const hinted = nameHint(run.name);
  const hr = Number(run.avgHeartrate || 0);
  const distance = Number(run.distance || 0);
  const zEasy = Number(run.zEasy || 0);
  const zHard = Number(run.zHard || 0);
  const zMid = Number(run.zMid || 0);
  const distLong = Math.max(14, Number(baselines.distP80 || 14));
  const distShort = Math.max(5.2, Number(baselines.distP20 || 5.2));
  const easyHr = Number(baselines.hrP45 || 145);
  const recoveryHr = Number(baselines.hrP25 || 132);
  const { slow, verySlow } = slowVsSelf(run, baselines);

  // Intervals often have a slow overall pace because of recoveries — keep that signature first.
  if (looksLikeInterval(run)) {
    return { category: 'interval', source: 'auto', reason: 'Hard + easier mix — typical intervals' };
  }
  if (zHard >= 35 && zEasy < 15 && distance >= 4 && distance <= 16) {
    return { category: 'threshold', source: 'auto', reason: 'Most time in Z4–Z5' };
  }

  // Personal pace: a jog that is slow for *you* is easy, even if HR is a bit high or the title says tempo/race.
  if ((slow || verySlow) && !looksLikeHardRaceEffort(run, baselines)) {
    const why = verySlow
      ? `Very slow vs your usual ${fmtTrainingPace(baselines.meanPace)} /km`
      : `Slower than your typical ${fmtTrainingPace(baselines.meanPace || baselines.paceP55)} /km`;
    return easyFamily(run, baselines, why);
  }

  if (hinted === 'race' && looksLikeHardRaceEffort(run, baselines) && (distance >= 9.5 || /marathon|42|21|half|10k/.test(String(run.name || '').toLowerCase()))) {
    return { category: 'race', source: 'auto', reason: 'Race distance / name at race effort' };
  }
  if (hinted && hinted !== 'easy' && hinted !== 'race' && !slow) {
    return { category: hinted, source: 'auto', reason: 'From the run name' };
  }
  if (zMid >= 45 && zHard < 32 && !slow) {
    return { category: 'tempo', source: 'auto', reason: 'Sustained Z3–Z4' };
  }
  if (distance >= distLong && (zEasy >= 42 || (hr > 0 && hr <= easyHr + 6) || slow)) {
    return { category: 'long', source: 'auto', reason: 'Longer than your usual runs at easy effort' };
  }
  if (distance > 0 && distance <= distShort && (hr > 0 ? hr <= recoveryHr : zEasy >= 70)) {
    return { category: 'recovery', source: 'auto', reason: 'Short and easy vs your history' };
  }
  if (zEasy >= 52 || (hr > 0 && hr <= easyHr) || hinted === 'easy' || slow) {
    return { category: 'easy', source: 'auto', reason: slow
      ? 'Slow vs your history — easy'
      : 'Mostly Z1–Z2 / below your mid HR' };
  }
  if (hr > 0 && hr > Number(baselines.hrP60 || 155) && !slow) {
    return { category: 'tempo', source: 'auto', reason: 'HR above your usual mid-pack' };
  }
  return { category: 'easy', source: 'auto', reason: 'Default easy for this athlete' };
}

function zoneSpeedFromRun(run, zoneId) {
  const zones = Array.isArray(run.heartrateZones) ? run.heartrateZones : [];
  const zone = zones.find((item) => Number(item.zone || 0) === zoneId);
  if (!zone) return null;
  const seconds = Math.max(0, Number(zone.seconds || 0));
  const percent = Number(zone.percent || 0);
  const speed = Number(zone.avgSpeedKmh || 0);
  if (!(speed > 1.5) || (seconds < 90 && percent < 8)) return null;
  return {
    date: run.date,
    stravaId: run.stravaId,
    speedKmh: speed,
    paceMinPerKm: 60 / speed,
    seconds,
    percent,
  };
}

function avg(values) {
  const rows = (values || []).filter((n) => Number.isFinite(n) && n > 0);
  if (!rows.length) return null;
  return rows.reduce((sum, n) => sum + n, 0) / rows.length;
}

export function buildHrTrainingModel({
  runRows = [],
  insights = null,
  overrides = {},
} = {}) {
  const runs = collectTrainingRuns(runRows, insights);
  const baselines = buildPersonalBaselines(runs);
  const labeled = runs.map((run) => {
    const override = run.stravaId ? overrides[String(run.stravaId)] : null;
    const cat = classifyTrainingRun(run, baselines, override);
    const meta = trainingCategoryMeta(cat.category);
    return { ...run, ...cat, color: meta.color, label: meta.label };
  });

  const seasonZones = ZONE_META.map((meta) => {
    let seconds = 0;
    labeled.forEach((run) => {
      const zone = (run.heartrateZones || []).find((item) => Number(item.zone || 0) === meta.zone);
      seconds += Math.max(0, Number(zone?.seconds || 0));
    });
    return { ...meta, seconds };
  });
  const seasonTotal = seasonZones.reduce((sum, zone) => sum + zone.seconds, 0) || 1;
  const seasonZonePercents = seasonZones.map((zone) => ({
    ...zone,
    percent: Math.round((zone.seconds / seasonTotal) * 1000) / 10,
    minutes: Math.round(zone.seconds / 60),
  }));

  const history = [...labeled].filter((run) => (run.heartrateZones || []).length).slice(0, 40).reverse();
  const zoneHistory = history.map((run) => {
    const shares = ZONE_META.map((meta) => {
      const zone = (run.heartrateZones || []).find((item) => Number(item.zone || 0) === meta.zone);
      return {
        zone: meta.zone,
        percent: Number(zone?.percent || 0) || (Number(zone?.seconds || 0) > 0
          ? zoneShare(run.heartrateZones, [meta.zone])
          : 0),
        color: meta.color,
      };
    });
    return {
      date: run.date,
      name: run.name,
      stravaId: run.stravaId,
      category: run.category,
      categoryLabel: run.label,
      categoryColor: run.color,
      z1: shares[0].percent,
      shares,
    };
  });

  const easyRuns = labeled.filter((run) => run.category === 'easy' || run.category === 'recovery' || run.category === 'long');
  const easyHrSeries = [...easyRuns]
    .filter((run) => Number(run.avgHeartrate || 0) > 80)
    .slice(0, 36)
    .reverse()
    .map((run) => ({
      date: run.date,
      y: run.avgHeartrate,
      label: run.name,
      stravaId: run.stravaId,
      category: run.category,
      distance: run.distance,
      speedKmh: runSpeedKmh(run),
      paceMinPerKm: run.paceMinPerKm,
    }));
  const easyHrNow = avg(easyHrSeries.slice(-6).map((p) => p.y));
  const easyHrThen = avg(easyHrSeries.slice(0, Math.max(1, easyHrSeries.length - 6)).slice(-6).map((p) => p.y));
  const easyAvgSpeed = avg(easyRuns.map(runSpeedKmh));
  const totalKm = labeled.reduce((sum, run) => sum + Number(run.distance || 0), 0);
  const avgSpeed = avg(labeled.map(runSpeedKmh));
  const personalZones = buildPersonalZoneBands(labeled);

  const zoneSpeeds = ZONE_META.map((meta) => {
    const samples = labeled
      .map((run) => zoneSpeedFromRun(run, meta.zone))
      .filter(Boolean)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const recent = samples.slice(-4);
    const older = samples.length > 4 ? samples.slice(Math.max(0, samples.length - 10), samples.length - 4) : [];
    const nowPace = avg(recent.map((s) => s.paceMinPerKm));
    const thenPace = avg(older.map((s) => s.paceMinPerKm));
    const nowSpeed = avg(recent.map((s) => s.speedKmh));
    return {
      ...meta,
      sampleCount: samples.length,
      currentPace: nowPace,
      previousPace: thenPace,
      currentSpeed: nowSpeed,
      fiveKmNow: nowPace ? fmtFiveKmClock(nowPace) : '--',
      fiveKmThen: thenPace ? fmtFiveKmClock(thenPace) : '--',
      faster: nowPace && thenPace ? nowPace < thenPace - 0.05 : null,
      deltaSecPerKm: nowPace && thenPace ? Math.round((nowPace - thenPace) * 60) : null,
      series: samples.slice(-16).map((s) => ({ date: s.date, y: s.paceMinPerKm, speed: s.speedKmh })),
    };
  });

  const grouped = TRAINING_CATEGORIES.map((meta) => {
    const rows = labeled.filter((run) => run.category === meta.id);
    return {
      ...meta,
      count: rows.length,
      km: Math.round(rows.reduce((sum, run) => sum + Number(run.distance || 0), 0) * 10) / 10,
      avgHr: avg(rows.map((run) => Number(run.avgHeartrate || 0))) || null,
      avgSpeed: avg(rows.map(runSpeedKmh)),
      rows,
    };
  }).filter((group) => group.count > 0);

  return {
    runs: labeled,
    lastRun: labeled[0] || null,
    baselines,
    seasonZonePercents,
    zoneHistory,
    easyHrSeries,
    easyRuns,
    easyHrNow,
    easyHrThen,
    easyHrDelta: easyHrNow && easyHrThen ? Math.round(easyHrNow - easyHrThen) : null,
    easyAvgSpeed,
    totalKm: Math.round(totalKm * 10) / 10,
    avgSpeed,
    personalZones,
    zoneSpeeds,
    grouped,
    runCount: labeled.length,
  };
}

export function readLocalTrainingOverrides(userId) {
  if (typeof window === 'undefined' || !userId) return {};
  try {
    const raw = window.localStorage.getItem(`cosmix-training-${userId}`);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed?.categories && typeof parsed.categories === 'object' ? parsed.categories : {};
  } catch (_) {
    return {};
  }
}

export function writeLocalTrainingOverride(userId, activityId, category) {
  if (typeof window === 'undefined' || !userId || !activityId) return;
  try {
    const current = readLocalTrainingOverrides(userId);
    current[String(activityId)] = category;
    window.localStorage.setItem(`cosmix-training-${userId}`, JSON.stringify({ categories: current }));
  } catch (_) { /* ignore */ }
}

export async function persistTrainingCategory(userId, activityId, category) {
  if (!activityId || !category) return;
  writeLocalTrainingOverride(userId, activityId, category);
  if (typeof window === 'undefined' || !userId || !isWellnessApiReady()) return;
  try {
    await fetch(wellnessApiUrl(`/wellness/training/${encodeURIComponent(userId)}/runs/${encodeURIComponent(activityId)}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category }),
    });
  } catch (_) { /* local override still applied */ }
}
