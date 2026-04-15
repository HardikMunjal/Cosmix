export const SCORE_TARGETS = {
  hamptaPass: 90,
  skiing2027: 300,
  marathon10k: 100,
};

export const DAILY_PENALTY = {
  physical: 2.7,
  mental: 1,
};

const SLEEP_BASELINE_HOURS = 6.5;

function sleepScore(sleepHours) {
  const hrs = Number(sleepHours || 0);
  if (hrs === 0) return 0; // not logged
  const diff = hrs - SLEEP_BASELINE_HOURS; // positive = extra, negative = deficit
  return (diff / 0.5) * 0.5; // every 30 min → ±0.5
}

const PHYSICAL_RULES = {
  runningDistanceKm: (value) => Number(value || 0) * 0.9,
  walkingDistanceKm: (value) => Number(value || 0) * 0.3,
  badmintonMinutes: (value) => (Number(value || 0) / 60) * 1.2,
  footballMinutes: (value) => (Number(value || 0) / 60) * 2,
  cricketMinutes: (value) => (Number(value || 0) / 60) * 1.5,
  exerciseMinutes: (value) => (Number(value || 0) / 30) * 0.8,
  swimmingMinutes: (value) => (Number(value || 0) / 30) * 0.7,
  meditationMinutes: (value) => (Number(value || 0) / 30) * 0.2,
  whiskyPegs: (value) => Number(value || 0) * -1.1,
  fastFoodServings: (value) => Number(value || 0) * -0.9,
  sugarServings: (value) => Number(value || 0) * -2,
};

const MENTAL_RULES = {
  runningDistanceKm: (value) => Number(value || 0) * 0.4,
  walkingMinutes: (value) => (Number(value || 0) / 30) * 0.25,
  exerciseMinutes: (value) => (Number(value || 0) / 30) * 0.5,
  badmintonMinutes: (value) => (Number(value || 0) / 30) * 0.5,
  footballMinutes: (value) => (Number(value || 0) / 30) * 0.5,
  cricketMinutes: (value) => (Number(value || 0) / 30) * 0.5,
  swimmingMinutes: (value) => (Number(value || 0) / 30) * 1,
  meditationMinutes: (value) => (Number(value || 0) / 30) * 1.5,
};

export function roundScore(value) {
  return Number(Number(value || 0).toFixed(2));
}

export function getWorkoutMinutes(entry) {
  return Number(entry.runningMinutes || 0)
    + Number(entry.walkingMinutes || 0)
    + Number(entry.exerciseMinutes || 0)
    + Number(entry.badmintonMinutes || 0)
    + Number(entry.footballMinutes || 0)
    + Number(entry.cricketMinutes || 0)
    + Number(entry.swimmingMinutes || 0);
}

export function computeEntryScores(entry) {
  const physicalBase = Object.entries(PHYSICAL_RULES).reduce((sum, [key, calculator]) => sum + calculator(entry[key]), 0);
  const mentalBase = Object.entries(MENTAL_RULES).reduce((sum, [key, calculator]) => sum + calculator(entry[key]), 0);

  // sleep bonus/penalty (0 if not logged)
  const sleepPhysical = sleepScore(entry.sleepHours);
  const sleepMental = sleepScore(entry.sleepHours);

  // daily penalties always apply — office drains mental, body decays without activity
  const physicalPenalty = DAILY_PENALTY.physical;
  const mentalPenalty = DAILY_PENALTY.mental;

  const physicalScore = roundScore(physicalBase + sleepPhysical - physicalPenalty);
  const mentalScore = roundScore(mentalBase + sleepMental - mentalPenalty);

  return {
    physicalScore,
    mentalScore,
    totalScore: roundScore(physicalScore + mentalScore),
    physicalPenalty: roundScore(physicalPenalty),
    mentalPenalty: roundScore(mentalPenalty),
    sleepPhysical: roundScore(sleepPhysical),
    sleepMental: roundScore(sleepMental),
    workoutMinutes: getWorkoutMinutes(entry),
  };
}

export function computeDashboardStats(entries, currentEntry) {
  const rows = [currentEntry, ...entries.filter((entry) => entry.date !== currentEntry.date)].slice(0, 14);
  const weekRows = rows.slice(0, 7);

  const weeklyRunningKm = weekRows.reduce((sum, entry) => sum + Number(entry.runningDistanceKm || 0), 0);
  const weeklyWorkoutMinutes = weekRows.reduce((sum, entry) => sum + getWorkoutMinutes(entry), 0);
  const totalRunningMinutes = weekRows.reduce((sum, entry) => sum + Number(entry.runningMinutes || 0), 0);
  const averagePace = weeklyRunningKm > 0 ? totalRunningMinutes / weeklyRunningKm : null;
  const activeDays = weekRows.filter((entry) => getWorkoutMinutes(entry) > 0).length;
  const scoredRows = rows.map((entry) => ({ entry, scores: computeEntryScores(entry) }));
  const totalPhysicalScore = scoredRows.reduce((sum, row) => sum + row.scores.physicalScore, 0);
  const totalMentalScore = scoredRows.reduce((sum, row) => sum + row.scores.mentalScore, 0);
  const totalBodyScore = roundScore(totalPhysicalScore + totalMentalScore);

  return {
    todayScores: computeEntryScores(currentEntry),
    weeklyRunningKm: roundScore(weeklyRunningKm),
    weeklyWorkoutMinutes: roundScore(weeklyWorkoutMinutes),
    averagePace: averagePace == null ? null : roundScore(averagePace),
    activeDays,
    totalPhysicalScore: roundScore(totalPhysicalScore),
    totalMentalScore: roundScore(totalMentalScore),
    totalBodyScore,
    readiness: {
      hamptaPass: buildReadiness(totalBodyScore, SCORE_TARGETS.hamptaPass),
      skiing2027: buildReadiness(totalBodyScore, SCORE_TARGETS.skiing2027),
      marathon10k: buildReadiness(totalBodyScore, SCORE_TARGETS.marathon10k),
    },
  };
}

function buildReadiness(currentScore, targetScore) {
  return {
    targetScore,
    currentScore: roundScore(currentScore),
    percent: Math.max(0, Math.min(100, roundScore((currentScore / targetScore) * 100))),
    remaining: roundScore(Math.max(0, targetScore - currentScore)),
  };
}