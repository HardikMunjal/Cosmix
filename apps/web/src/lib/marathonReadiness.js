export const MARATHON_GOAL_PRESETS = [
  { id: '10k', label: '10K', distanceKm: 10, emoji: '🎯' },
  { id: 'half', label: 'Half marathon', distanceKm: 21.0975, emoji: '🏅' },
  { id: 'full', label: 'Full marathon', distanceKm: 42.195, emoji: '🏆' },
  { id: 'custom', label: 'Custom', distanceKm: 21.1, emoji: '✨' },
];

export function marathonGoalStorageKey(userId) {
  return `cosmix-marathon-goal-${String(userId || 'default')}`;
}

export function loadMarathonGoal(userId) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(marathonGoalStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.raceDate || !parsed?.distanceKm) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

export function saveMarathonGoal(userId, goal) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(marathonGoalStorageKey(userId), JSON.stringify(goal));
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

function formatPace(minPerKm) {
  if (!minPerKm || !Number.isFinite(minPerKm) || minPerKm <= 0) return '--';
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')} /km`;
}

export function buildMarathonReadiness({ runs = [], goalDistanceKm = 21.0975, raceDate, todayIso }) {
  const today = String(todayIso || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const distanceGoal = Math.max(1, Number(goalDistanceKm) || 21.0975);
  const daysUntilRace = raceDate ? daysBetween(today, raceDate) : null;

  const normalizedRuns = (Array.isArray(runs) ? runs : [])
    .filter((r) => Number(r.distance || 0) > 0 && Number(r.minutes || 0) > 0)
    .map((r) => ({
      date: r.date,
      distance: Number(r.distance),
      minutes: Number(r.minutes),
      pace: Number(r.minutes) / Number(r.distance),
      speed: Number(r.distance) / (Number(r.minutes) / 60),
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  if (!normalizedRuns.length) {
    return {
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
      longRunTargetKm: recommendedLongRunKm(distanceGoal),
      insights: ['Log running distance and time in Wellness to unlock your race plan.'],
      planPhases: [],
    };
  }

  const weekAgo = new Date(`${today}T12:00:00`);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);
  const fourWeeksAgo = new Date(`${today}T12:00:00`);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const fourWeeksStr = fourWeeksAgo.toISOString().slice(0, 10);

  const weeklyKmCurrent = normalizedRuns
    .filter((r) => r.date >= weekAgoStr)
    .reduce((sum, r) => sum + r.distance, 0);

  const runsLast4Weeks = normalizedRuns.filter((r) => r.date >= fourWeeksStr);
  const weeklyKm4wk = runsLast4Weeks.reduce((sum, r) => sum + r.distance, 0);
  const sessionsPerWeek = runsLast4Weeks.length / 4;

  const longRunBestKm = Math.max(...normalizedRuns.map((r) => r.distance));
  const weeklyKmTarget = recommendedWeeklyKm(distanceGoal);
  const longRunTargetKm = recommendedLongRunKm(distanceGoal);

  const bestRecent = [...normalizedRuns]
    .filter((r) => r.distance >= Math.min(3, distanceGoal * 0.15))
    .sort((a, b) => a.pace - b.pace)[0]
    || normalizedRuns.sort((a, b) => a.pace - b.pace)[0];

  const referenceKm = bestRecent.distance;
  const referenceMinutes = bestRecent.minutes;
  const predictedFinishMinutes = riegelPredictMinutes(referenceMinutes, referenceKm, distanceGoal);
  const predictedPace = predictedFinishMinutes ? predictedFinishMinutes / distanceGoal : null;

  const avgPace4wk = runsLast4Weeks.length
    ? runsLast4Weeks.reduce((sum, r) => sum + r.pace, 0) / runsLast4Weeks.length
    : bestRecent.pace;

  const marathonPaceEstimate = predictedPace || avgPace4wk * 1.08;
  const sustainableMinutes = 90;
  const sustainableDistanceKm = Math.max(0, sustainableMinutes / marathonPaceEstimate);

  const volumeScore = Math.min(100, Math.round((weeklyKmCurrent / weeklyKmTarget) * 100));
  const longRunScore = Math.min(100, Math.round((longRunBestKm / longRunTargetKm) * 100));
  const consistencyScore = Math.min(100, Math.round((sessionsPerWeek / 3) * 100));
  const timeScore = daysUntilRace == null
    ? 70
    : daysUntilRace > 56
      ? Math.min(100, 40 + (56 / daysUntilRace) * 40)
      : daysUntilRace > 14
        ? 75
        : daysUntilRace > 0
          ? 90
          : 100;

  const readinessPercent = Math.round(
    volumeScore * 0.35
    + longRunScore * 0.35
    + consistencyScore * 0.2
    + timeScore * 0.1,
  );

  let readinessLabel = 'Building base';
  let readinessColor = '#f59e0b';
  if (readinessPercent >= 80) {
    readinessLabel = 'Race ready';
    readinessColor = '#22c55e';
  } else if (readinessPercent >= 55) {
    readinessLabel = 'On track';
    readinessColor = '#38bdf8';
  } else if (readinessPercent >= 30) {
    readinessLabel = 'Gaining momentum';
    readinessColor = '#a78bfa';
  }

  const insights = [];
  if (weeklyKmCurrent < weeklyKmTarget * 0.7) {
    insights.push(`Add ${Math.max(1, Math.round(weeklyKmTarget - weeklyKmCurrent))} km this week to hit your ${weeklyKmTarget} km volume target.`);
  } else {
    insights.push(`Strong week: ${weeklyKmCurrent.toFixed(1)} km logged in the last 7 days.`);
  }
  if (longRunBestKm < longRunTargetKm * 0.65) {
    insights.push(`Long run peak is ${longRunBestKm.toFixed(1)} km — build toward ${longRunTargetKm.toFixed(1)} km before race day.`);
  } else {
    insights.push(`Long-run capacity looks solid at ${longRunBestKm.toFixed(1)} km.`);
  }
  if (predictedFinishMinutes) {
    insights.push(`At current fitness, ${distanceGoal.toFixed(1)} km projects around ${formatRaceTime(predictedFinishMinutes)} (${formatPace(predictedPace)}).`);
  }
  insights.push(`Today you could hold marathon effort for about ${sustainableDistanceKm.toFixed(1)} km (~${formatRaceTime(sustainableMinutes)}).`);

  const planPhases = buildPlanPhases({ daysUntilRace, distanceGoal, weeklyKmCurrent, longRunBestKm, weeklyKmTarget, longRunTargetKm });

  return {
    hasData: true,
    readinessPercent: Math.max(0, Math.min(100, readinessPercent)),
    readinessLabel,
    readinessColor,
    predictedFinishMinutes,
    predictedFinishDisplay: formatRaceTime(predictedFinishMinutes),
    predictedPaceDisplay: formatPace(predictedPace),
    sustainableDistanceKm: Number(sustainableDistanceKm.toFixed(1)),
    sustainableTimeDisplay: formatRaceTime(sustainableMinutes),
    daysUntilRace,
    weeklyKmCurrent: Number(weeklyKmCurrent.toFixed(1)),
    weeklyKmTarget,
    weeklyKm4wk: Number(weeklyKm4wk.toFixed(1)),
    sessionsPerWeek: Number(sessionsPerWeek.toFixed(1)),
    longRunBestKm: Number(longRunBestKm.toFixed(1)),
    longRunTargetKm,
    bestRecent,
    insights,
    planPhases,
    volumeScore,
    longRunScore,
    consistencyScore,
  };
}

function recommendedWeeklyKm(distanceKm) {
  if (distanceKm >= 40) return 55;
  if (distanceKm >= 20) return 38;
  return 24;
}

function recommendedLongRunKm(distanceKm) {
  return Number((distanceKm * 0.78).toFixed(1));
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
