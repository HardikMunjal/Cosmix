/** Personalized HR training: auto-categorize runs, zone time, and zone-speed progress. */

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
  return [...byKey.values()]
    .map((run) => {
      const pace = run.distance > 0 && run.minutes > 0 ? run.minutes / run.distance : null;
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
  const pace = runs.map((run) => Number(run.paceMinPerKm || 0)).filter((n) => n > 2 && n < 12).sort((a, b) => a - b);
  return {
    hrP25: percentile(hr, 25),
    hrP45: percentile(hr, 45),
    hrP60: percentile(hr, 60),
    distP20: percentile(dist, 20),
    distP80: percentile(dist, 80),
    paceP40: percentile(pace, 40),
    sampleCount: runs.length,
    maxHrSeen: runs.reduce((best, run) => Math.max(best, Number(run.maxHeartrate || run.avgHeartrate || 0)), 0) || 190,
  };
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

  if (hinted === 'race' && (distance >= 9.5 || /marathon|42/.test(String(run.name || '').toLowerCase()))) {
    return { category: 'race', source: 'auto', reason: 'Race distance / name' };
  }
  if (hinted && hinted !== 'easy') {
    return { category: hinted, source: 'auto', reason: 'From the run name' };
  }
  if (zHard >= 28 && (zEasy >= 12 || distance < 12)) {
    return { category: 'interval', source: 'auto', reason: 'Hard + easier mix — typical intervals' };
  }
  if (zHard >= 35 && zEasy < 15 && distance >= 4 && distance <= 16) {
    return { category: 'threshold', source: 'auto', reason: 'Most time in Z4–Z5' };
  }
  if (zMid >= 45 && zHard < 32) {
    return { category: 'tempo', source: 'auto', reason: 'Sustained Z3–Z4' };
  }
  if (distance >= distLong && (zEasy >= 42 || (hr > 0 && hr <= easyHr + 6))) {
    return { category: 'long', source: 'auto', reason: 'Longer than your usual runs at easy effort' };
  }
  if (distance > 0 && distance <= distShort && (hr > 0 ? hr <= recoveryHr : zEasy >= 70)) {
    return { category: 'recovery', source: 'auto', reason: 'Short and easy vs your history' };
  }
  if (zEasy >= 52 || (hr > 0 && hr <= easyHr) || hinted === 'easy') {
    return { category: 'easy', source: 'auto', reason: 'Mostly Z1–Z2 / below your mid HR' };
  }
  if (hr > 0 && hr > Number(baselines.hrP60 || 155)) {
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

  const history = [...labeled].filter((run) => (run.heartrateZones || []).length).slice(0, 28).reverse();
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
    }));
  const easyHrNow = avg(easyHrSeries.slice(-6).map((p) => p.y));
  const easyHrThen = avg(easyHrSeries.slice(0, Math.max(1, easyHrSeries.length - 6)).slice(-6).map((p) => p.y));

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
      runs: rows.slice(0, 8),
    };
  }).filter((group) => group.count > 0);

  return {
    runs: labeled,
    lastRun: labeled[0] || null,
    baselines,
    seasonZonePercents,
    zoneHistory,
    easyHrSeries,
    easyHrNow,
    easyHrThen,
    easyHrDelta: easyHrNow && easyHrThen ? Math.round(easyHrNow - easyHrThen) : null,
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
