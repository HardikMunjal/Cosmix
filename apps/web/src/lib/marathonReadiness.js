export const MARATHON_GOAL_PRESETS = [
  { id: '10k', label: '10K', distanceKm: 10, emoji: '🎯' },
  { id: 'half', label: 'Half marathon', distanceKm: 21.1, emoji: '🏅' },
  { id: 'full', label: 'Full marathon', distanceKm: 42.2, emoji: '🏆' },
  { id: 'custom', label: 'Custom', distanceKm: 21.1, emoji: '✨' },
];

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function marathonGoalStorageKey(userId) {
  return `cosmix-marathon-goal-${String(userId || 'default')}`;
}

export function distanceLabel(km) {
  const value = Number(km) || 0;
  if (Math.abs(value - 42.195) < 0.7 || Math.abs(value - 42.5) < 0.4) return 'Full marathon';
  if (Math.abs(value - 21.0975) < 0.4 || Math.abs(value - 21.2) < 0.25) return 'Half marathon';
  if (Math.abs(value - 10) < 0.35) return '10K';
  if (value > 0) return `${value.toFixed(1)} km`;
  return 'Race';
}

function inferPresetId(km) {
  const value = Number(km) || 0;
  if (Math.abs(value - 42.195) < 0.7 || Math.abs(value - 42.5) < 0.4) return 'full';
  if (Math.abs(value - 21.0975) < 0.4 || Math.abs(value - 21.2) < 0.25) return 'half';
  if (Math.abs(value - 10) < 0.35) return '10k';
  return 'custom';
}

function newGoalId() {
  return `goal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function addDays(iso, days) {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function normalizeRaceGoal(raw, today = todayIso()) {
  const distanceKm = Number(raw?.distanceKm || 0);
  const raceDate = String(raw?.raceDate || '').slice(0, 10);
  if (!(distanceKm > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(raceDate)) return null;
  const past = raceDate < today;
  const status = raw?.status === 'completed' || past ? 'completed' : 'active';
  return {
    id: String(raw?.id || newGoalId()),
    presetId: raw?.presetId || inferPresetId(distanceKm),
    distanceKm,
    raceDate,
    status,
    startedAt: String(raw?.startedAt || '').slice(0, 10) || null,
    completedAt: status === 'completed' ? (String(raw?.completedAt || raceDate).slice(0, 10)) : null,
  };
}

function parseGoalBook(parsed, today = todayIso()) {
  if (!parsed || typeof parsed !== 'object') return { goals: [] };
  const isLegacySingle = !Array.isArray(parsed.goals) && parsed.raceDate && parsed.distanceKm;
  const dropLegacyFull = isLegacySingle && !parsed.id && inferPresetId(parsed.distanceKm) === 'full';
  const list = Array.isArray(parsed.goals)
    ? parsed.goals
    : (isLegacySingle && !dropLegacyFull ? [parsed] : []);
  const goals = [];
  const seen = new Set();
  list.forEach((item) => {
    const goal = normalizeRaceGoal(item, today);
    if (!goal) return;
    const key = `${goal.raceDate}:${Number(goal.distanceKm).toFixed(1)}`;
    if (seen.has(key) || seen.has(goal.id)) return;
    seen.add(key);
    seen.add(goal.id);
    goals.push(goal);
  });
  goals.sort((a, b) => String(b.raceDate).localeCompare(String(a.raceDate)));
  return { goals };
}

export function loadRaceGoalBook(userId) {
  if (typeof window === 'undefined') return { goals: [] };
  try {
    const raw = localStorage.getItem(marathonGoalStorageKey(userId));
    if (!raw) return { goals: [] };
    return parseGoalBook(JSON.parse(raw));
  } catch (_) {
    return { goals: [] };
  }
}

export function saveRaceGoalBook(userId, book) {
  if (typeof window === 'undefined' || !userId) return { goals: [] };
  const next = parseGoalBook(book || { goals: [] });
  localStorage.setItem(marathonGoalStorageKey(userId), JSON.stringify(next));
  return next;
}

export async function persistRaceGoals(userId, book) {
  const next = saveRaceGoalBook(userId, book);
  if (typeof window === 'undefined' || !userId) return next;
  try {
    const { wellnessApiUrl, isWellnessApiReady } = await import('./runningShoes');
    if (!isWellnessApiReady()) return next;
    await fetch(wellnessApiUrl(`/wellness/training/${encodeURIComponent(userId)}/goals`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goals: next.goals || [] }),
    });
  } catch (_) { /* local book still applies */ }
  return next;
}

export function getActiveGoal(book, today = todayIso()) {
  return (book?.goals || [])
    .filter((goal) => goal.status === 'active' && String(goal.raceDate) >= today)
    .sort((a, b) => String(a.raceDate).localeCompare(String(b.raceDate)))[0] || null;
}

export function getLatestCompletedGoal(book) {
  return (book?.goals || [])
    .filter((goal) => goal.status === 'completed')
    .sort((a, b) => String(b.raceDate).localeCompare(String(a.raceDate)))[0] || null;
}

/** Old single-goal helper — only returns a still-upcoming goal. */
export function loadMarathonGoal(userId) {
  return getActiveGoal(loadRaceGoalBook(userId));
}

export function saveMarathonGoal(userId, goal) {
  if (!userId) return null;
  const today = todayIso();
  const book = loadRaceGoalBook(userId);
  const incoming = normalizeRaceGoal({
    ...goal,
    id: goal?.id || newGoalId(),
    status: goal?.status || (String(goal?.raceDate || '') < today ? 'completed' : 'active'),
  }, today);
  if (!incoming) return getActiveGoal(book, today);

  const others = (book.goals || []).filter((item) => item.id !== incoming.id);
  if (incoming.status === 'active') {
    others.forEach((item) => {
      if (item.status === 'active') {
        item.status = 'completed';
        item.completedAt = item.completedAt || today;
      }
    });
    const previous = others
      .filter((item) => item.status === 'completed')
      .sort((a, b) => String(b.raceDate).localeCompare(String(a.raceDate)))[0];
    if (!incoming.startedAt) {
      incoming.startedAt = previous ? addDays(previous.raceDate, 1) : today;
    }
  }
  const next = saveRaceGoalBook(userId, { goals: [incoming, ...others] });
  void persistRaceGoals(userId, next);
  return getActiveGoal(next, today);
}

export function mergeRaceGoalBooks(...books) {
  const today = todayIso();
  const goals = [];
  books.forEach((book) => {
    (book?.goals || []).forEach((item) => {
      const goal = normalizeRaceGoal(item, today);
      if (goal) goals.push(goal);
    });
  });
  return parseGoalBook({ goals }, today);
}

function isInferredGoalId(id) {
  return String(id || '').startsWith('inferred');
}

function dedupeGoals(goals = []) {
  const ranked = [...(goals || [])].sort((a, b) => {
    const ai = isInferredGoalId(a.id) ? 1 : 0;
    const bi = isInferredGoalId(b.id) ? 1 : 0;
    return ai - bi;
  });
  const out = [];
  ranked.forEach((goal) => {
    const clash = out.find((item) => (
      item.raceDate === goal.raceDate
      && Math.abs(Number(item.distanceKm) - Number(goal.distanceKm)) < 1.6
    ));
    if (!clash) out.push(goal);
  });
  return out.sort((a, b) => String(b.raceDate).localeCompare(String(a.raceDate)));
}

export function inferCompletedGoalsFromRuns() {
  return [];
}

export function ensureRaceGoalBook(userId, runs = [], serverGoals = []) {
  const today = todayIso();
  const previous = loadRaceGoalBook(userId);
  const merged = mergeRaceGoalBooks(
    { goals: serverGoals },
    previous,
  );
  const completed = merged.goals.map((goal) => {
    if (goal.status === 'active' && goal.raceDate < today) {
      return { ...goal, status: 'completed', completedAt: goal.completedAt || goal.raceDate };
    }
    return goal;
  });
  const real = completed.filter((goal) => !isInferredGoalId(goal.id));
  const goals = dedupeGoals(real.length ? real : completed);
  const next = saveRaceGoalBook(userId, { goals });
  const changed = JSON.stringify(previous.goals || []) !== JSON.stringify(next.goals || []);
  if (changed) void persistRaceGoals(userId, next);
  return next;
}

export function pickSelectedGoal(book, selectedId) {
  const goals = book?.goals || [];
  return goals.find((goal) => goal.id === selectedId)
    || getActiveGoal(book)
    || getLatestCompletedGoal(book)
    || goals[0]
    || null;
}

export function runsForSelectedGoal(runs = [], goal, allGoals = []) {
  if (!goal) return runs || [];
  const blocks = buildGoalTrainingBlocks({
    goals: (allGoals || []).length ? allGoals : [goal],
    runs,
  });
  const block = blocks.find((item) => item.id === goal.id);
  return block?.runs || [];
}

function avg(values) {
  const rows = (values || []).filter((n) => Number.isFinite(n) && n > 0);
  if (!rows.length) return null;
  return rows.reduce((sum, n) => sum + n, 0) / rows.length;
}

export function runsInWindow(runs = [], start, end) {
  const from = String(start || '0000-01-01').slice(0, 10);
  const to = String(end || '9999-12-31').slice(0, 10);
  return (runs || []).filter((run) => {
    const date = String(run.date || '').slice(0, 10);
    return date >= from && date <= to && Number(run.distance || 0) > 0;
  });
}

export function summarizeGoalTraining(runs = []) {
  const rows = (runs || []).filter((run) => Number(run.distance || 0) > 0);
  const km = rows.reduce((sum, run) => sum + Number(run.distance || 0), 0);
  const paces = rows
    .filter((run) => Number(run.minutes || 0) > 0 && Number(run.distance || 0) > 0)
    .map((run) => Number(run.minutes) / Number(run.distance));
  const hrs = rows.map((run) => Number(run.avgHeartrate || run.avgHeartRate || 0)).filter((n) => n > 80);
  const minutes = rows.reduce((sum, run) => sum + Number(run.minutes || 0), 0);
  const speeds = rows
    .filter((run) => Number(run.minutes || 0) > 0 && Number(run.distance || 0) > 0)
    .map((run) => Number(run.distance) / (Number(run.minutes) / 60));
  return {
    runCount: rows.length,
    km: Math.round(km * 10) / 10,
    avgPace: avg(paces),
    avgSpeed: avg(speeds),
    avgHeartrate: avg(hrs) ? Math.round(avg(hrs)) : null,
    minutes: Math.round(minutes),
  };
}

export function buildGoalTrainingBlocks({ goals = [], runs = [], today = todayIso() } = {}) {
  const ordered = [...(goals || [])].sort((a, b) => String(a.raceDate).localeCompare(String(b.raceDate)));
  const blocks = ordered.map((goal, index) => {
    const previous = ordered[index - 1];
    const start = goal.startedAt || (previous ? addDays(previous.raceDate, 1) : addDays(goal.raceDate, -112));
    const end = goal.status === 'completed' ? (goal.completedAt || goal.raceDate) : today;
    const windowRuns = runsInWindow(runs, start, end);
    const preset = MARATHON_GOAL_PRESETS.find((item) => item.id === goal.presetId);
    return {
      ...goal,
      start,
      end,
      label: distanceLabel(goal.distanceKm),
      emoji: preset?.emoji || (goal.status === 'completed' ? '🏅' : '🏁'),
      stats: summarizeGoalTraining(windowRuns),
      runs: windowRuns,
    };
  });
  return blocks.sort((a, b) => String(b.raceDate).localeCompare(String(a.raceDate)));
}

function daysBetween(fromIso, toIso) {
  const from = new Date(`${String(fromIso).slice(0, 10)}T12:00:00`);
  const to = new Date(`${String(toIso).slice(0, 10)}T12:00:00`);
  return Math.max(0, Math.round((to - from) / (1000 * 60 * 60 * 24)));
}

function riegelPredictMinutes(baseMinutes, baseKm, targetKm) {
  if (!baseMinutes || !baseKm || !targetKm || baseKm <= 0) return null;
  return baseMinutes * ((targetKm / baseKm) ** 1.06);
}

function formatRaceTime(totalMinutes) {
  if (!totalMinutes || !Number.isFinite(totalMinutes) || totalMinutes <= 0) return '--';
  const mins = Math.round(totalMinutes);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
}

export function formatGoalPace(minPerKm) {
  if (!minPerKm || !Number.isFinite(minPerKm) || minPerKm <= 0) return '--';
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')} /km`;
}

/** Peak long-run needed before race day (≈80–85% of race). */
function recommendedLongRunKm(distanceKm) {
  return Number((distanceKm * 0.82).toFixed(1));
}

function recommendedWeeklyKm(distanceKm) {
  if (distanceKm >= 40) return 55;
  if (distanceKm >= 20) return 38;
  return 24;
}

/**
 * Race fitness readiness — distance-first, with hard gates.
 * A 12 km peak for a 21.1 km half cannot look "on track" near 80%.
 */
export function buildMarathonReadiness({ runs = [], goalDistanceKm, raceDate, todayIso, sinceDate } = {}) {
  const today = String(todayIso || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const distanceGoal = Number(goalDistanceKm);
  const daysUntilRace = raceDate ? daysBetween(today, raceDate) : null;
  const fromDate = String(sinceDate || '').slice(0, 10);

  const normalizedRuns = (Array.isArray(runs) ? runs : [])
    .filter((r) => Number(r.distance || 0) > 0 && Number(r.minutes || 0) > 0)
    .filter((r) => !fromDate || String(r.date || '').slice(0, 10) >= fromDate)
    .map((r) => ({
      date: r.date,
      distance: Number(r.distance),
      minutes: Number(r.minutes),
      pace: Number(r.minutes) / Number(r.distance),
      speed: Number(r.distance) / (Number(r.minutes) / 60),
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  if (!(distanceGoal > 0)) {
    return {
      hasData: false,
      needsGoal: true,
      readinessPercent: 0,
      readinessLabel: 'Select a race goal',
      readinessColor: '#94a3b8',
      predictedFinishDisplay: '--',
      predictedPaceDisplay: '--',
      sustainableDistanceKm: 0,
      daysUntilRace: null,
      weeklyKmCurrent: 0,
      weeklyKmTarget: 0,
      longRunTargetKm: 0,
      insights: ['Pick your next race distance first. Past training stays attached to the goal you already finished.'],
      planPhases: [],
    };
  }

  const empty = {
    hasData: false,
    readinessPercent: 0,
    readinessLabel: 'Start logging runs',
    readinessColor: '#94a3b8',
    predictedFinishMinutes: null,
    predictedFinishDisplay: '--',
    predictedPaceDisplay: '--',
    sustainableDistanceKm: 0,
    sustainableTimeDisplay: '--',
    daysUntilRace,
    weeklyKmCurrent: 0,
    weeklyKmTarget: recommendedWeeklyKm(distanceGoal),
    longRunBestKm: 0,
    longRunRecentKm: 0,
    longRunTargetKm: recommendedLongRunKm(distanceGoal),
    distanceRatio: 0,
    insights: ['Log running distance and time in Wellness to unlock your race plan.'],
    planPhases: [],
    volumeScore: 0,
    longRunScore: 0,
    paceScore: 0,
    consistencyScore: 0,
    timeScore: 0,
  };

  if (!normalizedRuns.length) return empty;

  const weekAgo = new Date(`${today}T12:00:00`);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);
  const eightWeeksAgo = new Date(`${today}T12:00:00`);
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
  const eightWeeksStr = eightWeeksAgo.toISOString().slice(0, 10);
  const fourWeeksAgo = new Date(`${today}T12:00:00`);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const fourWeeksStr = fourWeeksAgo.toISOString().slice(0, 10);

  const weeklyKmCurrent = normalizedRuns
    .filter((r) => r.date >= weekAgoStr)
    .reduce((sum, r) => sum + r.distance, 0);

  const runsLast8Weeks = normalizedRuns.filter((r) => r.date >= eightWeeksStr);
  const runsLast4Weeks = normalizedRuns.filter((r) => r.date >= fourWeeksStr);
  const weeklyKm4wk = runsLast4Weeks.reduce((sum, r) => sum + r.distance, 0);
  const sessionsPerWeek = runsLast4Weeks.length / 4;

  const longRunBestKm = Math.max(...normalizedRuns.map((r) => r.distance));
  const longRunRecentKm = runsLast8Weeks.length
    ? Math.max(...runsLast8Weeks.map((r) => r.distance))
    : longRunBestKm;
  const weeklyKmTarget = recommendedWeeklyKm(distanceGoal);
  const longRunTargetKm = recommendedLongRunKm(distanceGoal);
  const distanceRatio = longRunRecentKm / distanceGoal;

  const bestRecent = [...normalizedRuns]
    .filter((r) => r.distance >= Math.min(3, distanceGoal * 0.15))
    .sort((a, b) => a.pace - b.pace)[0]
    || normalizedRuns[0];

  const predictedFinishMinutes = riegelPredictMinutes(bestRecent.minutes, bestRecent.distance, distanceGoal);
  const predictedPace = predictedFinishMinutes ? predictedFinishMinutes / distanceGoal : null;
  const avgPace4wk = runsLast4Weeks.length
    ? runsLast4Weeks.reduce((sum, r) => sum + r.pace, 0) / runsLast4Weeks.length
    : bestRecent.pace;
  const marathonPaceEstimate = predictedPace || avgPace4wk * 1.08;
  const sustainableMinutes = 90;
  const sustainableDistanceKm = Math.max(0, sustainableMinutes / marathonPaceEstimate);

  // Distance: nonlinear — 12/21 ≈ 57% raw → much lower after power curve.
  const distanceRaw = Math.min(1, longRunRecentKm / longRunTargetKm);
  const longRunScore = Math.min(100, Math.round((distanceRaw ** 1.35) * 100));

  // Pace: reward holding a solid long-run pace (not just short sprints).
  const longRuns = runsLast8Weeks.filter((r) => r.distance >= Math.max(5, distanceGoal * 0.25));
  const longPace = longRuns.length
    ? longRuns.reduce((sum, r) => sum + r.pace, 0) / longRuns.length
    : avgPace4wk;
  // Rough half-marathon "building" band: faster than ~7:30 is strong; slower than ~9:30 is early base.
  let paceScore = 55;
  if (longPace > 0) {
    if (longPace <= 5.5) paceScore = 95;
    else if (longPace <= 6.5) paceScore = 85;
    else if (longPace <= 7.5) paceScore = 72;
    else if (longPace <= 8.5) paceScore = 58;
    else if (longPace <= 9.5) paceScore = 42;
    else paceScore = 28;
  }

  const volumeScore = Math.min(100, Math.round((weeklyKmCurrent / weeklyKmTarget) * 100));
  const consistencyScore = Math.min(100, Math.round((sessionsPerWeek / 3) * 100));
  const timeScore = daysUntilRace == null
    ? 55
    : daysUntilRace > 56
      ? Math.min(70, 35 + (56 / daysUntilRace) * 35)
      : daysUntilRace > 14
        ? 65
        : daysUntilRace > 0
          ? 80
          : 90;

  let readinessPercent = Math.round(
    longRunScore * 0.42
    + paceScore * 0.28
    + volumeScore * 0.15
    + consistencyScore * 0.1
    + timeScore * 0.05,
  );

  // Hard gates: distance-first. A ~12 km peak for a 21 km half must stay well below "on track".
  if (distanceRatio < 0.40) readinessPercent = Math.min(readinessPercent, 22);
  else if (distanceRatio < 0.50) readinessPercent = Math.min(readinessPercent, 32);
  else if (distanceRatio < 0.60) readinessPercent = Math.min(readinessPercent, 42);
  else if (distanceRatio < 0.70) readinessPercent = Math.min(readinessPercent, 52);
  else if (distanceRatio < 0.80) readinessPercent = Math.min(readinessPercent, 64);
  else if (distanceRatio < 0.90) readinessPercent = Math.min(readinessPercent, 74);

  readinessPercent = Math.max(0, Math.min(100, readinessPercent));

  let readinessLabel = 'Building base';
  let readinessColor = '#f59e0b';
  if (readinessPercent >= 82) {
    readinessLabel = 'Race ready';
    readinessColor = '#22c55e';
  } else if (readinessPercent >= 68) {
    readinessLabel = 'On track';
    readinessColor = '#38bdf8';
  } else if (readinessPercent >= 40) {
    readinessLabel = 'Gaining momentum';
    readinessColor = '#a78bfa';
  }

  const insights = [];
  const kmToGo = Math.max(0, longRunTargetKm - longRunRecentKm);
  if (distanceRatio < 0.65) {
    insights.push(
      `Peak long run (8 weeks): ${longRunRecentKm.toFixed(1)} km — only ${Math.round(distanceRatio * 100)}% of your ${distanceGoal.toFixed(1)} km race. Build toward ~${longRunTargetKm} km (${kmToGo.toFixed(1)} km to go).`,
    );
  } else {
    insights.push(`Recent long-run peak ${longRunRecentKm.toFixed(1)} km is approaching race distance.`);
  }
  if (paceScore < 55) {
    insights.push(`Long-run pace ~${formatGoalPace(longPace)} is still early base — race fitness needs steadier speed, not just volume.`);
  }
  if (weeklyKmCurrent < weeklyKmTarget * 0.7) {
    insights.push(`Add ~${Math.max(1, Math.round(weeklyKmTarget - weeklyKmCurrent))} km this week toward ${weeklyKmTarget} km volume.`);
  }
  if (predictedFinishMinutes) {
    insights.push(`At current fitness, finish projects ~${formatRaceTime(predictedFinishMinutes)} (${formatGoalPace(predictedPace)}).`);
  }

  const planPhases = buildPlanPhases({
    daysUntilRace,
    distanceGoal,
    weeklyKmCurrent,
    longRunBestKm: longRunRecentKm,
    weeklyKmTarget,
    longRunTargetKm,
  });

  return {
    hasData: true,
    readinessPercent,
    readinessLabel,
    readinessColor,
    predictedFinishMinutes,
    predictedFinishDisplay: formatRaceTime(predictedFinishMinutes),
    predictedPaceDisplay: formatGoalPace(predictedPace),
    sustainableDistanceKm: Number(sustainableDistanceKm.toFixed(1)),
    sustainableTimeDisplay: formatRaceTime(sustainableMinutes),
    daysUntilRace,
    weeklyKmCurrent: Number(weeklyKmCurrent.toFixed(1)),
    weeklyKmTarget,
    weeklyKm4wk: Number(weeklyKm4wk.toFixed(1)),
    sessionsPerWeek: Number(sessionsPerWeek.toFixed(1)),
    longRunBestKm: Number(longRunBestKm.toFixed(1)),
    longRunRecentKm: Number(longRunRecentKm.toFixed(1)),
    longRunTargetKm,
    distanceRatio: Number(distanceRatio.toFixed(2)),
    bestRecent,
    insights,
    planPhases,
    volumeScore,
    longRunScore,
    paceScore,
    consistencyScore,
    timeScore,
  };
}

function buildPlanPhases({ daysUntilRace, distanceGoal, weeklyKmCurrent, longRunBestKm, weeklyKmTarget, longRunTargetKm }) {
  const weeks = daysUntilRace == null ? 8 : Math.max(1, Math.ceil(daysUntilRace / 7));
  if (weeks <= 2) {
    return [
      { title: 'Taper week', detail: 'Reduce volume 30–40%, keep one short tempo, rest 2 days before race.', accent: '#22c55e' },
      { title: 'Race week', detail: `Target ${distanceGoal.toFixed(1)} km — start controlled, fuel early, finish strong.`, accent: '#f59e0b' },
    ];
  }
  const phases = [];
  if (weeks >= 6) {
    phases.push({
      title: 'Base phase',
      detail: `Build to ${weeklyKmTarget} km/week with 3–4 easy runs.`,
      accent: '#38bdf8',
    });
  }
  phases.push({
    title: 'Build phase',
    detail: `Progress long run from ${Math.max(longRunBestKm, 8).toFixed(0)} km toward ${longRunTargetKm} km.`,
    accent: '#a78bfa',
  });
  phases.push({
    title: 'Sharpen',
    detail: 'Add one tempo or interval session weekly; keep easy days truly easy.',
    accent: '#fb7185',
  });
  phases.push({
    title: 'Taper',
    detail: `Cut volume 25% in final 10 days — arrive fresh for ${distanceGoal.toFixed(1)} km.`,
    accent: '#22c55e',
  });
  if (weeklyKmCurrent < weeklyKmTarget * 0.5) {
    phases.unshift({
      title: 'Kickstart',
      detail: `Raise weekly volume by 10–15% until you reach ${weeklyKmTarget} km/week.`,
      accent: '#f97316',
    });
  }
  return phases.slice(0, 5);
}
